import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createSupabaseServerClient: vi.fn(),
  getDefaultAppPathForUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getDefaultAppPathForUser: mocks.getDefaultAppPathForUser,
}));

import { signInWithPassword } from "@/app/(auth)/actions";

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

describe("signInWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects back to login when email or password is missing", async () => {
    await expect(signInWithPassword(buildFormData({ email: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/login?error=Preencha email e senha."
    );

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("redirects with the auth error when Supabase rejects the sign in", async () => {
    const signInWithPasswordMock = vi.fn().mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid login credentials" },
    });

    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
      },
    });

    await expect(
      signInWithPassword(buildFormData({ email: "user@example.com", password: "wrong-pass" }))
    ).rejects.toThrow("NEXT_REDIRECT:/login?error=Invalid%20login%20credentials");

    expect(signInWithPasswordMock).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "wrong-pass",
    });
  });

  it("redirects to the user's default app after a successful sign in", async () => {
    const signInWithPasswordMock = vi.fn().mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });

    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: signInWithPasswordMock,
      },
    });
    mocks.getDefaultAppPathForUser.mockResolvedValue("/dashboard");

    await expect(
      signInWithPassword(buildFormData({ email: "user@example.com", password: "secret" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    expect(mocks.getDefaultAppPathForUser).toHaveBeenCalledWith("user-1");
  });
});
