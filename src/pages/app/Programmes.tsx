import { Layers, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { DialogueProgramme } from "~/components/app/DialogueProgramme";
import { DialogueSuppressionProgramme } from "~/components/app/DialogueSuppressionProgramme";
import { EntetePage } from "~/components/app/EntetePage";
import { EtatErreur, EtatVide } from "~/components/app/Etats";
import { TauxAvancement } from "~/components/app/TauxAvancement";
import { Bandeau } from "~/components/ui/banner";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Skeleton } from "~/components/ui/skeleton";
import { useOrg } from "~/hooks/useContexteOrg";
import i18n from "~/i18n";
import { type Programme, useAvancementsProgrammes, useProgrammes } from "~/lib/donnees";
import { formaterPeriode } from "~/lib/format";

export const meta = () => [{ title: i18n.t("programmes.meta") }];

export default function Programmes() {
  const { t } = useTranslation();
  const org = useOrg();
  const programmes = useProgrammes(org.organisation.id);
  const avancements = useAvancementsProgrammes(org.organisation.id);
  const [creation, setCreation] = useState(false);

  const nouveau = org.peutEditer ? (
    <Button onClick={() => setCreation(true)}>
      <Plus aria-hidden />
      {t("programmes.nouveau")}
    </Button>
  ) : undefined;

  return (
    <>
      <EntetePage titre={t("programmes.titre")} description={t("programmes.description")} actions={nouveau} />

      {!org.peutEditer && org.peutEcrire && <Bandeau>{t("projets.lecture_seule_role")}</Bandeau>}

      {programmes.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : programmes.isError ? (
        <EtatErreur erreur={programmes.error} onReessayer={() => void programmes.refetch()} />
      ) : programmes.data.length === 0 ? (
        <EtatVide
          visuel={<Layers className="size-10 text-navy/40" aria-hidden />}
          titre={t("programmes.vide.titre")}
          description={org.peutEditer ? t("programmes.vide.texte") : t("programmes.vide.texte_lecteur")}
          actions={nouveau}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {programmes.data.map((programme) => (
            <li key={programme.id}>
              <CarteProgramme
                programme={programme}
                avancement={avancements.data?.get(programme.id)}
                chargement={avancements.isPending}
              />
            </li>
          ))}
        </ul>
      )}

      <DialogueProgramme ouvert={creation} onOuvertChange={setCreation} />
    </>
  );
}

function CarteProgramme({
  programme,
  avancement,
  chargement,
}: {
  programme: Programme;
  avancement?: { nb_projets: number; taux_resultats: number | null; taux_physique: number | null };
  chargement: boolean;
}) {
  const { t } = useTranslation();
  const org = useOrg();
  const [edition, setEdition] = useState(false);
  const [suppression, setSuppression] = useState(false);
  const peutModifier = org.peutEditer;
  const peutSupprimer = org.estAdmin && org.peutEcrire;

  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl bg-card p-5 shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:scale-[1.01] hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h2 className="text-lg leading-snug font-bold text-navy">
            <Link to={`/app/programmes/${programme.id}`} className="rounded-md hover:underline">
              {programme.nom}
            </Link>
          </h2>
          <p className="font-mono text-xs text-muted-foreground tabular">
            {programme.date_debut && programme.date_fin
              ? formaterPeriode(programme.date_debut, programme.date_fin)
              : t("programmes.periode_libre")}
          </p>
        </div>
        {(peutModifier || peutSupprimer) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variante="fantome"
                taille="icone"
                className="-mt-1 -mr-2 size-9"
                aria-label={t("programmes.actions", { nom: programme.nom })}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {peutModifier && (
                <DropdownMenuItem onSelect={() => setEdition(true)}>
                  <Pencil aria-hidden />
                  {t("programmes.modification.titre")}
                </DropdownMenuItem>
              )}
              {peutSupprimer && (
                <DropdownMenuItem
                  onSelect={() => setSuppression(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 aria-hidden className="!text-destructive" />
                  {t("commun.supprimer")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {programme.description && <p className="line-clamp-2 text-sm text-muted-foreground">{programme.description}</p>}
      <div className="mt-auto grid gap-3 border-t border-border pt-4">
        {chargement ? (
          <Skeleton className="h-12 w-full rounded-xl" />
        ) : (
          <>
            <p className="text-sm font-medium text-navy">
              {t("programmes.projets_compte", { count: avancement?.nb_projets ?? 0 })}
            </p>
            {(avancement?.nb_projets ?? 0) > 0 && (
              <TauxAvancement
                resultats={avancement?.taux_resultats ?? null}
                physique={avancement?.taux_physique ?? null}
              />
            )}
          </>
        )}
      </div>
      <DialogueProgramme ouvert={edition} onOuvertChange={setEdition} programme={programme} />
      <DialogueSuppressionProgramme programme={programme} ouvert={suppression} onOuvertChange={setSuppression} />
    </article>
  );
}
