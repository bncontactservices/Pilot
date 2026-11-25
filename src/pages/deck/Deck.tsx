import { ChevronLeft, ChevronRight, Expand } from "lucide-react";
import { type PointerEvent as EvenementPointeur, useCallback, useEffect, useRef, useState } from "react";
import { DIAPOS, TITRES_DIAPOS } from "~/components/deck/Diapos";
import { NOMBRE_DIAPOS } from "~/components/deck/Diapo";
import { chargerGsap, mouvementAutorise } from "~/lib/animation";
import { cn } from "~/lib/utils";

export const meta = () => [
  { title: "Pilot M&E — Pitch deck" },
  { name: "robots", content: "noindex, nofollow" },
  {
    name: "description",
    content: "Pitch deck de Pilot M&E : le problème, la solution, le marché, le produit et ce que nous cherchons.",
  },
];

const DERNIERE = NOMBRE_DIAPOS - 1;
const borner = (n: number) => Math.max(0, Math.min(DERNIERE, n));
const depuisHash = () => borner((Number.parseInt(window.location.hash.slice(1), 10) || 1) - 1);
const DATE = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date());

type Gsap = Awaited<ReturnType<typeof chargerGsap>>["gsap"];
type Chronologie = ReturnType<Gsap["timeline"]>;

/**
 * Animations d'une diapositive. Chaque diapositive reçoit sa chronologie à l'activation ; tout part de l'état visible
 * (`from`). Les éléments marqués `data-a` entrent en cascade ; les cercles du marché et l'entonnoir ont leur entrée propre.
 */
function construire(gsap: Gsap, diapo: HTMLElement): Chronologie {
  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
  const cascade = diapo.querySelectorAll("[data-a]");
  if (cascade.length) tl.from(cascade, { y: 26, opacity: 0, duration: 0.7, stagger: 0.1 });
  const cercles = diapo.querySelectorAll("[data-cercle]");
  if (cercles.length)
    tl.from(
      cercles,
      { scale: 0.55, opacity: 0, transformOrigin: "50% 100%", duration: 0.9, stagger: 0.18, ease: "back.out(1.4)" },
      0.1,
    );
  const etapes = diapo.querySelectorAll("[data-etape]");
  if (etapes.length) tl.from(etapes, { scaleX: 0.6, opacity: 0, duration: 0.6, stagger: 0.18 }, 0.15);
  const trace = diapo.querySelector("[data-trace]");
  if (trace) tl.from(trace, { strokeDashoffset: 1, duration: 1.4, ease: "power2.inOut" }, 0.3);
  return tl;
}

