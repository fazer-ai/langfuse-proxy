import { treaty } from "@elysiajs/eden";
import type { App } from "@/app";
import i18n from "@/client/lib/i18n";

export const api = treaty<App>(window.location.origin, {
  headers: () => ({
    "Accept-Language": i18n.language,
  }),
});
