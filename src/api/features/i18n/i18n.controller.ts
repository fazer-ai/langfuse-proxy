import Elysia from "elysia";
import i18n from "@/api/lib/i18n";

export const i18nController = new Elysia({ prefix: "/i18n" }).get(
  "/locales",
  () => {
    const languages = Object.keys(i18n.options.resources ?? {});
    return { languages };
  },
);
