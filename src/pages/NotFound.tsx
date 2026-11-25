import { PageErreur } from "~/components/app/PageErreur";
import i18n from "~/i18n";

export const meta = () => [{ title: i18n.t("etats.introuvable_meta") }, { name: "robots", content: "noindex" }];

export default function NotFound() {
  return <PageErreur introuvable />;
}
