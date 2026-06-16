import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Default node; testes de componente optam por jsdom via docblock
    // `// @vitest-environment jsdom` no topo do arquivo.
    environment: "node",
    // globals: true ativa o auto-cleanup do Testing Library entre os testes.
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      // Conta TODOS os arquivos de src, mesmo os nunca importados por um
      // teste (ex.: componentes .tsx), para um % honesto do repositório.
      all: true,
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/layout.tsx",
        "src/**/loading.tsx",
        "src/middleware.ts",
      ],
    },
  },
});
