import { CircleCheck, Loader2, MessageCircle, Send } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Turnstile } from "~/components/landing/Turnstile";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import { Champ } from "~/components/ui/field";
import { Input, NativeSelect, Textarea } from "~/components/ui/input";
import { useHydrate } from "~/hooks/useHydrate";
import { evenement } from "~/lib/analytics";
import { lienEmailEquipe, lienWhatsAppEquipe } from "~/lib/contact";
import { env, supabaseConfigure } from "~/lib/env";
import { envoyerLead } from "~/lib/lead-client";
import {
  type ChampLead,
  champsRequis,
  type CodeErreurLead,
  type TypeDemande,
  validerLead,
} from "../../../supabase/functions/submit-lead/lead";

type Erreurs = Partial<Record<ChampLead | "type_demande", CodeErreurLead | "inconnu">>;
type Etat =
  | { statut: "repos" }
  | { statut: "envoi" }
  | { statut: "succes"; email: string }
  | { statut: "erreur"; raison: "reseau" | "serveur" | "debit" | "captcha" };

const VIDE = { nom: "", organisation: "", email: "", besoin: "" };

/**
 * Formulaire de contact de la landing, branché sur l'Edge Function submit-lead. Mêmes règles de validation que la
 * fonction (lead.ts) ; champ piège invisible ; Turnstile si une clé de site est configurée ; états d'envoi, de succès
 * et d'erreur (avec « Réessayer »).
 */