export default function Deck() {
  const [actif, setActif] = useState(depuisHash);
  const scene = useRef<HTMLDivElement>(null);
  const chronologies = useRef(new Map<number, Chronologie>());
  const gsapRef = useRef<Gsap | null>(null);
  const departTactile = useRef<{ x: number; y: number } | null>(null);

  const aller = useCallback((n: number) => setActif(borner(n)), []);

  // Le rem suit la taille de la scène : 1 rem = 1/80 de sa largeur, donc la mise en page de 1280 × 720 s'adapte à l'écran.
  useEffect(() => {
    const ajuster = () => {
      const largeur = Math.min(window.innerWidth, (window.innerHeight * 16) / 9);
      document.documentElement.style.fontSize = `${largeur / 80}px`;
    };
    ajuster();
    window.addEventListener("resize", ajuster);
    return () => {
      window.removeEventListener("resize", ajuster);
      document.documentElement.style.fontSize = "";
    };
  }, []);

  // Page nommée « deck » sur tout le document (voir index.css) : une impression sans page parasite.
  useEffect(() => {
    document.body.classList.add("deck-impression");
    return () => document.body.classList.remove("deck-impression");
  }, []);

  // Clavier : flèches, espace, pages, début et fin ; « f » bascule le plein écran.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible && /^(input|textarea|select)$/i.test(cible.tagName)) return;
      const suivante = ["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"];
      const precedente = ["ArrowLeft", "ArrowUp", "PageUp", "Backspace"];
      if (suivante.includes(e.key)) {
        e.preventDefault();
        setActif((n) => borner(n + 1));
      } else if (precedente.includes(e.key)) {
        e.preventDefault();
        setActif((n) => borner(n - 1));
      } else if (e.key === "Home") setActif(0);
      else if (e.key === "End") setActif(DERNIERE);
      else if (e.key.toLowerCase() === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener("keydown", surTouche);
    return () => window.removeEventListener("keydown", surTouche);
  }, []);

  // L'adresse suit la diapositive (#3), sans remplir l'historique.
  useEffect(() => {
    window.history.replaceState(null, "", `#${actif + 1}`);
  }, [actif]);
  useEffect(() => {
    const surHash = () => setActif(depuisHash());
    window.addEventListener("hashchange", surHash);
    return () => window.removeEventListener("hashchange", surHash);
  }, []);

  // Animations : créées à l'activation de chaque diapositive, rejouées si on y revient.
  useEffect(() => {
    if (!mouvementAutorise()) return;
    let annule = false;
    void chargerGsap().then(({ gsap }) => {
      if (annule) return;
      gsapRef.current = gsap;
      const diapo = scene.current?.querySelector<HTMLElement>(`[data-diapo="${actif + 1}"]`);
      if (!diapo) return;
      const existante = chronologies.current.get(actif);
      if (existante) existante.restart();
      else chronologies.current.set(actif, construire(gsap, diapo));
    });
    return () => {
      annule = true;
    };
  }, [actif]);

  // Impression : toutes les chronologies sont créées, puis amenées à leur état final, pour qu'aucun élément ne reste invisible dans le PDF.
  useEffect(() => {
    const finaliser = () => {
      const gsap = gsapRef.current;
      if (!gsap) return; // GSAP n'a rien animé : tout est déjà visible
      scene.current?.querySelectorAll<HTMLElement>("[data-diapo]").forEach((diapo, i) => {
        const tl = chronologies.current.get(i) ?? construire(gsap, diapo);
        chronologies.current.set(i, tl);
        tl.progress(1).pause();
      });
    };
    window.addEventListener("beforeprint", finaliser);
    const impression = window.matchMedia("print");
    const surChangement = (e: MediaQueryListEvent) => e.matches && finaliser();
    impression.addEventListener?.("change", surChangement);
    return () => {
      window.removeEventListener("beforeprint", finaliser);
      impression.removeEventListener?.("change", surChangement);
    };
  }, []);

  // Balayage tactile : un geste horizontal franc change de diapositive.
  const debutGeste = (e: EvenementPointeur) => {
    if (e.pointerType === "mouse") return;
    departTactile.current = { x: e.clientX, y: e.clientY };
  };
  const finGeste = (e: EvenementPointeur) => {
    const depart = departTactile.current;
    departTactile.current = null;
    if (!depart) return;
    const dx = e.clientX - depart.x;
    const dy = e.clientY - depart.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) setActif((n) => borner(n + (dx < 0 ? 1 : -1)));
  };

  return (
    <div className="deck bruit relative grid min-h-dvh place-items-center bg-[#050f1d] print:block print:min-h-0 print:bg-transparent">
      <header className="contents">
        <h1 className="sr-only">Pilot M&amp;E — pitch deck</h1>
        <div
          role="progressbar"
          aria-label="Progression du deck"
          aria-valuemin={1}
          aria-valuemax={NOMBRE_DIAPOS}
          aria-valuenow={actif + 1}
          className="fixed top-0 left-0 z-50 h-[0.3rem] bg-accent transition-[width] duration-500 ease-soft print:hidden"
          style={{ width: `${((actif + 1) / NOMBRE_DIAPOS) * 100}%` }}
        />
        <p className="sr-only" aria-live="polite">
          Diapositive {actif + 1} sur {NOMBRE_DIAPOS} : {TITRES_DIAPOS[actif]}
        </p>
      </header>

      <main
        ref={scene}
        id="contenu"
        onPointerDown={debutGeste}
        onPointerUp={finGeste}
        className="shrink-0 touch-pan-y print:block"
        style={{ touchAction: "pan-y" }}
      >
        {DIAPOS.map((Diapo, i) => (
          <Diapo key={i} actif={i === actif} date={DATE} />
        ))}
      </main>

      <nav
        aria-label="Navigation du deck"
        className="fixed right-[1rem] bottom-[1rem] z-50 flex items-center gap-[0.4rem] rounded-full bg-black/55 p-[0.3rem] text-white backdrop-blur print:hidden"
      >
        <button
          type="button"
          aria-label="Diapositive précédente"
          onClick={() => aller(actif - 1)}
          disabled={actif === 0}
          className="grid size-[2.2rem] place-items-center rounded-full hover:bg-white/15 disabled:opacity-40"
        >
          <ChevronLeft className="size-[1.2rem]" aria-hidden />
        </button>
        <span className="min-w-[3.2rem] text-center font-mono text-[0.8rem]" aria-hidden>
          {actif + 1} / {NOMBRE_DIAPOS}
        </span>
        <button
          type="button"
          aria-label="Diapositive suivante"
          onClick={() => aller(actif + 1)}
          disabled={actif === DERNIERE}
          className="grid size-[2.2rem] place-items-center rounded-full hover:bg-white/15 disabled:opacity-40"
        >
          <ChevronRight className="size-[1.2rem]" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Plein écran"
          onClick={() =>
            document.fullscreenElement
              ? void document.exitFullscreen()
              : void document.documentElement.requestFullscreen?.()
          }
          className={cn("grid size-[2.2rem] place-items-center rounded-full hover:bg-white/15")}
        >
          <Expand className="size-[1.1rem]" aria-hidden />
        </button>
      </nav>
    </div>
  );
}
