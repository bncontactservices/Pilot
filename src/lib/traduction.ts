/** Fonction de traduction minimale : les modules de calcul n'ont pas besoin de connaître i18next. */
export type Traducteur = (cle: string, valeurs?: Record<string, unknown>) => string;
