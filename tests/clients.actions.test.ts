import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
  resolveUniqueOrganizationSlug: vi.fn(),
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

vi.mock("@/lib/clients", () => ({
  resolveUniqueOrganizationSlug: mocks.resolveUniqueOrganizationSlug,
}));

import { createClient, deleteClient, updateClient } from "@/app/(dashboard)/clients/actions";

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

describe("client actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthorized users away from client mutations", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);

    await expect(createClient(buildFormData({ name: "Acme" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard?error=unauthorized"
    );

    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("creates a client with the resolved slug and redirects with success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("acme");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert,
      }),
    });

    await expect(
      createClient(
        buildFormData({
          name: "Acme",
          contactName: "Maria",
          contactEmail: "maria@acme.com",
          contactPhone: "11999999999",
          address: "Rua A",
          city: "Sao Paulo",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente cadastrado.");

    expect(mocks.resolveUniqueOrganizationSlug).toHaveBeenCalledWith("Acme");
    expect(insert).toHaveBeenCalledWith({
      name: "Acme",
      slug: "acme",
      type: "client",
      contact_name: "Maria",
      contact_email: "maria@acme.com",
      contact_phone: "11999999999",
      address: "Rua A",
      city: "Sao Paulo",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/clients");
  });

  it("updates a client and filters by id and type", async () => {
    const eqType = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqType });
    const update = vi.fn().mockReturnValue({ eq: eqId });

    mocks.getCurrentUserContext.mockResolvedValue({ role: "operations" });
    mocks.resolveUniqueOrganizationSlug.mockResolvedValue("novo-cliente");
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({
        update,
      }),
    });

    await expect(
      updateClient(
        buildFormData({
          id: "client-1",
          name: "Novo Cliente",
          contactName: "Ana",
          contactEmail: "ana@cliente.com",
          contactPhone: "11888888888",
          address: "Rua B",
          city: "Campinas",
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/clients?success=Cliente atualizado.");

    expect(update).toHaveBeenCalledWith({
      name: "Novo Cliente",
      slug: "novo-cliente",
      contact_name: "Ana",
      contact_email: "ana@cliente.com",
      contact_phone: "11888888888",
      address: "Rua B",
      city: "Campinas",
    });
    expect(eqId).toHaveBeenCalledWith("id", "client-1");
    expect(eqType).toHaveBeenCalledWith("type", "client");
  });

  it("rejects delete when the client id is missing", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });

    await expect(deleteClient(buildFormData({ id: "" }))).rejects.toThrow(
      "NEXT_REDIRECT:/clients?error=Cliente inválido."
    );
  });
});
