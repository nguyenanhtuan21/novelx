import tseslint from "typescript-eslint";

export default [
  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/__pycache__/**",
      ".agents/**",
      ".claude/**",
    ],
  },
  ...tseslint.configs.recommended,
];
