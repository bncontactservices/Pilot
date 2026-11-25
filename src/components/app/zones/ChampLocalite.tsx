import { useMemo } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Champ } from "~/components/ui/field";
import { NativeSelect } from "~/components/ui/input";
import { useOrg } from "~/hooks/useContexteOrg";
import { useLocalites, useZonesProjet } from "~/lib/donnees-se";
import { indexer, libelleLieu } from "~/lib/localites";

type Props = {
  id: string;
  projetId: string;
  libelle: string;
  aide?: string;
  /** Intitulé du choix « aucune localité ». */
  aucune: string;
  inscription: UseFormRegisterReturn;
  /** Localité déjà enregistrée : elle reste proposée même si sa zone a été retirée depuis, pour ne pas la perdre à la modification. */
  courante?: string | null;
};

/**
 * Liste déroulante des zones d'intervention d'un projet, pour rattacher une saisie ou une réalisation à une localité.
 * Absente tant que le projet n'a aucune zone : il n'y a alors rien à choisir (la page « Zones » les désigne).
 */
export function ChampLocalite({ id, projetId, libelle, aide, aucune, inscription, courante }: Props) {
  const org = useOrg();
  const localites = useLocalites(org.organisation.id);
  const zones = useZonesProjet(projetId);
  const index = useMemo(() => indexer(localites.data ?? []), [localites.data]);
  const options = useMemo(() => {
    const ids = new Set((zones.data ?? []).filter((z) => z.project_id === projetId).map((z) => z.localite_id));
    if (courante) ids.add(courante);
    return [...ids]
      .filter((i) => index.has(i))
      .map((i) => ({ id: i, libelle: libelleLieu(index, i, 2) }))
      .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  }, [zones.data, courante, index, projetId]);

  if (options.length === 0) return null;
  return (
    <Champ id={id} libelle={libelle} aide={aide} optionnel>
      {(a) => (
        <NativeSelect {...a} {...inscription}>
          <option value="">{aucune}</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.libelle}
            </option>
          ))}
        </NativeSelect>
      )}
    </Champ>
  );
}
