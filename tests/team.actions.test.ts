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

import { createTeamMember, deleteTeamMember, updateTeamMember } from "@/app/(dashboard)/team/actions";

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
      "NEXT_REDIRECT:/team?success=Técnico cadastrado."
    );

    expect(mocks.ensureTeamSpecialty).toHaveBeenCalledWith("org-1", "Equipe");
    expect(insert).toHaveBeenCalledWith({
      organization_id: "org-1",
      name: "Diego Almeida",
      specialty_id: "specialty-1",
      role: "Operador FOH",
      phone: "11999999999",
      email: "diego@partion.com",
      notes: "Disponivel para viagens",
      available: true,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/team");
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
    ).rejects.toThrow("NEXT_REDIRECT:/team?success=Técnico atualizado.");

    expect(update).toHaveBeenCalledWith({
      name: "Camila Souza",
      role: "Luz",
      phone: "11888888888",
      email: "camila@partion.com",
      notes: "Plantao noturno",
      available: false,
    });
    expect(eqId).toHaveBeenCalledWith("id", "member-1");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
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
      "NEXT_REDIRECT:/team?success=Técnico apagado."
    );

    expect(deleteFn).toHaveBeenCalled();
    expect(eqId).toHaveBeenCalledWith("id", "member-1");
    expect(eqOrg).toHaveBeenCalledWith("organization_id", "org-1");
  });
});
