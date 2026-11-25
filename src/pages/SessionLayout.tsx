import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Outlet } from "react-router";
import { AuthProvider } from "~/lib/auth";
import { creerQueryClient } from "~/lib/query";

export default function SessionLayout() {
  const [queryClient] = useState(creerQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
