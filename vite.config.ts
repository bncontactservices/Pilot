import path from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: { "~": path.resolve(import.meta.dirname, "src") },
  },
  // Dépendances des routes chargées à la demande : pré-optimisées pour éviter qu'un
  // rechargement de Vite en développement ne charge deux copies de React.
  optimizeDeps: {
    include: [
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "@hookform/resolvers/zod",
      "@react-pdf/renderer",
      "@supabase/supabase-js",
      "@tanstack/react-query",
      "class-variance-authority",
      "clsx",
      "date-fns",
      "date-fns/locale",
      "i18next",
      "lucide-react",
      "papaparse",
      "radix-ui",
      "react-hook-form",
      "react-i18next",
      "recharts",
      "sonner",
      "tailwind-merge",
      "xlsx",
      "zod",
    ],
  },
});
