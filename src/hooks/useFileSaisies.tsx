import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DialogueDeconnexion } from "~/components/app/hors-ligne/DialogueDeconnexion";
import { useAuth } from "~/lib/auth";
import { cles } from "~/lib/donnees";
import { MagasinFile, type NouvelleSaisie, type SaisieEnAttente, stockageParDefaut } from "~/lib/hors-ligne/file";
import { clientSupabase } from "~/lib/hors-ligne/client";
import {
  appliquerResultat,
  type BilanSynchro,
  type ClientSaisies,
  envoyerSaisie,
  remplacerSaisie,
  type ResultatEnvoi,
  synchroniserFile,
} from "~/lib/hors-ligne/synchro";
import { useOrg } from "./useContexteOrg";

/** Intervalle des nouvelles tentatives tant que des saisies attendent et que le navigateur se dit en ligne. */
const INTERVALLE_RELANCE_MS = 30_000;
/**
 * Plus court quand le dernier passage a été arrêté (réseau instable, jeton pas encore renouvelé) : supabase-js garde un
 * échec de renouvellement pendant une minute, et une tentative qui tombe dans ce délai ne coûte aucune requête.
 */
const INTERVALLE_RELANCE_BLOQUEE_MS = 10_000;
/** Temps qu'une saisie tapée attend la réponse de la base avant d'être annoncée « gardée sur l'appareil ». */
export const DELAI_INTERACTIF_MS = 8000;

export type ResultatEnregistrement =
  | { type: "envoyee" }
  /** Gardée sur l'appareil : réseau absent, délai dépassé, ou erreur passagère du serveur. L'envoi sera repris. */
  | { type: "en_file" }
  /** L'appareil refuse de garder la saisie (stockage plein ou bloqué) : rien n'a été enregistré. */
  | { type: "stockage" }
  | { type: "refusee"; cle: string; erreur: unknown }
  | { type: "conflit"; valeurServeur: number };

type ValeurFile = {
  saisies: SaisieEnAttente[];
  stockageDisponible: boolean;
  enLigne: boolean;
  synchronisation: boolean;
  /** Pourquoi le dernier passage s'est arrêté avant la fin, le cas échéant. */
  arret: BilanSynchro["arret"];
  enregistrer: (saisie: SaisieDeLecran) => Promise<ResultatEnregistrement>;
  synchroniser: () => Promise<void>;
  retirer: (id: string) => void;
  /** Résout un conflit : la valeur de l'appareil remplace celle qui est en place. */
  remplacerParLaMienne: (id: string) => Promise<ResultatEnvoi>;
  /** Déconnexion : la demande est bloquée tant que des saisies n'ont ni été envoyées ni été supprimées. */
  demanderDeconnexion: () => void;
};

/** Ce que l'écran de saisie fournit ; le compte et l'organisation viennent du fournisseur. */
export type SaisieDeLecran = Omit<NouvelleSaisie, "utilisateurId" | "orgId">;

const Contexte = createContext<ValeurFile | null>(null);

function abonnerReseau(rappel: () => void) {
  window.addEventListener("online", rappel);
  window.addEventListener("offline", rappel);
  return () => {
    window.removeEventListener("online", rappel);
    window.removeEventListener("offline", rappel);
  };
}
const lireReseau = () => navigator.onLine;
const reseauServeur = () => true;

/** Le navigateur se dit-il en ligne ? (Un signal optimiste : l'envoi reste tenté et reconnaît lui-même l'échec.) */
export function useEnLigne(): boolean {
  return useSyncExternalStore(abonnerReseau, lireReseau, reseauServeur);
}

