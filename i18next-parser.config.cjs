module.exports = {
  locales: ["en", "pt-BR"],
  output: "src/client/locales/$LOCALE.json",
  input: ["src/client/**/*.{ts,tsx}"],
  defaultNamespace: "translation",
  keySeparator: ".",
  namespaceSeparator: ":",
  contextSeparator: "_",
  createOldCatalogs: false,
  defaultValue: (_locale, _namespace, _key, value) => value || "",
  keepRemoved: false,
  lexers: {
    ts: ["JavascriptLexer"],
    tsx: ["JsxLexer"],
  },
  lineEnding: "lf",
  sort: true,
  verbose: true,
};