export function FormulaireLead({
  type,
  onTypeChange,
  titre,
  libelleEnvoi,
  emplacement,
  compact = false,
}: {
  type: TypeDemande;
  /** Fourni quand le visiteur peut choisir son type de demande (formulaire final). */
  onTypeChange?: (type: TypeDemande) => void;
  titre?: string;
  libelleEnvoi: string;
  emplacement: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const idBase = useId();
  const pret = useHydrate();
  const formulaire = useRef<HTMLFormElement>(null);
  const titreSucces = useRef<HTMLHeadingElement>(null);
  const [valeurs, setValeurs] = useState(VIDE);
  const [piege, setPiege] = useState("");
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [etat, setEtat] = useState<Etat>({ statut: "repos" });
  const [turnstileActif, setTurnstileActif] = useState(false);
  const [jeton, setJeton] = useState<string | null>(null);
  const jetonRecu = useCallback((j: string | null) => setJeton(j), []);

  const requis = champsRequis(type);
  const champs: ChampLead[] = compact ? ["organisation", "email"] : ["nom", "organisation", "email", "besoin"];

  useEffect(() => {
    if (etat.statut === "succes") titreSucces.current?.focus();
  }, [etat.statut]);

  if (!supabaseConfigure) {
    const whatsapp = lienWhatsAppEquipe(t("landing.contact.whatsapp_message"));
    const email = lienEmailEquipe(t("landing.contact.email_sujet"));
    return (
      <Bandeau variante="vigilance" className="flex-wrap items-center">
        <p className="min-w-0 flex-1">{t("landing.formulaire.non_configure")}</p>
        {whatsapp && (
          <Button asChild variante="contour" taille="sm">
            <a href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden />
              {t("landing.contact.whatsapp")}
            </a>
          </Button>
        )}
        {email && (
          <Button asChild variante="contour" taille="sm">
            <a href={email}>{t("landing.contact.email")}</a>
          </Button>
        )}
      </Bandeau>
    );
  }

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (etat.statut === "envoi") return;
    const validation = validerLead({ ...valeurs, type_demande: type });
    if (!validation.ok) {
      setErreurs(validation.erreurs);
      const premier = champs.find((c) => validation.erreurs[c]);
      if (premier) formulaire.current?.querySelector<HTMLElement>(`[name="${premier}"]`)?.focus();
      return;
    }
    setErreurs({});
    if (env.turnstileSiteKey && !jeton) {
      setEtat({ statut: "erreur", raison: "captcha" });
      return;
    }
    setEtat({ statut: "envoi" });
    const resultat = await envoyerLead(validation.valeur, { turnstile: jeton ?? undefined, piege });
    if (resultat.ok) {
      evenement("Lead Submit", { type, emplacement });
      setEtat({ statut: "succes", email: validation.valeur.email });
      setValeurs(VIDE);
      return;
    }
    if (resultat.raison === "validation") {
      setErreurs(resultat.champs);
      setEtat({ statut: "repos" });
    } else {
      setEtat({ statut: "erreur", raison: resultat.raison === "non_configure" ? "serveur" : resultat.raison });
    }
  };

  if (etat.statut === "succes") {
    return (
      <div role="status" className="grid gap-3 text-center">
        <CircleCheck className="mx-auto size-10 text-status-ok-ink" aria-hidden />
        <h3 ref={titreSucces} tabIndex={-1} className="text-xl font-extrabold text-navy outline-none">
          {t("landing.formulaire.succes_titre")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("landing.formulaire.succes_texte", { email: etat.email })}</p>
        <Button variante="contour" className="mx-auto" onClick={() => setEtat({ statut: "repos" })}>
          {t("landing.formulaire.nouvelle")}
        </Button>
      </div>
    );
  }

  const erreurTexte = (champ: ChampLead) =>
    erreurs[champ] ? t(`landing.formulaire.erreurs.${erreurs[champ]}`) : undefined;
  const enEnvoi = etat.statut === "envoi";

  return (
    <form
      ref={formulaire}
      onSubmit={(e) => void envoyer(e)}
      onFocusCapture={() => setTurnstileActif(true)}
      noValidate
      className="grid gap-4"
    >
      {titre && <h3 className="text-xl font-extrabold text-navy">{titre}</h3>}

      {onTypeChange && (
        <Champ id={`${idBase}-type`} libelle={t("landing.formulaire.type")}>
          {(a) => (
            <NativeSelect {...a} value={type} onChange={(e) => onTypeChange(e.target.value as TypeDemande)}>
              {(["demo", "enterprise"] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`landing.formulaire.types.${v}`)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Champ>
      )}

      {champs.includes("nom") && (
        <Champ
          id={`${idBase}-nom`}
          libelle={t("landing.formulaire.nom")}
          erreur={erreurTexte("nom")}
          optionnel={!requis.includes("nom")}
        >
          {(a) => (
            <Input
              {...a}
              name="nom"
              autoComplete="name"
              value={valeurs.nom}
              onChange={(e) => setValeurs({ ...valeurs, nom: e.target.value })}
            />
          )}
        </Champ>
      )}
      {champs.includes("organisation") && (
        <Champ
          id={`${idBase}-organisation`}
          libelle={t("landing.formulaire.organisation")}
          erreur={erreurTexte("organisation")}
        >
          {(a) => (
            <Input
              {...a}
              name="organisation"
              autoComplete="organization"
              value={valeurs.organisation}
              onChange={(e) => setValeurs({ ...valeurs, organisation: e.target.value })}
            />
          )}
        </Champ>
      )}
      <Champ id={`${idBase}-email`} libelle={t("landing.formulaire.email")} erreur={erreurTexte("email")}>
        {(a) => (
          <Input
            {...a}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={valeurs.email}
            onChange={(e) => setValeurs({ ...valeurs, email: e.target.value })}
          />
        )}
      </Champ>
      {champs.includes("besoin") && (
        <Champ
          id={`${idBase}-besoin`}
          libelle={t("landing.formulaire.besoin")}
          aide={t("landing.formulaire.besoin_aide")}
          erreur={erreurTexte("besoin")}
          optionnel
        >
          {(a) => (
            <Textarea
              {...a}
              name="besoin"
              rows={3}
              value={valeurs.besoin}
              onChange={(e) => setValeurs({ ...valeurs, besoin: e.target.value })}
            />
          )}
        </Champ>
      )}

      {/* Champ piège : invisible et hors du parcours clavier ; une personne ne le remplit jamais. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site web
          <input
            type="text"
            name="site_web"
            tabIndex={-1}
            autoComplete="off"
            value={piege}
            onChange={(e) => setPiege(e.target.value)}
          />
        </label>
      </div>

      {env.turnstileSiteKey && turnstileActif && <Turnstile siteKey={env.turnstileSiteKey} onJeton={jetonRecu} />}

      {etat.statut === "erreur" && (
        <Bandeau variante="alerte" role="alert" className="flex-wrap items-center">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{t("landing.formulaire.erreur_titre")}</p>
            <p>{t(`landing.formulaire.erreur_${etat.raison}`)}</p>
          </div>
          <Button type="submit" variante="contour" taille="sm">
            {t("landing.formulaire.reessayer")}
          </Button>
        </Bandeau>
      )}

      {/* Désactivé tant que React n'est pas en place : sans cela, un envoi trop rapide serait un envoi HTML natif, qui
          recharge la page avec les données saisies dans l'adresse. */}
      <Button type="submit" taille="lg" disabled={enEnvoi || !pret} className="w-full sm:w-fit">
        {enEnvoi ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        {enEnvoi ? t("landing.formulaire.envoi") : libelleEnvoi}
      </Button>
      <p className="text-xs text-muted-foreground">{t("landing.formulaire.confidentialite")}</p>
    </form>
  );
}
