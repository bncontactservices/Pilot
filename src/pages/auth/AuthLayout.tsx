import { Navigate, Outlet, useSearchParams } from "react-router";
import { AuthShell } from "~/components/app/AuthShell";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/lib/auth";

/** N'autorise qu'un retour interne vers l'application (pas de redirection ouverte). */
export function destinationSure(suite: string | null): string {
  return suite && /^\/app(\/[\w\-/]*)?$/.test(suite) ? suite : "/app";
}

export default function AuthLayout() {
  const { statut } = useAuth();
  const [params] = useSearchParams();
  if (statut === "connecte") return <Navigate to={destinationSure(params.get("suite"))} replace />;
  return <AuthShell>{statut === "chargement" ? <FormulaireEnChargement /> : <Outlet />}</AuthShell>;
}

export function FormulaireEnChargement() {
  return (
    <div className="grid grid-cols-1 gap-6" aria-busy>
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
