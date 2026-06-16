// Setup global para testes — habilita matchers do jest-dom
// (toBeInTheDocument, toHaveClass, etc.) nos testes de componente (jsdom).
// É seguro em ambiente node: apenas estende `expect`.
import "@testing-library/jest-dom/vitest";
