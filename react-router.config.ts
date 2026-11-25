import type { Config } from "@react-router/dev/config";

export default {
  appDirectory: "src",
  // Application monopage : seules les pages publiques indexables sont pré-rendues.
  ssr: false,
  prerender: ["/", "/mentions-legales", "/confidentialite", "/conditions-utilisation"],
} satisfies Config;
