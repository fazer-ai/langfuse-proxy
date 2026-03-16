import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLanguageByCode, LANGUAGES } from "@/client/lib/languages";
import { cn } from "@/client/lib/utils";

export function LanguagePicker() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const currentLang = getLanguageByCode(i18n.language);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const handleSelect = (code: string) => {
    i18n.changeLanguage(code);
    setIsOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 font-medium text-sm text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
        aria-label="Change language"
      >
        <span className="text-base">{currentLang.flag}</span>
        <span className="hidden sm:inline">{currentLang.name}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", {
            "rotate-180": isOpen,
          })}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 z-50 mt-1 min-w-40 overflow-hidden rounded-lg border border-border bg-bg-secondary shadow-lg">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              onClick={() => handleSelect(lang.code)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                {
                  "bg-bg-hover text-text-primary":
                    lang.code === currentLang.code,
                  "text-text-secondary hover:bg-bg-tertiary":
                    lang.code !== currentLang.code,
                },
              )}
            >
              <span className="text-base">{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
