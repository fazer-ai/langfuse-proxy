import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import {
  DEFAULT_LANGUAGE,
  isValidLanguageCode,
  SUPPORTED_LANGUAGE_CODES,
} from "@/client/lib/languages";
import en from "@/client/locales/en.json";
import ptBR from "@/client/locales/pt-BR.json";

const LANGUAGE_STORAGE_KEY = "@app:language";

function getInitialLanguage(): string {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isValidLanguageCode(stored)) {
      return stored;
    }
  } catch {
    // NOTE: Ignore localStorage errors
  }

  const browserLang = navigator.language;
  if (isValidLanguageCode(browserLang)) {
    return browserLang;
  }

  const browserLangPrefix = browserLang.split("-")[0];
  const match = SUPPORTED_LANGUAGE_CODES.find(
    (lang) =>
      lang === browserLangPrefix || lang.startsWith(`${browserLangPrefix}-`),
  );
  if (match) {
    return match;
  }

  return DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "pt-BR": { translation: ptBR },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // NOTE: Ignore localStorage errors
  }
});

export default i18n;
