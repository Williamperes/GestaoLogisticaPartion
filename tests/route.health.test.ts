import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import { GET } from "@/app/api/health/supabase/route";

function fakeClient(getSessionResult: { error: { message: string } | null }) {
  return {
    auth: {
      getSession: vi.fn(async () => getSessionResult),
    },
  };
}

describe("GET /api/health/supabase", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 200 e ok:true quando a sessão é verificada", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(fakeClient({ error: null }));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, message: "Supabase client configured." });
  });

  it("retorna 500 quando getSession devolve erro", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue(
      fakeClient({ error: { message: "boom" } })
    );
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("boom");
  });

  it("retorna 500 quando a criação do client lança (env mal configurada)", async () => {
    mocks.createSupabaseServerClient.mockRejectedValue(new Error("no env"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("no env");
  });
});
