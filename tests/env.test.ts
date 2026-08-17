import { afterEach, describe, expect, it, vi } from "vitest";

// env.ts captura process.env no topo do módulo; por isso cada cenário
// ajusta o ambiente e reimporta o módulo do zero.
async function loadEnv(values: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(values)) {
    if (v === undefined) vi.stubEnv(k, "");
    else vi.stubEnv(k, v);
  }
  return import("@/lib/env");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabasePublicEnv", () => {
  it("retorna url e publishableKey quando presentes", async () => {
    const { getSupabasePublicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
    });
    expect(getSupabasePublicEnv()).toEqual({
      url: "https://x.supabase.co",
      publishableKey: "pub-key",
    });
  });

  it("lança listando as chaves faltantes", async () => {
    const { getSupabasePublicEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
    });
    expect(() => getSupabasePublicEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });
});

describe("getSupabaseServerEnv", () => {
  it("inclui a secretKey quando tudo está presente", async () => {
    const { getSupabaseServerEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
      SUPABASE_SECRET_KEY: "secret",
    });
    expect(getSupabaseServerEnv()).toEqual({
      url: "https://x.supabase.co",
      publishableKey: "pub-key",
      secretKey: "secret",
    });
  });

  it("lança quando falta a secretKey", async () => {
    const { getSupabaseServerEnv } = await loadEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub-key",
      SUPABASE_SECRET_KEY: undefined,
    });
    expect(() => getSupabaseServerEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});

describe("getEmployeeOrganizationId", () => {
  it("retorna um UUID valido da organizacao", async () => {
    const { getEmployeeOrganizationId } = await loadEnv({
      EMPLOYEE_ORGANIZATION_ID: "11111111-1111-4111-8111-111111111111",
    });

    expect(getEmployeeOrganizationId()).toBe("11111111-1111-4111-8111-111111111111");
  });

  it.each([undefined, "not-a-uuid"])(
    "rejeita EMPLOYEE_ORGANIZATION_ID ausente ou invalido: %s",
    async (value) => {
      const { getEmployeeOrganizationId } = await loadEnv({
        EMPLOYEE_ORGANIZATION_ID: value,
      });

      expect(() => getEmployeeOrganizationId()).toThrow(/EMPLOYEE_ORGANIZATION_ID/);
    }
  );
});
