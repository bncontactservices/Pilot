import { useEffect, useRef } from "react";

type ApiTurnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};
declare global {
  interface Window {
    turnstile?: ApiTurnstile;
  }
}

const URL_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let chargement: Promise<void> | null = null;

function chargerScript(): Promise<void> {
  chargement ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = URL_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      chargement = null; // permet une nouvelle tentative
      reject(new Error("Turnstile indisponible"));
    };
    document.head.append(script);
  });
  return chargement;
}

/** Widget Cloudflare Turnstile (facultatif) : le script n'est chargé qu'à l'affichage du composant, donc après un premier contact avec le formulaire. */
export function Turnstile({ siteKey, onJeton }: { siteKey: string; onJeton: (jeton: string | null) => void }) {
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | undefined;
    let annule = false;
    chargerScript()
      .then(() => {
        if (annule || !conteneur.current || !window.turnstile) return;
        id = window.turnstile.render(conteneur.current, {
          sitekey: siteKey,
          language: "fr",
          callback: (jeton: string) => onJeton(jeton),
          "expired-callback": () => onJeton(null),
          "error-callback": () => onJeton(null),
        });
      })
      .catch(() => onJeton(null));
    return () => {
      annule = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, onJeton]);

  return <div ref={conteneur} className="min-h-[65px]" />;
}
