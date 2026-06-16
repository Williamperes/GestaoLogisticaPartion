import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  createClient: vi.fn(),
  getSupabasePublicEnv: vi.fn(),
  getSupabaseServerEnv: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/env", () => ({
  getSupabasePublicEnv: mocks.getSupabasePublicEnv,
  getSupabaseServerEnv: mocks.getSupabaseServerEnv,
}));

import { createSupabaseAdminClient, createSupabaseServerClient } from "@/lib/supabase/server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSupabaseServerClient", () => {
  it("cria o client com url/publishableKey e encaminha o resultado", async () => {
    mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://x.supabase.co", publishableKey: "pub" });
    const cookieStore = { getAll: vi.fn(() => [{ name: "c", value: "v" }]), set: vi.fn() };
    mocks.cookies.mockResolvedValue(cookieStore);
    const client = { tag: "server-client" };
    mocks.createServerClient.mockReturnValue(client);

    const result = await createSupabaseServerClient();

    expect(result).toBe(client);
    expect(mocks.createServerClient).toHaveBeenCalledTimes(1);
    const [url, key, options] = mocks.createServerClient.mock.calls[0];
    expect(url).toBe("https://x.supabase.co");
    expect(key).toBe("pub");

    // getAll delega ao cookieStore
    expect(options.cookies.getAll()).toEqual([{ name: "c", value: "v" }]);
    expect(cookieStore.getAll).toHaveBeenCalled();

    // setAll repassa cada cookie ao cookieStore.set
    options.cookies.setAll([{ name: "a", value: "1", options: { path: "/" } }]);
    expect(cookieStore.set).toHaveBeenCalledWith("a", "1", { path: "/" });
  });

  it("setAll engole erros quando cookieStore.set lança", async () => {
    mocks.getSupabasePublicEnv.mockReturnValue({ url: "u", publishableKey: "p" });
    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("cannot mutate");
      }),
    };
    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockReturnValue({});

    await createSupabaseServerClient();
    const options = mocks.createServerClient.mock.calls[0][2];
    expect(() => options.cookies.setAll([{ name: "x", value: "y", options: {} }])).not.toThrow();
  });
});

describe("createSupabaseAdminClient", () => {
  it("cria o client com url/secretKey e flags de auth, encaminhando o resultado", () => {
    mocks.getSupabaseServerEnv.mockReturnValue({ url: "https://x.supabase.co", secretKey: "secret" });
    const admin = { tag: "admin-client" };
    mocks.createClient.mockReturnValue(admin);

    const result = createSupabaseAdminClient();

    expect(result).toBe(admin);
    expect(mocks.createClient).toHaveBeenCalledWith("https://x.supabase.co", "secret", {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });
});
