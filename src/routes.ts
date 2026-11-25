import { index, layout, prefix, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("pages/landing/Landing.tsx"),
  route("mentions-legales", "pages/legal/MentionsLegales.tsx"),
  route("confidentialite", "pages/legal/Confidentialite.tsx"),
  route("conditions-utilisation", "pages/legal/ConditionsUtilisation.tsx"),
  route("deck", "pages/deck/Deck.tsx"),

  // Tout ce qui dépend de la session : Supabase et react-query ne sont chargés qu'ici.
  layout("pages/SessionLayout.tsx", [
    layout("pages/auth/AuthLayout.tsx", [
      route("connexion", "pages/auth/Connexion.tsx"),
      route("inscription", "pages/auth/Inscription.tsx"),
      route("mot-de-passe-oublie", "pages/auth/MotDePasseOublie.tsx"),
    ]),
    route("reinitialiser-mot-de-passe", "pages/auth/Reinitialiser.tsx"),
    ...prefix("app", [
      layout("pages/app/AppLayout.tsx", [
        index("pages/app/Projets.tsx"),
        route("projets/:projetId", "pages/app/ProjetLayout.tsx", [
          index("pages/app/projet/Dashboard.tsx"),
          route("indicateurs", "pages/app/projet/Indicateurs.tsx"),
          route("saisie", "pages/app/projet/Saisie.tsx"),
          route("import", "pages/app/projet/Import.tsx"),
          route("rapports", "pages/app/projet/Rapports.tsx"),
          route("cadre-logique", "pages/app/projet/CadreLogique.tsx"),
          route("phases", "pages/app/projet/Phases.tsx"),
          route("composantes", "pages/app/projet/Composantes.tsx"),
          route("acteurs", "pages/app/projet/ActeursProjet.tsx"),
          route("zones", "pages/app/projet/Zones.tsx"),
          route("beneficiaires", "pages/app/projet/Beneficiaires.tsx"),
          route("realisations", "pages/app/projet/Realisations.tsx"),
          route("prochaines-etapes", "pages/app/projet/ProchainesEtapes.tsx"),
          route("etats-avancement", "pages/app/projet/EtatsAvancement.tsx"),
          route("documents", "pages/app/projet/Documents.tsx"),
          route("finances", "pages/app/projet/Finances.tsx"),
          route("plan-de-travail", "pages/app/projet/Pta.tsx"),
        ]),
        route("programmes", "pages/app/Programmes.tsx"),
        route("acteurs", "pages/app/Acteurs.tsx"),
        route("localites", "pages/app/Localites.tsx"),
        route("programmes/:programmeId", "pages/app/ProgrammeDetail.tsx"),
        route("equipe", "pages/app/Equipe.tsx"),
        route("parametres", "pages/app/Parametres.tsx"),
      ]),
    ]),
  ]),

  route("*", "pages/NotFound.tsx"),
] satisfies RouteConfig;
