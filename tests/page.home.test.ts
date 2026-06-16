import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUserContext: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUserContext: mocks.getCurrentUserContext }));

import Home from "@/app/page";

describe("Home (/) — roteamento por sessão", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redireciona para /login sem contexto", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(Home()).rejects.toThrow("REDIRECT:/login");
  });

  it("redireciona cliente para /client", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });
    await expect(Home()).rejects.toThrow("REDIRECT:/client");
  });

  it("redireciona demais papéis para /dashboard", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    await expect(Home()).rejects.toThrow("REDIRECT:/dashboard");
  });
});
