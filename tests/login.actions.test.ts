import { beforeEach, describe, expect, it, vi } from "vitest";
import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getDefaultAppPathForUser: vi.fn(),
  getPrimaryAppRoleForUser: vi.fn(),
  getEmployeeOrganizationId: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/env", () => ({
  getEmployeeOrganizationId: mocks.getEmployeeOrganizationId,
}));

vi.mock("@/lib/auth/session", () => ({
  getDefaultAppPathForUser: mocks.getDefaultAppPathForUser,
  getPrimaryAppRoleForUser: mocks.getPrimaryAppRoleForUser,
}));

import {
  registerEmployee,
  signInEmployeeWithPassword,
  signInWithPassword,
  signOut,
} from "@/app/(auth)/actions";

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
      "NEXT_REDIRECT:/login?error=Preencha%20email%20e%20senha."
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
    mocks.getPrimaryAppRoleForUser.mockResolvedValue("admin");

    await expect(
      signInWithPassword(buildFormData({ email: "user@example.com", password: "secret" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");

    expect(mocks.getDefaultAppPathForUser).toHaveBeenCalledWith("user-1");
  });

  it("redirects back to login when only the password is missing", async () => {
    await expect(
      signInWithPassword(buildFormData({ email: "user@example.com" }))
    ).rejects.toThrow("NEXT_REDIRECT:/login?error=Preencha%20email%20e%20senha.");

    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("falls back to the default error message when Supabase gives no message", async () => {
    const signInWithPasswordMock = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { signInWithPassword: signInWithPasswordMock },
    });

    await expect(
      signInWithPassword(buildFormData({ email: "user@example.com", password: "secret" }))
    ).rejects.toThrow(
      `NEXT_REDIRECT:/login?error=${encodeURIComponent("Nao foi possivel entrar.")}`
    );
  });
});

describe("portais de login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function successfulClient(userId: string) {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: userId } },
          error: null,
        }),
        signOut: signOutMock,
      },
    });
    return signOutMock;
  }

  it("aceita funcionario no login principal e redireciona para seu destino", async () => {
    const signOutMock = successfulClient("employee-1");
    mocks.getPrimaryAppRoleForUser.mockResolvedValue("employee");
    mocks.getDefaultAppPathForUser.mockResolvedValue("/events");

    await expect(
      signInWithPassword(buildFormData({ email: "employee@example.com", password: "secret123" }))
    ).rejects.toThrow("NEXT_REDIRECT:/events");

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("aceita funcionario no portal de funcionarios", async () => {
    const signOutMock = successfulClient("employee-1");
    mocks.getPrimaryAppRoleForUser.mockResolvedValue("employee");
    mocks.getDefaultAppPathForUser.mockResolvedValue("/events");

    await expect(
      signInEmployeeWithPassword(
        buildFormData({ email: "EMPLOYEE@example.com", password: "secret123" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/events");

    expect(signOutMock).not.toHaveBeenCalled();
    expect(mocks.getPrimaryAppRoleForUser).toHaveBeenCalledWith("employee-1");
  });

  it("rejeita conta interna no portal de funcionarios e encerra a sessao", async () => {
    const signOutMock = successfulClient("admin-1");
    mocks.getPrimaryAppRoleForUser.mockResolvedValue("admin");

    await expect(
      signInEmployeeWithPassword(buildFormData({ email: "admin@example.com", password: "secret123" }))
    ).rejects.toThrow(
      `NEXT_REDIRECT:/login?portal=internal&error=${encodeURIComponent("Use o acesso da Equipe interna.")}`
    );

    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("mantem erros de credenciais no portal de funcionarios", async () => {
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null },
          error: { message: "Invalid login credentials" },
        }),
      },
    });

    await expect(
      signInEmployeeWithPassword(buildFormData({ email: "employee@example.com", password: "wrong" }))
    ).rejects.toThrow(
      "NEXT_REDIRECT:/login?portal=employee&error=Invalid%20login%20credentials"
    );
  });
});

