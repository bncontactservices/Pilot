import { defineConfig, devices } from "@playwright/test";

// Comptes de test du parcours authentifié (fichier ignoré par git, voir e2e/README.md).
for (const fichier of [".env.e2e", ".env.local"]) {
  try {
    process.loadEnvFile(fichier);
  } catch {
    // absent : les tests authentifiés sont ignorés
  }
}

// Les tests visent le BUILD servi avec les en-têtes de vercel.json (npm run apercu), pas le serveur de développement :
// c'est ce qui sera déployé, avec sa politique de sécurité. Chrome du poste (aucun téléchargement de navigateur).
const PORT = 4173;
const CANAL = { channel: "chrome" as const };

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { actionTimeout: 20_000, baseURL: `http://localhost:${PORT}`, locale: "fr-FR", timezoneId: "Africa/Dakar", ...CANAL, trace: "retain-on-failure" },
  webServer: {
    command: "node scripts/apercu-build.mjs " + PORT,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    { name: "bureau", use: { ...devices["Desktop Chrome"], ...CANAL, viewport: { width: 1280, height: 720 } } },
    { name: "mobile-375", use: { ...devices["Pixel 5"], ...CANAL, viewport: { width: 375, height: 812 } } },
  ],
});
