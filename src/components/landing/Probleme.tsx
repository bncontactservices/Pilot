import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useAnimation } from "~/lib/animation";

/** Fichiers et messages qui s'éparpillent : Excel, WhatsApp, e-mail. */
export function VisuelDispersion() {
  return (
    <svg viewBox="0 0 300 190" className="h-auto w-full overflow-visible" aria-hidden focusable="false">
      <g data-derive="1.2" transform="translate(30 34) rotate(-12)">
        <rect width="64" height="76" rx="9" fill="#fff" stroke="#E4E0D7" />
        <rect width="64" height="17" rx="9" fill="#1E7A32" />
        <rect y="10" width="64" height="7" fill="#1E7A32" />
        {[0, 1, 2].map((r) =>
          [0, 1].map((c) => (
            <rect key={`${r}${c}`} x={9 + c * 26} y={26 + r * 15} width="21" height="9" rx="2" fill="#E4E0D7" />
          )),
        )}
      </g>
      <g data-derive="-1.6" transform="translate(212 20) rotate(9)">
        <rect width="58" height="70" rx="9" fill="#fff" stroke="#E4E0D7" />
        <rect width="58" height="15" rx="9" fill="#1E7A32" />
        <rect y="9" width="58" height="6" fill="#1E7A32" />
        {[0, 1, 2].map((r) => (
          <rect key={r} x="9" y={26 + r * 14} width="40" height="8" rx="2" fill="#E4E0D7" />
        ))}
      </g>
      <g data-derive="1" transform="translate(112 64) rotate(-4)">
        <path
          d="M0 14 a14 14 0 0 1 14 -14 h58 a14 14 0 0 1 14 14 v26 a14 14 0 0 1 -14 14 h-40 l-16 14 v-14 h-2 a14 14 0 0 1 -14 -14z"
          fill="#12B886"
        />
        <rect x="14" y="14" width="52" height="6" rx="3" fill="#fff" opacity=".85" />
        <rect x="14" y="28" width="34" height="6" rx="3" fill="#fff" opacity=".6" />
      </g>
      <g data-derive="-1.1" transform="translate(40 118) rotate(6)">
        <path
          d="M0 12 a12 12 0 0 1 12 -12 h42 a12 12 0 0 1 12 12 v20 a12 12 0 0 1 -12 12 h-30 l-14 12 v-12 a12 12 0 0 1 -10 -12z"
          fill="#12B886"
          opacity=".75"
        />
        <rect x="12" y="12" width="38" height="6" rx="3" fill="#fff" opacity=".85" />
      </g>
      <g data-derive="1.4" transform="translate(206 112) rotate(-8)">
        <rect width="70" height="48" rx="8" fill="#fff" stroke="#E4E0D7" />
        <path d="M2 4 L35 30 L68 4" fill="none" stroke="#8A929B" strokeWidth="2.5" strokeLinejoin="round" />
      </g>
      <g fill="none" stroke="#8A929B" strokeWidth="1.5" strokeDasharray="3 5" strokeLinecap="round" opacity=".6">
        <path d="M150 95 L100 60" />
        <path d="M160 95 L215 70" />
        <path d="M150 105 L100 135" />
        <path d="M165 105 L215 135" />
      </g>
    </svg>
  );
}

