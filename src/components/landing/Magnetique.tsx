import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "~/lib/utils";

/**
 * Effet magnétique subtil : le bouton suit légèrement le pointeur. Limité aux appareils à pointeur précis et
 * désactivé si l'utilisateur préfère moins de mouvement ; sur tactile, rien ne bouge.
 */
export function Magnetique({
  children,
  force = 0.25,
  className,
}: {
  children: ReactNode;
  force?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (
      !element ||
      !window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches
    )
      return;
    const deplacer = (e: PointerEvent) => {
      const r = element.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * force;
      const dy = (e.clientY - (r.top + r.height / 2)) * force;
      element.style.translate = `${Math.max(-8, Math.min(8, dx))}px ${Math.max(-6, Math.min(6, dy))}px`;
    };
    const rendre = () => {
      element.style.translate = "0 0";
    };
    element.addEventListener("pointermove", deplacer);
    element.addEventListener("pointerleave", rendre);
    return () => {
      element.removeEventListener("pointermove", deplacer);
      element.removeEventListener("pointerleave", rendre);
    };
  }, [force]);

  return (
    <span ref={ref} className={cn("inline-block transition-[translate] duration-200 ease-soft", className)}>
      {children}
    </span>
  );
}