export function FileSaisiesProvider({
  children,
  magasin: magasinFourni,
  client: clientFourni,
}: {
  children: ReactNode;
  /** Pour les tests : un magasin et une base factices. */
  magasin?: MagasinFile;
  client?: ClientSaisies;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const { utilisateur, seDeconnecter } = useAuth();
  const queryClient = useQueryClient();
  const utilisateurId = utilisateur?.id ?? "";
  const orgId = org.organisation.id;
  const enLigne = useEnLigne();

  const magasin = useMemo(
    () => magasinFourni ?? new MagasinFile(stockageParDefaut(), utilisateurId),
    [magasinFourni, utilisateurId],
  );
  const db = useMemo(() => clientFourni ?? clientSupabase(), [clientFourni]);
  const saisies = useSyncExternalStore(magasin.abonner, magasin.lister, magasin.lister);

  const [synchronisation, setSynchronisation] = useState(false);
  const [arret, setArret] = useState<BilanSynchro["arret"]>(null);
  const [deconnexionDemandee, setDeconnexionDemandee] = useState(false);
  const enCours = useRef(false);
  // Les saisies en cours d'envoi par `enregistrer` : l'envoi automatique, déclenché par leur arrivée dans la file, ne les double pas.
  const enVol = useRef(new Set<string>());

  const rafraichir = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["saisies"] });
    void queryClient.invalidateQueries({ queryKey: cles.orgSaisies(orgId) });
    void queryClient.invalidateQueries({ queryKey: cles.avancements(orgId) });
    void queryClient.invalidateQueries({ queryKey: cles.avancementsProgrammes(orgId) });
  }, [queryClient, orgId]);

  const synchroniser = useCallback(async () => {
    if (enCours.current || magasin.lister().every((s) => s.statut !== "attente" || enVol.current.has(s.id))) return;
    enCours.current = true;
    setSynchronisation(true);
    try {
      const bilan = await synchroniserFile(db, magasin, enVol.current);
      setArret(bilan.arret);
      if (bilan.envoyees > 0) {
        rafraichir();
        toast.success(t("horsligne.envoyees", { count: bilan.envoyees }));
      }
    } finally {
      enCours.current = false;
      setSynchronisation(false);
    }
  }, [db, magasin, rafraichir, t]);

  const enregistrer = useCallback(
    async (nouvelle: SaisieDeLecran): Promise<ResultatEnregistrement> => {
      let saisie: SaisieEnAttente;
      try {
        // D'abord sur l'appareil : si l'onglet se ferme en pleine requête, la saisie n'est pas perdue.
        saisie = magasin.ajouter({ ...nouvelle, utilisateurId: magasin.utilisateurId, orgId });
      } catch {
        return { type: "stockage" };
      }
      if (!navigator.onLine) return { type: "en_file" };
      enVol.current.add(saisie.id);
      const envoi = envoyerSaisie(db, saisie).finally(() => enVol.current.delete(saisie.id));
      let minuterie: ReturnType<typeof setTimeout> | undefined;
      const lent = Symbol("lent");
      const premier = await Promise.race([
        envoi,
        new Promise<typeof lent>((resolve) => {
          minuterie = setTimeout(() => resolve(lent), DELAI_INTERACTIF_MS);
        }),
      ]);
      clearTimeout(minuterie);
      if (premier === lent) {
        // Réseau annoncé mais lent ou injoignable : la saisie reste dans la file et l'envoi en cours se termine en arrière-plan.
        void envoi
          .then((r) => {
            if (appliquerResultat(magasin, saisie, r)) rafraichir();
          })
          .catch(() => undefined);
        return { type: "en_file" };
      }
      const resultat = premier;
      if (resultat.type === "refusee" || resultat.type === "conflit") {
        // Une saisie qu'on vient de taper et que la base refuse ne doit pas rester dans la file : l'écran le dit.
        magasin.retirer(saisie.id);
        return resultat.type === "refusee"
          ? { type: "refusee", cle: resultat.cle, erreur: resultat.erreur }
          : { type: "conflit", valeurServeur: resultat.valeurServeur };
      }
      if (appliquerResultat(magasin, saisie, resultat)) {
        rafraichir();
        // La connexion marche : les saisies plus anciennes qui attendaient partent à leur tour.
        void synchroniser();
        return { type: "envoyee" };
      }
      return { type: "en_file" };
    },
    [db, magasin, orgId, rafraichir, synchroniser],
  );

  const retirer = useCallback((id: string) => magasin.retirer(id), [magasin]);

  const remplacerParLaMienne = useCallback(
    async (id: string) => {
      const saisie = magasin.lire(id);
      if (!saisie) return { type: "envoyee" } as const;
      const resultat = await remplacerSaisie(db, saisie);
      if (resultat.type === "envoyee") {
        magasin.retirer(id);
        rafraichir();
      } else if (resultat.type === "refusee") {
        magasin.modifier(id, { statut: "refusee", erreurCle: resultat.cle });
      }
      return resultat;
    },
    [db, magasin, rafraichir],
  );

  // Envoi automatique : à l'ouverture, au retour du réseau, au retour sur l'onglet, puis toutes les 30 s tant que ça attend.
  const attente = saisies.some((s) => s.statut === "attente");
  useEffect(() => {
    if (!attente) return;
    if (navigator.onLine) void synchroniser();
    const surRetour = () => void synchroniser();
    const surVisibilite = () => {
      if (document.visibilityState === "visible") void synchroniser();
    };
    window.addEventListener("online", surRetour);
    document.addEventListener("visibilitychange", surVisibilite);
    const minuterie = setInterval(
      () => {
        if (navigator.onLine) void synchroniser();
      },
      arret ? INTERVALLE_RELANCE_BLOQUEE_MS : INTERVALLE_RELANCE_MS,
    );
    return () => {
      window.removeEventListener("online", surRetour);
      document.removeEventListener("visibilitychange", surVisibilite);
      clearInterval(minuterie);
    };
  }, [attente, arret, synchroniser]);

  const demanderDeconnexion = useCallback(() => {
    if (magasin.lister().length === 0) void seDeconnecter();
    else setDeconnexionDemandee(true);
  }, [magasin, seDeconnecter]);

  const valeur = useMemo<ValeurFile>(
    () => ({
      saisies,
      stockageDisponible: magasin.disponible,
      enLigne,
      synchronisation,
      arret,
      enregistrer,
      synchroniser,
      retirer,
      remplacerParLaMienne,
      demanderDeconnexion,
    }),
    [
      saisies,
      magasin.disponible,
      enLigne,
      synchronisation,
      arret,
      enregistrer,
      synchroniser,
      retirer,
      remplacerParLaMienne,
      demanderDeconnexion,
    ],
  );

  return (
    <Contexte.Provider value={valeur}>
      {children}
      <DialogueDeconnexion
        ouvert={deconnexionDemandee}
        saisies={saisies}
        enLigne={enLigne}
        synchronisation={synchronisation}
        onFermer={() => setDeconnexionDemandee(false)}
        onEnvoyer={synchroniser}
        onSupprimerEtQuitter={() => {
          magasin.vider();
          setDeconnexionDemandee(false);
          void seDeconnecter();
        }}
        onQuitter={() => {
          setDeconnexionDemandee(false);
          void seDeconnecter();
        }}
      />
    </Contexte.Provider>
  );
}

export function useFileSaisies(): ValeurFile {
  const valeur = useContext(Contexte);
  if (!valeur) throw new Error("useFileSaisies doit être utilisé sous FileSaisiesProvider");
  return valeur;
}

/** Variante qui ne lève pas hors du fournisseur (pages rendues seules dans les tests). */
export function useFileSaisiesFacultatif(): ValeurFile | null {
  return useContext(Contexte);
}
