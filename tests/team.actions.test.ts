import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  ensureTeamSpecialty: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

vi.mock("@/lib/team", () => ({
  ensureTeamSpecialty: mocks.ensureTeamSpecialty,
}));

import {
  createTeamMember,
  deleteTeamMember,
  provisionTeamMemberAccess,
  resetTeamMemberPassword,
  updateTeamMember,
} from "@/app/(dashboard)/team/actions";

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

describe("team actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthorized users away from team mutations", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "client" });

    await expect(
      createTeamMember(buildFormData({ name: "Diego", role: "FOH" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("creates a team member using the resolved specialty", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.ensureTeamSpecialty.mockResolvedValue({ id: "specialty-1" });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert,
      }),
    });

    const formData = buildFormData({
      name: "Diego Almeida",
      role: "Operador FOH",
      phone: "11999999999",
      email: "diego@partion.com",
      notes: "Disponivel para viagens",
      available: "on",
    });

    await expect(createTeamMember(formData)).rejects.toThrow(
      `NEXT_REDIRECT:/team?success=${encodeURIComponent("Técnico cadastrado.")}`
    );

    expect(mocks.ensureTeamSpecialty).toHaveBeenCalledWith("org-1", "Equipe");
    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      name: "Diego Almeida",
      specialty_id: "specialty-1",
      role: "Operador FOH",
      phone: "11999999999",
      email: "diego@partion.com",
      city: null,
      notes: "Disponivel para viagens",
      available: true,
      user_id: null,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/team");
  });

  it("persists the city when provided on create", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.ensureTeamSpecialty.mockResolvedValue({ id: "specialty-1" });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ insert }),
    });

    await expect(
      createTeamMember(
        buildFormData({ name: "Diego", role: "FOH", city: "  São Paulo  " })
      )
    ).rejects.toThrow(
      `NEXT_REDIRECT:/team?success=${encodeURIComponent("Técnico cadastrado.")}`
    );

    // city é trimada e persistida.
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ city: "São Paulo" })
    );
  });

  it("updates a team member scoped by id and organization", async () => {
    const eqOrg = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "operations",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update,
      }),
    });

    await expect(
      updateTeamMember(
        buildFormData({
          id: "member-1",
          name: "Camila Souza",
          role: "Luz",
          phone: "11888888888",
          email: "camila@partion.com",
          notes: "Plantao noturno",
        })
      )
    ).rejects.toThrow(
      `NEXT_REDIRECT:/team?success=${encodeURIComponent("Técnico atualizado.")}`
    );

    expect(update).toHaveBeenCalledWith({
      name: "Camila Souza",
      role: "Luz",
      phone: "11888888888",
      email: "camila@partion.com",
      city: null,
      notes: "Plantao noturno",
      available: false,
    });
    expect(eqId).toHaveBeenCalledWith("id", "member-1");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("provisions login: creates auth user, inserts org member, links team_members.user_id", async () => {
    const teamInsert = vi.fn().mockResolvedValue({ error: null });
    const orgInsert = vi.fn().mockResolvedValue({ error: null });
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-new" } },
      error: null,
    });
    const deleteUser = vi.fn();

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.ensureTeamSpecialty.mockResolvedValue({ id: "specialty-1" });

    const from = vi.fn((table: string) => {
      if (table === "organization_members") return { insert: orgInsert };
      if (table === "team_members") return { insert: teamInsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      auth: { admin: { createUser, deleteUser } },
    });

    const formData = buildFormData({
      name: "Diego Almeida",
      role: "Operador FOH",
      email: "diego@partion.com",
      provision_access: "on",
      access_role: "warehouse",
      password: "tempPass123",
    });

    await expect(createTeamMember(formData)).rejects.toThrow(/Senha%20tempor%C3%A1ria/);

    expect(createUser).toHaveBeenCalledWith({
      email: "diego@partion.com",
      password: "tempPass123",
      email_confirm: true,
      user_metadata: { full_name: "Diego Almeida" },
    });
    expect(orgInsert).toHaveBeenCalledWith({
      user_id: "user-new",
      organization_id: "org-1",
      role: "warehouse",
      is_primary: true,
    });
    expect(teamInsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-new" })
    );
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("provisioning denied for operations role", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "operations",
      primaryOrganization: { id: "org-1" },
    });

    await expect(
      createTeamMember(
        buildFormData({
          name: "X",
          role: "FOH",
          email: "x@y.com",
          provision_access: "on",
          access_role: "warehouse",
          password: "longpass1",
        })
      )
    ).rejects.toThrow(/Apenas administradores/);
  });

  it("compensates by deleting auth user if organization_members insert fails", async () => {
    const orgInsert = vi.fn().mockResolvedValue({ error: { message: "dup" } });
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-orphan" } },
      error: null,
    });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.ensureTeamSpecialty.mockResolvedValue({ id: "specialty-1" });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ insert: orgInsert })),
      auth: { admin: { createUser, deleteUser } },
    });

    await expect(
      createTeamMember(
        buildFormData({
          name: "X",
          role: "FOH",
          email: "x@y.com",
          provision_access: "on",
          access_role: "warehouse",
          password: "longpass1",
        })
      )
    ).rejects.toThrow(/NEXT_REDIRECT.*error=dup/);

    expect(deleteUser).toHaveBeenCalledWith("user-orphan");
  });

  it("rejects provisioning with password shorter than 8 chars", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });

    await expect(
      createTeamMember(
        buildFormData({
          name: "X",
          role: "FOH",
          email: "x@y.com",
          provision_access: "on",
          access_role: "warehouse",
          password: "short",
        })
      )
    ).rejects.toThrow(/8 caracteres/);
  });

  it("resets password: admin + linked user_id → calls updateUserById", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "user-9", email: "x@y.com" },
      error: null,
    });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqId }));
    const updateUserById = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
      auth: { admin: { updateUserById } },
    });

    await expect(
      resetTeamMemberPassword(
        buildFormData({ id: "member-1", password: "newpass123" })
      )
    ).rejects.toThrow(/Senha%20redefinida/);

    expect(updateUserById).toHaveBeenCalledWith("user-9", { password: "newpass123" });
  });

  it("reset password denied for non-admin", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "operations",
      primaryOrganization: { id: "org-1" },
    });

    await expect(
      resetTeamMemberPassword(
        buildFormData({ id: "member-1", password: "newpass123" })
      )
    ).rejects.toThrow(/Apenas administradores/);
  });

  it("reset password rejects when member has no user_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: null, email: "x@y.com" },
      error: null,
    });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqId }));

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
      auth: { admin: { updateUserById: vi.fn() } },
    });

    await expect(
      resetTeamMemberPassword(
        buildFormData({ id: "member-1", password: "newpass123" })
      )
    ).rejects.toThrow(/não possui acesso/);
  });

  it("reset password rejects short password", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });

    await expect(
      resetTeamMemberPassword(buildFormData({ id: "member-1", password: "abc" }))
    ).rejects.toThrow(/8 caracteres/);
  });

  it("provisions access for an existing member: creates user, org member, links user_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: null, email: "diego@partion.com", name: "Diego Almeida" },
      error: null,
    });
    const selectEqOrg = vi.fn(() => ({ maybeSingle }));
    const selectEqId = vi.fn(() => ({ eq: selectEqOrg }));
    const select = vi.fn(() => ({ eq: selectEqId }));

    const updateEqOrg = vi.fn().mockResolvedValue({ error: null });
    const updateEqId = vi.fn(() => ({ eq: updateEqOrg }));
    const update = vi.fn(() => ({ eq: updateEqId }));

    const orgInsert = vi.fn().mockResolvedValue({ error: null });
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-new" } },
      error: null,
    });
    const deleteUser = vi.fn();

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });

    const from = vi.fn((table: string) => {
      if (table === "team_members") return { select, update };
      if (table === "organization_members") return { insert: orgInsert };
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      auth: { admin: { createUser, deleteUser } },
    });

    await expect(
      provisionTeamMemberAccess(
        buildFormData({
          id: "member-1",
          access_role: "warehouse",
          password: "tempPass123",
        })
      )
    ).rejects.toThrow(/Acesso%20criado/);

    expect(createUser).toHaveBeenCalledWith({
      email: "diego@partion.com",
      password: "tempPass123",
      email_confirm: true,
      user_metadata: { full_name: "Diego Almeida" },
    });
    expect(orgInsert).toHaveBeenCalledWith({
      user_id: "user-new",
      organization_id: "org-1",
      role: "warehouse",
      is_primary: true,
    });
    expect(update).toHaveBeenCalledWith({ user_id: "user-new" });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("provision access denied for non-admin", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "operations",
      primaryOrganization: { id: "org-1" },
    });

    await expect(
      provisionTeamMemberAccess(
        buildFormData({ id: "member-1", access_role: "warehouse", password: "longpass1" })
      )
    ).rejects.toThrow(/Apenas administradores/);
  });

  it("provision access rejects when member already has user_id", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: "user-9", email: "x@y.com", name: "X" },
      error: null,
    });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqId }));

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
      auth: { admin: { createUser: vi.fn() } },
    });

    await expect(
      provisionTeamMemberAccess(
        buildFormData({ id: "member-1", access_role: "warehouse", password: "longpass1" })
      )
    ).rejects.toThrow(/já possui acesso/);
  });

  it("provision access rejects when member has no email", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { user_id: null, email: null, name: "X" },
      error: null,
    });
    const eqOrg = vi.fn(() => ({ maybeSingle }));
    const eqId = vi.fn(() => ({ eq: eqOrg }));
    const select = vi.fn(() => ({ eq: eqId }));

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn(() => ({ select })),
      auth: { admin: { createUser: vi.fn() } },
    });

    await expect(
      provisionTeamMemberAccess(
        buildFormData({ id: "member-1", access_role: "warehouse", password: "longpass1" })
      )
    ).rejects.toThrow(/Cadastre um email/);
  });

  it("deletes a team member scoped by id and organization", async () => {
    const eqOrg = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
    const deleteFn = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({
      role: "super_admin",
      primaryOrganization: { id: "org-1" },
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: deleteFn,
      }),
    });

    await expect(deleteTeamMember(buildFormData({ id: "member-1" }))).rejects.toThrow(
      `NEXT_REDIRECT:/team?success=${encodeURIComponent("Técnico apagado.")}`
    );

    expect(deleteFn).toHaveBeenCalled();
    expect(eqId).toHaveBeenCalledWith("id", "member-1");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
  });
});