/** Une pile de rapports et une horloge. */
export function VisuelRapports() {
  return (
    <svg viewBox="0 0 300 190" className="h-auto w-full overflow-visible" aria-hidden focusable="false">
      <g data-derive="1">
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${44 + i * 9} ${96 - i * 15}) rotate(${-4 + i * 2.4})`}>
            <rect width="104" height="74" rx="8" fill="#fff" stroke="#E4E0D7" />
            <rect x="12" y="12" width="46" height="7" rx="3.5" fill="#0B2545" opacity={0.85 - i * 0.12} />
            <rect x="12" y="28" width="80" height="5" rx="2.5" fill="#E4E0D7" />
            <rect x="12" y="40" width="68" height="5" rx="2.5" fill="#E4E0D7" />
            <rect x="12" y="52" width="76" height="5" rx="2.5" fill="#E4E0D7" />
          </g>
        ))}
      </g>
      <g data-derive="-1.4" transform="translate(222 58)">
        <circle r="46" fill="#fff" stroke="#0B2545" strokeWidth="4" />
        {Array.from({ length: 12 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1="-38"
            x2="0"
            y2={i % 3 === 0 ? -31 : -34}
            stroke="#8A929B"
            strokeWidth="2"
            transform={`rotate(${i * 30})`}
            strokeLinecap="round"
          />
        ))}
        <path d="M0 0 V-27" stroke="#0B2545" strokeWidth="4" strokeLinecap="round" />
        <path d="M0 0 L19 11" stroke="#0B2545" strokeWidth="4" strokeLinecap="round" />
        <circle r="4" fill="#E8590C" />
      </g>
    </svg>
  );
}

/** Un tableau flou et un point d'interrogation : on ne voit pas où on en est. */
export function VisuelFlou() {
  return (
    <div className="relative mx-auto w-full max-w-[19rem]" aria-hidden>
      <div className="grid gap-2 rounded-2xl bg-sand p-4 blur-[3px]">
        {[0, 1, 2, 3, 4].map((r) => (
          <div key={r} className="grid grid-cols-[1.6fr_1fr_1fr] gap-2">
            <span className="h-4 rounded bg-navy/25" />
            <span className="h-4 rounded bg-status-warn/45" />
            <span className="h-4 rounded bg-status-ok/40" />
          </div>
        ))}
      </div>
      <span
        data-derive="-1"
        className="absolute inset-0 m-auto grid size-20 place-items-center rounded-full bg-navy font-serif text-6xl font-semibold text-accent italic shadow-card-hover"
      >
        ?
      </span>
    </div>
  );
}

const CARTES = [
  { cle: "dispersees", Visuel: VisuelDispersion },
  { cle: "rapports", Visuel: VisuelRapports },
  { cle: "decisions", Visuel: VisuelFlou },
] as const;

export function Probleme() {
  const { t } = useTranslation();
  const racine = useRef<HTMLElement>(null);

  useAnimation(racine, ({ gsap, racine }) => {
    gsap.from(racine.querySelectorAll("[data-carte]"), {
      y: 44,
      opacity: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: "power3.out",
      scrollTrigger: { trigger: racine, start: "top 60%", once: true },
    });
    // Léger parallaxe : chaque élément dérive de part et d'autre de sa position naturelle (au milieu du défilement, il est à sa place).
    racine.querySelectorAll<SVGElement | HTMLElement>("[data-derive]").forEach((el) => {
      const k = Number(el.getAttribute("data-derive"));
      gsap.fromTo(
        el,
        { y: -9 * k },
        {
          y: 9 * k,
          ease: "none",
          scrollTrigger: { trigger: racine, start: "top bottom", end: "bottom top", scrub: true },
        },
      );
    });
  });

  return (
    <section
      ref={racine}
      id="probleme"
      aria-labelledby="titre-probleme"
      className="differe [--hauteur-estimee:98rem] md:[--hauteur-estimee:61rem] lg:[--hauteur-estimee:57rem] px-4 py-24 sm:px-6 sm:py-32"
    >
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-xs tracking-[0.18em] text-accent-ink uppercase">
          {t("landing.probleme.surtitre")}
        </p>
        <h2
          id="titre-probleme"
          className="mt-4 max-w-4xl font-serif text-4xl leading-[1.08] font-semibold text-navy italic sm:text-6xl"
        >
          {t("landing.probleme.titre")}
        </h2>
        <ul data-cartes className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {CARTES.map(({ cle, Visuel }) => (
            <li
              key={cle}
              data-carte
              className="flex flex-col gap-6 overflow-hidden rounded-[2rem] bg-card p-6 shadow-card transition-[box-shadow,transform] duration-300 ease-soft hover:scale-[1.01] hover:shadow-card-hover"
            >
              <div className="grid min-h-48 place-items-center">
                <Visuel />
              </div>
              <div className="grid gap-2">
                <h3 className="text-xl font-extrabold text-navy">{t(`landing.probleme.${cle}.titre`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`landing.probleme.${cle}.texte`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
