type ClassValue = string | undefined | null | false | Record<string, boolean>;

/**
 * Merges class names, filtering out falsy values.
 * Supports strings and objects with boolean values.
 * @example cn("base", { "active": isActive, "disabled": isDisabled })
 */
export function cn(...classes: ClassValue[]): string {
  return classes
    .flatMap((c) => {
      if (!c) return [];
      if (typeof c === "string") return c;
      return Object.entries(c)
        .filter(([, v]) => v)
        .map(([k]) => k);
    })
    .join(" ");
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

// NOTE: process.env.BUN_PUBLIC_CDN_URL is inlined at build time via define in build.ts.
// In production builds, the define replacement removes the process reference entirely.
// In dev, process may not exist in the browser — the try/catch handles that gracefully.
let CDN_URL = "";
try {
  CDN_URL = (process.env.BUN_PUBLIC_CDN_URL || "").replace(/\/$/, "");
} catch {}

export function getAssetUrl(path: string): string {
  if (!CDN_URL) return path;
  return `${CDN_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
