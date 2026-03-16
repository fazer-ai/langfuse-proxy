module.exports = {
  locales: ["en", "pt-BR"],
  output: "src/api/locales/$LOCALE.json",
  input: ["src/api/**/*.ts"],
  defaultNamespace: "translation",
  keySeparator: ".",
  namespaceSeparator: ":",
  contextSeparator: "_",
  createOldCatalogs: false,
  defaultValue: (_locale, _namespace, _key, value) => value || "",
  keepRemoved: false,
  lexers: {
    ts: [
      {
        lexer: "JavascriptLexer",
        functions: ["translate"],
      },
    ],
  },
  lineEnding: "lf",
  sort: true,
  verbose: true,
};
