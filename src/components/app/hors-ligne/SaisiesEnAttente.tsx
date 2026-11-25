import { CloudUpload, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { useFileSaisies } from "~/hooks/useFileSaisies";
import type { Kpi } from "~/lib/donnees";
import { analyserErreur } from "~/lib/errors";
import { formaterDate, formaterValeur } from "~/lib/format";
import type { SaisieEnAttente } from "~/lib/hors-ligne/file";

/** Les saisies de ce projet gardées sur l'appareil : en attente, refusées par la base, ou en conflit avec une autre valeur. */
export function SaisiesEnAttente({ projetId, kpis }: { projetId: string; kpis: Kpi[] }) {
  const { t } = useTranslation();
  const { saisies, enLigne, remplacerParLaMienne, retirer } = useFileSaisies();
  const lignes = saisies.filter((s) => s.projetId === projetId);
  if (lignes.length === 0) return null;
  const kpisParId = new Map(kpis.map((k) => [k.id, k]));

  return (
    <Card data-testid="saisies-en-attente">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudUpload className="size-5" aria-hidden />
          {t("horsligne.liste.titre")}
        </CardTitle>
        <CardDescription>{t("horsligne.liste.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border">
          {lignes.map((s) => (
            <Ligne
              key={s.id}
              saisie={s}
              kpi={kpisParId.get(s.kpiId)}
              enLigne={enLigne}
              onRetirer={() => {
                retirer(s.id);
                toast.success(t("horsligne.liste.supprimee"));
              }}
              onRemplacer={async () => {
                const resultat = await remplacerParLaMienne(s.id);
                if (resultat.type === "envoyee") toast.success(t("horsligne.liste.remplacee"));
                else if (resultat.type === "refusee") toast.error(t(resultat.cle));
                else toast.error(t("erreurs.reseau"));
              }}
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Ligne({
  saisie,
  kpi,
  enLigne,
  onRetirer,
  onRemplacer,
}: {
  saisie: SaisieEnAttente;
  kpi: Kpi | undefined;
  enLigne: boolean;
  onRetirer: () => void;
  onRemplacer: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const unite = kpi?.unite ?? "";
  const date = formaterDate(saisie.date);
  // Le motif d'un refus est une clé i18n ; les clés inconnues retombent sur le message générique.
  const motif = saisie.erreurCle ? t(saisie.erreurCle, { defaultValue: t(analyserErreur(null).cle) }) : "";

  return (
    <li className="grid gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="font-semibold text-navy">{kpi?.nom ?? "—"}</p>
          <p className="font-mono text-sm tabular">
            {date} · {formaterValeur(saisie.valeur, unite)}
          </p>
          {saisie.commentaire && <p className="text-sm text-muted-foreground">{saisie.commentaire}</p>}
        </div>
        <Badge variante={saisie.statut === "attente" ? "neutre" : saisie.statut === "conflit" ? "vigilance" : "alerte"}>
          {saisie.statut === "attente"
            ? saisie.tentatives
              ? t("horsligne.liste.statut.retentee", { count: saisie.tentatives })
              : t("horsligne.liste.statut.attente")
            : saisie.statut === "conflit"
              ? t("horsligne.liste.statut.conflit", { valeur: formaterValeur(saisie.valeurServeur ?? 0, unite) })
              : t("horsligne.liste.statut.refusee", { motif })}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {saisie.statut === "conflit" && (
          <>
            <Button variante="primaire" taille="sm" onClick={() => void onRemplacer()} disabled={!enLigne}>
              {t("horsligne.liste.remplacer")}
            </Button>
            <Button variante="contour" taille="sm" onClick={onRetirer}>
              {t("horsligne.liste.garder")}
            </Button>
            {!enLigne && (
              <span className="text-xs text-muted-foreground">{t("horsligne.liste.necessite_connexion")}</span>
            )}
          </>
        )}
        {saisie.statut !== "conflit" && (
          <Button
            variante="fantome"
            taille="sm"
            onClick={onRetirer}
            aria-label={t("horsligne.liste.supprimer", { date })}
          >
            <Trash2 aria-hidden />
            {t("commun.supprimer")}
          </Button>
        )}
      </div>
    </li>
  );
}