describe("registerEmployee", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEmployeeOrganizationId.mockReturnValue("11111111-1111-4111-8111-111111111111");
  });

  it.each([
    [{ full_name: "", email: "ana@example.com", password: "secret123", password_confirmation: "secret123" }, "Informe seu nome completo."],
    [{ full_name: "Ana Lima", email: "invalid", password: "secret123", password_confirmation: "secret123" }, "Informe um email valido."],
    [{ full_name: "Ana Lima", email: "ana@example.com", password: "short", password_confirmation: "short" }, "A senha deve ter pelo menos 8 caracteres."],
    [{ full_name: "Ana Lima", email: "ana@example.com", password: "secret123", password_confirmation: "different" }, "As senhas nao coincidem."],
  ])("rejeita dados invalidos antes de acessar o Supabase", async (values, message) => {
    await expect(registerEmployee(buildFormData(values))).rejects.toThrow(
      `NEXT_REDIRECT:/login?portal=employee&mode=register&error=${encodeURIComponent(message)}`
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("cria usuario employee, membership primaria e sessao", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "employee-1" } },
      error: null,
    });
    const deleteUser = vi.fn();
    const adminDatabase = fakeSupabase({
      organizations: [() => chain({ data: { id: "org-1", is_active: true }, error: null })],
      organization_members: [() => chain({ error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      ...adminDatabase,
      auth: { admin: { createUser, deleteUser } },
    });
    const signIn = vi.fn().mockResolvedValue({ data: { user: { id: "employee-1" } }, error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({ auth: { signInWithPassword: signIn } });

    const formData = buildFormData({
      full_name: "Ana Lima",
      email: "ANA@EXAMPLE.COM",
      password: "secret123",
      password_confirmation: "secret123",
      role: "admin",
    });
    await expect(registerEmployee(formData)).rejects.toThrow("NEXT_REDIRECT:/events");

    expect(createUser).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "secret123",
      email_confirm: true,
      user_metadata: { full_name: "Ana Lima" },
    });
    const membershipCalls = vi.mocked(adminDatabase.from).mock.results[1].value._calls;
    expect(membershipCalls).toContainEqual({
      method: "insert",
      args: [{ user_id: "employee-1", organization_id: "11111111-1111-4111-8111-111111111111", role: "employee", is_primary: true }],
    });
    expect(deleteUser).not.toHaveBeenCalled();
    expect(signIn).toHaveBeenCalledWith({ email: "ana@example.com", password: "secret123" });
  });

  it("remove o usuario Auth quando a membership falha", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
    const adminDatabase = fakeSupabase({
      organizations: [() => chain({ data: { id: "org-1", is_active: true }, error: null })],
      organization_members: [() => chain({ error: new Error("membership failed") })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      ...adminDatabase,
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: "employee-1" } }, error: null }),
          deleteUser,
        },
      },
    });

    await expect(registerEmployee(validRegistration())).rejects.toThrow(
      /Nao%20foi%20possivel%20concluir%20o%20cadastro/
    );
    expect(deleteUser).toHaveBeenCalledWith("employee-1");
    expect(mocks.createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("preserva a conta e orienta login quando a sessao final falha", async () => {
    const deleteUser = vi.fn();
    const adminDatabase = fakeSupabase({
      organizations: [() => chain({ data: { id: "org-1", is_active: true }, error: null })],
      organization_members: [() => chain({ error: null })],
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      ...adminDatabase,
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: "employee-1" } }, error: null }),
          deleteUser,
        },
      },
    });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { signInWithPassword: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error("cookie") }) },
    });

    await expect(registerEmployee(validRegistration())).rejects.toThrow(
      /portal=employee&message=Conta%20criada.%20Entre%20com%20seu%20email%20e%20senha./
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("usa mensagem generica quando a configuracao ou organizacao esta indisponivel", async () => {
    mocks.getEmployeeOrganizationId.mockImplementation(() => {
      throw new Error("Missing EMPLOYEE_ORGANIZATION_ID");
    });

    await expect(registerEmployee(validRegistration())).rejects.toThrow(
      /Cadastro%20temporariamente%20indisponivel/
    );
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

function validRegistration() {
  return buildFormData({
    full_name: "Ana Lima",
    email: "ana@example.com",
    password: "secret123",
    password_confirmation: "secret123",
  });
}

describe("signOut", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs out via Supabase and redirects to login", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { signOut: signOutMock },
    });

    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT:/login");

    expect(signOutMock).toHaveBeenCalled();
  });
});
