import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(),
  getSupabasePublicEnv: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({ createBrowserClient: mocks.createBrowserClient }));
vi.mock("@/lib/env", () => ({ getSupabasePublicEnv: mocks.getSupabasePublicEnv }));

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createSupabaseBrowserClient", () => {
  it("cria o browser client com url/publishableKey e encaminha o resultado", () => {
    mocks.getSupabasePublicEnv.mockReturnValue({ url: "https://x.supabase.co", publishableKey: "pub" });
    const client = { tag: "browser-client" };
    mocks.createBrowserClient.mockReturnValue(client);

    const result = createSupabaseBrowserClient();

    expect(result).toBe(client);
    expect(mocks.createBrowserClient).toHaveBeenCalledWith("https://x.supabase.co", "pub");
  });
});
