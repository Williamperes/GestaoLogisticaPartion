import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import { getTeamMemberByUserId, teamMemberHasEventAccess } from "@/lib/team";

function chain(value: unknown) {
  const calls: { method: string; args: unknown[] }[] = [];
  const obj: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(obj, {
    get(_t, prop) {
      if (prop === "then") {
        return (resolve: (v: unknown) => unknown) => resolve(value);
      }
      if (prop === "_calls") return calls;
      return (...args: unknown[]) => {
        calls.push({ method: String(prop), args });
        return proxy;
      };
    },
  });
  return proxy as Record<string, (...args: unknown[]) => unknown> & {
    _calls: { method: string; args: unknown[] }[];
  };
}

describe("getTeamMemberByUserId", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns row when team_member is linked to user", async () => {
    const row = chain({ data: { id: "tm-1" }, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => row),
    });

    const result = await getTeamMemberByUserId("user-1", "org-1");
    expect(result).toEqual({ id: "tm-1" });
  });

  it("returns null when not linked", async () => {
    const row = chain({ data: null, error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => row),
    });

    const result = await getTeamMemberByUserId("user-x", "org-1");
    expect(result).toBeNull();
  });
});

describe("teamMemberHasEventAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when there is at least one schedule row for this event", async () => {
    const row = chain({ data: [{ event_dates: { event_id: "evt-1" } }], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => row),
    });

    const result = await teamMemberHasEventAccess("tm-1", "evt-1");
    expect(result).toBe(true);
  });

  it("returns false when there are no rows", async () => {
    const row = chain({ data: [], error: null });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => row),
    });

    const result = await teamMemberHasEventAccess("tm-1", "evt-1");
    expect(result).toBe(false);
  });
});
