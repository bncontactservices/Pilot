// Les dix diapositives du pitch deck. Le texte est écrit en français ici (comme les pages légales) : un deck est un
// document éditorial, pas une interface. Aucune donnée non établie n'y figure sans la mention « à valider » ou « à compléter ».

import { ArrowDown, Check, Mail, MessageCircle, Minus, X } from "lucide-react";
import { CarteKpi } from "~/components/app/kpi/CarteKpi";
import { JaugeSegmentee } from "~/components/app/kpi/JaugeSegmentee";
import { StatutKpiBadge } from "~/components/app/kpi/StatutKpiBadge";
import { Logo, LogoMark } from "~/components/brand/Logo";
import { AValider, ACompleterDeck, Diapo } from "~/components/deck/Diapo";
import { CadreNavigateur } from "~/components/landing/CadreNavigateur";
import { CourbeDemo } from "~/components/landing/CourbeDemo";
import { FenetreHero } from "~/components/landing/FenetreHero";
import { VisuelDispersion, VisuelFlou, VisuelRapports } from "~/components/landing/Probleme";
import { Badge } from "~/components/ui/badge";
import { BASELINE, DUREE_ESSAI_JOURS, LIMITES_PLAN, NOM_PRODUIT, PRIX_MENSUEL_USD } from "~/lib/constants";
import { env } from "~/lib/env";
import { INDICATEURS_DEMO } from "~/lib/demo-landing";
import { cn } from "~/lib/utils";
import { formaterDollars } from "~/lib/tarifs";

type Props = { actif: boolean; date: string };

const accent = "font-serif font-semibold text-accent italic";

/** 1. Titre */
function Titre({ actif, date }: Props) {
  return (
    <Diapo n={1} etiquette="Pitch" sombre actif={actif} titre={`${NOM_PRODUIT}, ${BASELINE}`}>
      <div className="grid flex-1 grid-cols-[1.05fr_1fr] items-center gap-[3rem]">
        <div className="grid gap-[1.6rem]">
          <div data-a>
            <Logo ton="sombre" className="origin-left scale-[1.5]" />
          </div>
          <h2 data-a className="text-[3.4rem] leading-[1.04] font-extrabold">
            {NOM_PRODUIT} : pilotez vos projets avec des données <em className={accent + " text-[1.12em]"}>fiables</em>,
            en temps réel.
          </h2>
          <p data-a className="max-w-[30rem] text-[1.15rem] text-white/80">
            Le suivi-évaluation des ONG, PME et projets bailleurs d’Afrique de l’Ouest : dashboards, KPI, rapports PDF
            en un clic.
          </p>
          <p data-a className="font-mono text-[0.95rem] text-white/80">
            {env.editeur ?? "Fondateur"} · Fondateur · {date}
          </p>
        </div>
        <div data-a className="origin-right scale-[0.84]">
          <FenetreHero />
        </div>
      </div>
    </Diapo>
  );
}

/** 2. Problème */
function Probleme({ actif }: Props) {
  const cartes = [
    {
      Visuel: VisuelDispersion,
      titre: "Des données dispersées",
      texte: "Excel sur un poste, WhatsApp sur un autre, des e-mails égarés : personne n’a la version à jour.",
    },
    {
      Visuel: VisuelRapports,
      titre: "Des rapports qui prennent des heures",
      texte: "Chaque rapport de bailleur se reconstruit à la main, chiffre par chiffre.",
    },
    {
      Visuel: VisuelFlou,
      titre: "Des décisions à l’aveugle",
      texte: "Sans vue claire de l’avancement, les retards se découvrent trop tard.",
    },
  ];
  return (
    <Diapo n={2} etiquette="Le problème" actif={actif} titre="Données dispersées, rapports longs, décisions aveugles">
      <h2 data-a className="max-w-[62rem] font-serif text-[2.6rem] leading-[1.1] font-semibold text-navy italic">
        Vos données sont dispersées. Vos rapports prennent des heures. Vos décisions manquent de visibilité.
      </h2>
      <ul className="mt-[1.8rem] grid grid-cols-3 gap-[1.4rem]">
        {cartes.map(({ Visuel, titre, texte }) => (
          <li key={titre} data-a className="flex flex-col gap-[0.8rem] rounded-[1.6rem] bg-card p-[1.4rem] shadow-card">
            <div className="grid h-[9rem] place-items-center overflow-hidden">
              <div className="w-[14rem]">
                <Visuel />
              </div>
            </div>
            <h3 className="text-[1.15rem] font-extrabold text-navy">{titre}</h3>
            <p className="text-[0.9rem] text-muted-foreground">{texte}</p>
          </li>
        ))}
      </ul>
      <p data-a className="mt-auto rounded-[1.2rem] bg-navy px-[1.4rem] py-[1rem] text-[0.95rem] text-white/90">
        <span className="mr-[0.6rem] font-mono text-[0.7rem] tracking-wider text-accent uppercase">
          Scène type, à titre d’illustration
        </span>
        Lundi, 17 h. Le rapport du bailleur est attendu demain matin. Les chiffres sont dans trois fichiers Excel, un
        groupe WhatsApp et la boîte mail de l’équipe terrain : il faut tout recompter.
      </p>
    </Diapo>
  );
}

