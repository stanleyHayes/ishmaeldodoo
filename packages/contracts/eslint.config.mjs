import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.test.json, not tsconfig.json: the build config excludes specs
        // so they never reach dist, and the project service would then refuse to
        // parse them. This one covers every source file including tests.
        project: ["./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  { ignores: ["dist/**"] },
);
