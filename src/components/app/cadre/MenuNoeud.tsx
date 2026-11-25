import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

/** Actions d'une ligne du cadre logique : modifier, déplacer parmi ses frères, supprimer. */
export function MenuNoeud({
  code,
  peutMonter,
  peutDescendre,
  onModifier,
  onMonter,
  onDescendre,
  onSupprimer,
}: {
  code: string;
  peutMonter: boolean;
  peutDescendre: boolean;
  onModifier: () => void;
  onMonter: () => void;
  onDescendre: () => void;
  onSupprimer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variante="fantome" taille="icone" className="size-9" aria-label={t("cadre.actions.menu", { code })}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onModifier}>
          <Pencil aria-hidden />
          {t("cadre.actions.modifier")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!peutMonter} onSelect={onMonter}>
          <ArrowUp aria-hidden />
          {t("cadre.actions.monter")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!peutDescendre} onSelect={onDescendre}>
          <ArrowDown aria-hidden />
          {t("cadre.actions.descendre")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSupprimer} className="text-destructive focus:text-destructive">
          <Trash2 aria-hidden className="!text-destructive" />
          {t("cadre.actions.supprimer")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
