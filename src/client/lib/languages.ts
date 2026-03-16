export const LANGUAGES = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "pt-BR", name: "Português", flag: "🇧🇷" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const SUPPORTED_LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGES.map(
  (l) => l.code,
);

export const DEFAULT_LANGUAGE: LanguageCode = "en";

export function isValidLanguageCode(code: string): code is LanguageCode {
  return SUPPORTED_LANGUAGE_CODES.includes(code as LanguageCode);
}

export function getLanguageByCode(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}