/** 3. Solution */
function Solution({ actif }: Props) {
  const points = [
    [
      "Un dashboard en temps réel",
      "L’évolution face à la cible se met à jour dès qu’une saisie est enregistrée, sur tous les écrans de l’équipe.",
    ],
    [
      "Des KPI qui disent quoi faire",
      "Chaque indicateur dit où nous en sommes, l’écart à la trajectoire, et l’action suggérée.",
    ],
    [
      "Des rapports PDF en un clic",
      "Logo de l’organisation, période, indicateurs, graphiques et commentaires, prêts à envoyer.",
    ],
  ];
  return (
    <Diapo n={3} etiquette="La solution" actif={actif} titre="Dashboard, KPI et rapports PDF en un clic">
      <div className="grid flex-1 grid-cols-[0.9fr_1.1fr] items-center gap-[3rem]">
        <div className="grid gap-[1.4rem]">
          <h2 data-a className="text-[2.5rem] leading-[1.08] font-extrabold text-navy">
            Un instrument de pilotage auquel une équipe de terrain fait confiance.
          </h2>
          <ol className="grid gap-[1rem]">
            {points.map(([titre, texte], i) => (
              <li key={titre} data-a className="flex gap-[1rem]">
                <span className="grid size-[2.2rem] shrink-0 place-items-center rounded-full bg-navy font-mono text-[0.85rem] font-semibold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-bold text-navy">{titre}</p>
                  <p className="text-[0.92rem] text-muted-foreground">{texte}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div data-a>
          <CadreNavigateur
            titre="Pilot M&E — Tableau de bord"
            etiquette="Données de démonstration"
            className="shadow-card-hover ring-border"
          >
            <div className="grid grid-cols-2 gap-[0.9rem]">
              {INDICATEURS_DEMO.slice(0, 2).map(({ kpi, evaluation, serie }) => (
                <CarteKpi key={kpi.id} kpi={kpi} evaluation={evaluation} serie={serie} peutSaisir={false} />
              ))}
            </div>
          </CadreNavigateur>
        </div>
      </div>
    </Diapo>
  );
}

/** 4. Marché */
function Marche({ actif }: Props) {
  const niveaux = [
    {
      cle: "TAM",
      taille: "w-[30rem]",
      fond: "bg-white/[0.06]",
      titre: "Marché total",
      texte: "Organisations d’Afrique de l’Ouest qui suivent des indicateurs de projet.",
    },
    {
      cle: "SAM",
      taille: "w-[21rem]",
      fond: "bg-white/[0.1]",
      titre: "Marché atteignable",
      texte: "ONG, PME et projets bailleurs francophones joignables par prospection directe.",
    },
    {
      cle: "SOM",
      taille: "w-[12rem]",
      fond: "bg-accent/90 text-accent-foreground",
      titre: "Premiers clients",
      texte: "Les 20 premiers prospects (objectif).",
    },
  ];
  return (
    <Diapo n={4} etiquette="Le marché" sombre actif={actif} titre="ONG, PME et projets bailleurs en Afrique de l’Ouest">
      <div className="grid flex-1 grid-cols-[30rem_1fr] items-center gap-[3.5rem]">
        <div
          className="relative grid h-[30rem] w-[30rem] place-items-center"
          role="img"
          aria-label="Trois cercles concentriques : marché total, marché atteignable, premiers clients"
        >
          {niveaux.map((n, i) => (
            <div
              key={n.cle}
              data-cercle
              className={cn(
                "absolute right-0 bottom-0 left-0 mx-auto grid aspect-square place-items-center rounded-full border border-white/20",
                n.taille,
                n.fond,
              )}
            >
              <span
                className={cn(
                  "font-mono text-[0.85rem] font-bold",
                  i === 2 ? "text-accent-foreground" : "absolute top-[1.1rem] text-white/85",
                )}
              >
                {n.cle}
              </span>
            </div>
          ))}
        </div>
        <div className="grid gap-[1.1rem]">
          <h2 data-a className="text-[2.2rem] leading-[1.1] font-extrabold">
            Un marché de terrain, où l’outil dominant reste le tableur.
          </h2>
          {niveaux.map((n) => (
            <div key={n.cle} data-a className="grid grid-cols-[3.2rem_1fr] items-start gap-[0.8rem]">
              <span className="font-mono text-[0.9rem] font-bold text-accent">{n.cle}</span>
              <div>
                <p className="font-bold">{n.titre}</p>
                <p className="text-[0.9rem] text-white/80">{n.texte}</p>
                {n.cle !== "SOM" && (
                  <p className="mt-[0.3rem] flex items-center gap-[0.5rem] text-[0.85rem] text-white/70">
                    Effectif : <ACompleterDeck surSombre>chiffre sourcé</ACompleterDeck>
                  </p>
                )}
              </div>
            </div>
          ))}
          <p
            data-a
            className="mt-[0.4rem] flex flex-wrap items-center gap-[0.6rem] border-t border-white/15 pt-[0.9rem] text-[0.8rem] text-white/70"
          >
            <AValider surSombre>hypothèses</AValider>
            Aucun chiffre de marché n’est affiché tant qu’il n’est pas sourcé : les périmètres sont posés, les effectifs
            restent à établir.
          </p>
        </div>
      </div>
    </Diapo>
  );
}

/** 5. Produit */
function Produit({ actif }: Props) {
  const premiere = INDICATEURS_DEMO[0]!;
  const statuts = INDICATEURS_DEMO.map((i) => i.evaluation.statut);
  return (
    <Diapo n={5} etiquette="Le produit" actif={actif} titre="Trois écrans réels de l’application">
      <h2 data-a className="text-[2.3rem] leading-[1.1] font-extrabold text-navy">
        Le produit, tel qu’il fonctionne aujourd’hui.
      </h2>
      <div className="mt-[1.5rem] grid flex-1 grid-cols-3 items-center gap-[1.4rem]">
        <figure data-a className="flex flex-col gap-[0.8rem]">
          <div>
            <CarteKpi kpi={premiere.kpi} evaluation={premiere.evaluation} serie={premiere.serie} peutSaisir={false} />
          </div>
          <figcaption className="text-[0.88rem]">
            <b className="text-navy">Tableau de bord.</b> Valeur, cible, écart à la trajectoire et action suggérée.
          </figcaption>
        </figure>
        <figure data-a className="flex flex-col gap-[0.8rem]">
          <div className="rounded-2xl bg-card p-[1.3rem] shadow-card">
            <div className="flex flex-wrap items-center gap-[0.5rem]">
              <Badge variante="ok">En cours</Badge>
              <Badge variante="exemple">Projet exemple</Badge>
            </div>
            <p className="mt-[0.7rem] text-[1.15rem] font-extrabold text-navy">
              Projet exemple — Eau, hygiène et assainissement
            </p>
            <p className="font-mono text-[0.8rem] text-muted-foreground">Janv. 2026 – déc. 2026</p>
            <div className="mt-[1rem] grid gap-[0.4rem]">
              <p className="text-[0.85rem] font-semibold text-navy">Progression</p>
              <JaugeSegmentee statuts={statuts} />
              <div className="flex flex-wrap gap-[0.4rem] pt-[0.3rem]">
                {INDICATEURS_DEMO.slice(0, 2).map((i) => (
                  <StatutKpiBadge key={i.kpi.id} statut={i.evaluation.statut} />
                ))}
              </div>
            </div>
          </div>
          <figcaption className="text-[0.88rem]">
            <b className="text-navy">Liste des projets.</b> Une jauge segmentée : un segment par indicateur, coloré
            selon son statut.
          </figcaption>
        </figure>
        <figure data-a className="flex flex-col gap-[0.8rem]">
          <div className="rounded-2xl bg-card p-[1.3rem] shadow-card">
            <p className="mb-[0.4rem] text-[0.95rem] font-bold text-navy">Évolution face à la cible</p>
            <CourbeDemo description="Évolution de l’indicateur face à la cible" />
          </div>
          <figcaption className="text-[0.88rem]">
            <b className="text-navy">Évolution.</b> Courbe des saisies, cible et trajectoire attendue ; saisie, import
            Excel/CSV et rapport PDF complètent le parcours.
          </figcaption>
        </figure>
      </div>
    </Diapo>
  );
}

/** 6. Business model */
function Modele({ actif }: Props) {
  const plans = [
    { cle: "starter" as const, nom: "Starter" },
    { cle: "pro" as const, nom: "Pro", vedette: true },
  ];
  return (
    <Diapo n={6} etiquette="Business model" actif={actif} titre="Abonnement SaaS Starter, Pro et Enterprise">
      <div className="grid flex-1 grid-cols-[1.25fr_1fr] gap-[2.5rem]">
        <div className="grid content-start gap-[1.3rem]">
          <h2 data-a className="text-[2.3rem] leading-[1.1] font-extrabold text-navy">
            Un abonnement, trois offres.
          </h2>
          <div className="grid grid-cols-3 gap-[1rem]">
            {plans.map((p) => (
              <div
                key={p.cle}
                data-a
                className={cn(
                  "grid content-start gap-[0.5rem] rounded-[1.4rem] p-[1.2rem]",
                  p.vedette ? "bg-navy text-white" : "bg-card shadow-card",
                )}
              >
                <p className="text-[1.1rem] font-extrabold">{p.nom}</p>
                <p className="font-mono text-[1.9rem] font-semibold">
                  {formaterDollars(PRIX_MENSUEL_USD[p.cle])}
                  <span
                    className={cn(
                      "ml-[0.3rem] font-sans text-[0.8rem]",
                      p.vedette ? "text-white/70" : "text-muted-foreground",
                    )}
                  >
                    / mois
                  </span>
                </p>
                <p className={cn("text-[0.82rem]", p.vedette ? "text-white/80" : "text-muted-foreground")}>
                  {LIMITES_PLAN[p.cle].projects} projet{LIMITES_PLAN[p.cle].projects! > 1 ? "s" : ""} ·{" "}
                  {LIMITES_PLAN[p.cle].kpis} KPI par projet · {LIMITES_PLAN[p.cle].users} utilisateur
                  {LIMITES_PLAN[p.cle].users! > 1 ? "s" : ""}
                </p>
              </div>
            ))}
            <div data-a className="grid content-start gap-[0.5rem] rounded-[1.4rem] bg-card p-[1.2rem] shadow-card">
              <p className="text-[1.1rem] font-extrabold text-navy">Enterprise</p>
              <p className="font-mono text-[1.5rem] font-semibold text-navy">Sur devis</p>
              <p className="text-[0.82rem] text-muted-foreground">
                Limites sur mesure pour les grandes organisations et les programmes.
              </p>
            </div>
          </div>
          <p data-a className="flex flex-wrap items-center gap-[0.6rem] text-[0.9rem]">
            Essai de {DUREE_ESSAI_JOURS} jours, sans carte, aux limites du plan Pro ; ensuite lecture seule jusqu’à
            l’activation d’un plan.
            <AValider>prix et durée</AValider>
          </p>
        </div>
        <div data-a className="grid content-center gap-[0.9rem] rounded-[1.8rem] bg-navy p-[1.8rem] text-white">
          <p className="font-mono text-[0.75rem] tracking-wider text-accent uppercase">
            Revenu récurrent : une arithmétique, pas une prévision
          </p>
          <p className="text-[1.05rem]">
            Chaque tranche de <b>10 organisations</b> au plan Pro représente :
          </p>
          <p className="font-mono text-[2.3rem] font-semibold text-accent">
            {formaterDollars(10 * PRIX_MENSUEL_USD.pro)}
            <span className="ml-[0.4rem] font-sans text-[0.9rem] text-white/75">par mois</span>
          </p>
          <p className="font-mono text-[1.2rem]">
            {formaterDollars(10 * PRIX_MENSUEL_USD.pro * 12)}
            <span className="ml-[0.4rem] font-sans text-[0.85rem] text-white/75">par an, au tarif mensuel</span>
          </p>
          <p className="flex flex-wrap items-center gap-[0.5rem] border-t border-white/15 pt-[0.8rem] text-[0.8rem] text-white/75">
            <AValider surSombre>hypothèse</AValider>
            Aucun client payant à ce jour ; le nombre d’organisations et les prix restent à valider avec les pilotes.
          </p>
        </div>
      </div>
    </Diapo>
  );
}

/** 7. Concurrence */
function Concurrence({ actif }: Props) {
  const colonnes = ["Excel", "Power BI", "Outils de S&E existants", NOM_PRODUIT];
  const lignes: { critere: string; valeurs: ("oui" | "non" | "nc")[] }[] = [
    { critere: "Mise à jour en temps réel", valeurs: ["non", "nc", "nc", "oui"] },
    { critere: "Collaboration d’équipe", valeurs: ["non", "nc", "nc", "oui"] },
    { critere: "Simple à prendre en main", valeurs: ["nc", "non", "nc", "oui"] },
    { critere: "Abordable", valeurs: ["nc", "nc", "non", "oui"] },
    { critere: "Rapport PDF en un clic", valeurs: ["nc", "nc", "nc", "oui"] },
  ];
  const symbole = (v: "oui" | "non" | "nc") =>
    v === "oui" ? (
      <span className="inline-flex items-center gap-[0.4rem] font-semibold text-status-ok-ink">
        <Check className="size-[1.1rem]" aria-hidden />
        Oui
      </span>
    ) : v === "non" ? (
      <span className="inline-flex items-center gap-[0.4rem] font-semibold text-status-alert-ink">
        <X className="size-[1.1rem]" aria-hidden />
        Non
      </span>
    ) : (
      <span className="inline-flex items-center gap-[0.4rem] text-muted-foreground">
        <Minus className="size-[1.1rem]" aria-hidden />
        Non évalué
      </span>
    );
  return (
    <Diapo
      n={7}
      etiquette="La concurrence"
      actif={actif}
      titre="Excel, Power BI et les outils de suivi-évaluation existants"
    >
      <h2 data-a className="text-[2.3rem] leading-[1.1] font-extrabold text-navy">
        Simple, abordable et collaboratif.
      </h2>
      <div data-a className="mt-[1.4rem] overflow-hidden rounded-[1.4rem] bg-card shadow-card">
        <table className="w-full text-left text-[0.95rem]">
          <thead>
            <tr className="border-b border-border bg-subtle text-[0.8rem] tracking-wide text-navy uppercase">
              <th scope="col" className="px-[1.2rem] py-[0.8rem] font-semibold">
                <span className="sr-only">Critère</span>
              </th>
              {colonnes.map((c, i) => (
                <th
                  key={c}
                  scope="col"
                  className={cn("px-[1rem] py-[0.8rem] font-bold", i === 3 && "bg-navy text-white")}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lignes.map((l) => (
              <tr key={l.critere}>
                <th scope="row" className="px-[1.2rem] py-[0.75rem] font-semibold text-navy">
                  {l.critere}
                </th>
                {l.valeurs.map((v, i) => (
                  <td key={i} className={cn("px-[1rem] py-[0.75rem]", i === 3 && "bg-accent/10")}>
                    {symbole(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p data-a className="mt-auto flex flex-wrap items-center gap-[0.6rem] text-[0.85rem] text-muted-foreground">
        <AValider>positionnement</AValider>
        Les « Non » reprennent le constat du fondateur (Excel : ni temps réel ni collaboration ; Power BI : trop
        complexe ; outils existants : trop chers). « Non évalué » : aucune comparaison documentée à ce jour.
      </p>
    </Diapo>
  );
}

/** 8. Go-to-market */
function MiseSurLeMarche({ actif }: Props) {
  const etapes = [
    { titre: "Prospection directe", texte: "E-mail, LinkedIn, WhatsApp", largeur: "w-full" },
    { titre: "Démonstration", texte: "Le vrai tableau de bord, sur le projet de la personne", largeur: "w-[88%]" },
    { titre: `Essai de ${DUREE_ESSAI_JOURS} jours`, texte: "Toutes les fonctions Pro, sans carte", largeur: "w-[76%]" },
    { titre: "Client", texte: "Activation d’un plan par l’équipe", largeur: "w-[64%]" },
  ];
  return (
    <Diapo n={8} etiquette="Go-to-market" actif={actif} titre="Prospection directe et partenariats">
      <h2 data-a className="text-[2.3rem] leading-[1.1] font-extrabold text-navy">
        Aller chercher les premières organisations, une à une.
      </h2>
      <div className="mt-[1.5rem] grid flex-1 grid-cols-[1.35fr_1fr] gap-[2.5rem]">
        <ol className="grid content-start justify-items-center gap-[0.55rem]" aria-label="Entonnoir de conversion">
          {etapes.map((e, i) => (
            <li key={e.titre} data-etape className={cn("grid w-full justify-items-center gap-[0.3rem]")}>
              <div
                className={cn(
                  "rounded-[1rem] px-[1.2rem] py-[0.8rem] text-center",
                  e.largeur,
                  i === 3
                    ? "bg-accent text-accent-foreground"
                    : i === 0
                      ? "bg-navy text-white"
                      : i === 1
                        ? "bg-navy-soft text-white"
                        : "bg-navy/80 text-white",
                )}
              >
                <p className="font-bold">{e.titre}</p>
                <p className="text-[0.82rem] opacity-85">{e.texte}</p>
              </div>
              {i < etapes.length - 1 && <ArrowDown className="size-[1rem] text-muted-foreground" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="grid content-start gap-[1rem]">
          <div data-a className="rounded-[1.4rem] bg-card p-[1.3rem] shadow-card">
            <p className="font-mono text-[0.72rem] tracking-wider text-accent-ink uppercase">Partenariats</p>
            <ul className="mt-[0.5rem] grid gap-[0.3rem] font-semibold text-navy">
              <li>Cabinets de conseil</li>
              <li>Incubateurs</li>
              <li>Bailleurs</li>
            </ul>
            <p className="mt-[0.5rem] text-[0.85rem] text-muted-foreground">
              Un relais qui recommande l’outil aux organisations qu’il accompagne.
            </p>
          </div>
          <div data-a className="rounded-[1.4rem] bg-navy p-[1.3rem] text-white">
            <p className="font-mono text-[0.72rem] tracking-wider text-accent uppercase">Objectif</p>
            <p className="mt-[0.3rem] text-[1.5rem] font-extrabold">20 premiers prospects</p>
            <p className="mt-[0.4rem] flex flex-wrap items-center gap-[0.5rem] text-[0.82rem] text-white/75">
              <AValider surSombre>objectif</AValider>
              Les taux de conversion se mesureront avec les pilotes ; aucun n’est annoncé.
            </p>
          </div>
        </div>
      </div>
    </Diapo>
  );
}

/** 9. Équipe */
function Equipe({ actif }: Props) {
  const nom = env.editeur ?? "Le fondateur";
  const initiales = nom
    .replace(/[^A-Za-zÀ-ÿ]/g, "")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Diapo n={9} etiquette="L’équipe" sombre actif={actif} titre="Le fondateur">
      <div className="grid flex-1 grid-cols-[18rem_1fr] items-center gap-[3.5rem]">
        <div data-a className="grid justify-items-center gap-[1rem]">
          <div
            className="grid size-[14rem] place-items-center rounded-full bg-white/10 ring-4 ring-accent/60"
            role="img"
            aria-label={`Initiales de ${nom}, en attendant une photo`}
          >
            <span className="text-[4.6rem] font-extrabold tracking-tight">{initiales}</span>
          </div>
          <p className="text-[0.8rem] text-white/70">
            <ACompleterDeck surSombre>photo</ACompleterDeck>
          </p>
        </div>
        <div className="grid gap-[1.2rem]">
          <h2 data-a className="text-[2.6rem] leading-[1.08] font-extrabold">
            {nom}
          </h2>
          <p data-a className="text-[1.3rem] text-white/85">
            Fondateur de {NOM_PRODUIT} : un expert du suivi-évaluation qui construit lui-même le produit.
          </p>
          <ul className="grid gap-[0.8rem] text-[1.02rem]">
            <li data-a className="flex flex-wrap items-center gap-[0.6rem]">
              <Check className="size-[1.1rem] text-accent" aria-hidden />
              Terrain du suivi-évaluation : <ACompleterDeck surSombre>parcours et références</ACompleterDeck>
            </li>
            <li data-a className="flex flex-wrap items-center gap-[0.6rem]">
              <Check className="size-[1.1rem] text-accent" aria-hidden />
              Technique : <ACompleterDeck surSombre>parcours et réalisations</ACompleterDeck>
            </li>
            <li data-a className="flex flex-wrap items-center gap-[0.6rem]">
              <Check className="size-[1.1rem] text-accent" aria-hidden />
              Avantage clé : <ACompleterDeck surSombre>à formuler par le fondateur</ACompleterDeck>
            </li>
          </ul>
        </div>
      </div>
    </Diapo>
  );
}

/** 10. Ask */
function Demande({ actif }: Props) {
  const demandes = [
    {
      titre: "Des clients pilotes",
      texte: "Quelques organisations qui utilisent l’outil sur de vrais projets et nous disent ce qui manque.",
    },
    {
      titre: "Des retours de terrain",
      texte: "Des avis d’équipes de suivi-évaluation et de bailleurs pour prioriser la suite.",
    },
    { titre: "Un financement", texte: "Pour accélérer le développement et la prospection.", placeholder: true },
  ];
  return (
    <Diapo
      n={10}
      etiquette="Ce que nous cherchons"
      sombre
      actif={actif}
      titre="Clients pilotes, retours et financement"
    >
      <h2 data-a className="max-w-[56rem] text-[2.6rem] leading-[1.08] font-extrabold">
        Construisons l’instrument de pilotage de vos projets, ensemble.
      </h2>
      <div className="mt-[1.8rem] grid grid-cols-3 gap-[1.3rem]">
        {demandes.map((d, i) => (
          <div
            key={d.titre}
            data-a
            className="grid content-start gap-[0.6rem] rounded-[1.6rem] border border-white/15 bg-white/[0.06] p-[1.5rem]"
          >
            <span className="font-mono text-[0.8rem] text-accent">0{i + 1}</span>
            <p className="text-[1.25rem] font-extrabold">{d.titre}</p>
            <p className="text-[0.92rem] text-white/80">{d.texte}</p>
            {d.placeholder && (
              <div className="mt-[0.4rem] grid gap-[0.4rem] text-[0.88rem]">
                <p>
                  Montant : <ACompleterDeck surSombre>montant recherché</ACompleterDeck>
                </p>
                <p>
                  Usage des fonds : <ACompleterDeck surSombre>répartition</ACompleterDeck>
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        data-a
        className="mt-auto flex flex-wrap items-center gap-[2rem] border-t border-white/15 pt-[1.2rem] text-[1rem]"
      >
        <LogoMark className="size-[2.4rem]" />
        {env.contactEmail && (
          <span className="flex items-center gap-[0.5rem]">
            <Mail className="size-[1.1rem] text-accent" aria-hidden />
            {env.contactEmail}
          </span>
        )}
        {env.whatsappNumber && (
          <span className="flex items-center gap-[0.5rem]">
            <MessageCircle className="size-[1.1rem] text-accent" aria-hidden />
            WhatsApp : +{env.whatsappNumber}
          </span>
        )}
        {!env.contactEmail && !env.whatsappNumber && <ACompleterDeck surSombre>coordonnées de contact</ACompleterDeck>}
      </div>
    </Diapo>
  );
}

export const DIAPOS = [
  Titre,
  Probleme,
  Solution,
  Marche,
  Produit,
  Modele,
  Concurrence,
  MiseSurLeMarche,
  Equipe,
  Demande,
] as const;
export const TITRES_DIAPOS = [
  "Titre",
  "Le problème",
  "La solution",
  "Le marché",
  "Le produit",
  "Business model",
  "La concurrence",
  "Go-to-market",
  "L’équipe",
  "Ce que nous cherchons",
] as const;
