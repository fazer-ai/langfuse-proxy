# GitHub Copilot Instructions

- Only add comments when strictly necessary. Never include obvious and redundant comments.
- Comments should always have a tag such as `// TODO:`, `// NOTE:`, or `// FIXME:` to indicate their purpose.
- "fazer.ai" should always be styled as "fazer.ai" (all lowercase). In specific cases, "fazer-ai" is acceptable as well. Never use "Fazer.ai" or "Fazer.AI".
- Always update localization keys when adding or modifying user-facing text.
- Always consider UX for backend requests: loading states, debouncing, error handling, and user feedback.
- Always run `bun check` after applying all code changes to ensure code quality and correctness.
- Never add keys manually to localization files. Always use `bun i18n:extract` to extract and add new keys.
- Use magic comments like `// t('translation.key', 'Translation')` to indicate localization keys inside static objects that do not have access to `t` function.
- Never forget to also update the localization files for non-English languages with the correct translations.
- Always use the `cn` utility when appropriate for component classNames.
- For conditional classNames, always use the object syntax `cn("base", { "active": isActive })` instead of ternary operators.
- Always check `.env.example` when adding new environment variables to ensure consistency.
- Add `aria-*` attributes for accessibility on interactive elements.
