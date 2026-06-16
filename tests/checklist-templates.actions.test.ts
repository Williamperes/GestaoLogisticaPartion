import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  revalidatePath: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getCurrentUserContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));
vi.mock("@/lib/auth/session", () => ({
  getCurrentUserContext: mocks.getCurrentUserContext,
}));

import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
} from "@/app/(dashboard)/settings/checklist-templates/actions";

/** Thenable proxy that resolves to `value` and records every method call. */
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

function fakeSupabase(routes: Record<string, Array<() => unknown>>) {
  const calls: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      const idx = calls[table] ?? 0;
      calls[table] = idx + 1;
      const builders = routes[table];
      if (!builders) throw new Error(`Unexpected table: ${table}`);
      const builder = builders[idx] ?? builders[builders.length - 1];
      return builder();
    }),
    _calls: () => calls,
  };
}

function buildFormData(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

const ADMIN_CONTEXT = {
  role: "admin",
  userId: "user-1",
  primaryOrganization: { id: "org-1" },
};

/** Build a supabase mock whose access check for `templateId` succeeds. */
function withTemplateAccess(extraRoutes: Record<string, Array<() => unknown>> = {}) {
  return fakeSupabase({
    ...extraRoutes,
    checklist_templates: [
      () => chain({ data: { id: "tpl-1", organization_id: "org-1" }, error: null }),
      ...(extraRoutes.checklist_templates ?? []),
    ],
  });
}

describe("checklist-templates actions", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Autorização ──────────────────────────────────────────────────

  it("bloqueia papel insuficiente (warehouse não pode)", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({
      role: "warehouse",
      primaryOrganization: { id: "org-1" },
    });
    await expect(
      createTemplate(buildFormData({ name: "Padrão" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("bloqueia usuário não autenticado", async () => {
    mocks.getCurrentUserContext.mockResolvedValue(null);
    await expect(
      createTemplate(buildFormData({ name: "Padrão" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=unauthorized");
  });

  it("rejeita quando não há organização", async () => {
    mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
    await expect(
      createTemplate(buildFormData({ name: "Padrão" }))
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
  });

  // ── createTemplate ───────────────────────────────────────────────

  describe("createTemplate", () => {
    it("exige nome", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(createTemplate(buildFormData({ name: "  " }))).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=Nome obrigatório."
      );
    });

    it("cria template e redireciona para a página dele", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const insert = chain({ data: { id: "tpl-9" }, error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ checklist_templates: [() => insert] })
      );

      await expect(
        createTemplate(buildFormData({ name: "Padrão", description: "desc" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-9?success=Template criado."
      );

      expect(insert._calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
        organization_id: "org-1",
        name: "Padrão",
        description: "desc",
        is_default: false,
      });
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/checklist-templates");
    });

    it("propaga erro do banco ao inserir", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [() => chain({ data: null, error: { message: "insert boom" } })],
        })
      );
      await expect(
        createTemplate(buildFormData({ name: "Padrão" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=insert%20boom"
      );
    });

    it("desmarca default anterior quando o novo é default", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const unset = chain({ error: null });
      const insert = chain({ data: { id: "tpl-9" }, error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({ checklist_templates: [() => unset, () => insert] })
      );

      await expect(
        createTemplate(buildFormData({ name: "Padrão", isDefault: "on" }))
      ).rejects.toThrow(/success=Template criado/);

      expect(unset._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        is_default: false,
      });
      expect(insert._calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
        is_default: true,
      });
    });
  });

  // ── updateTemplate ───────────────────────────────────────────────

  describe("updateTemplate", () => {
    it("rejeita sem templateId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateTemplate(buildFormData({ name: "x" }))
      ).rejects.toThrow("NEXT_REDIRECT:/settings/checklist-templates?error=Template inválido.");
    });

    it("nega acesso a template de outra organização", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [
            () => chain({ data: { id: "tpl-1", organization_id: "org-OTHER" }, error: null }),
          ],
        })
      );
      await expect(
        updateTemplate(buildFormData({ templateId: "tpl-1", name: "x" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=Template não encontrado."
      );
    });

    it("rejeita sem organização ao checar acesso", async () => {
      mocks.getCurrentUserContext.mockResolvedValue({ role: "admin" });
      await expect(
        updateTemplate(buildFormData({ templateId: "tpl-1", name: "x" }))
      ).rejects.toThrow("NEXT_REDIRECT:/dashboard?error=organization_not_found");
    });

    it("nega acesso quando a query do template falha", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [() => chain({ data: null, error: { message: "db" } })],
        })
      );
      await expect(
        updateTemplate(buildFormData({ templateId: "tpl-1", name: "x" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=Template não encontrado."
      );
    });

    it("exige nome ao atualizar", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(withTemplateAccess());
      await expect(
        updateTemplate(buildFormData({ templateId: "tpl-1", name: "  " }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=Nome obrigatório."
      );
    });

    it("desmarca outros defaults e propaga erro do banco ao atualizar", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const unset = chain({ error: null });
      const update = chain({ error: { message: "upd boom" } });
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({ checklist_templates: [() => unset, () => update] })
      );

      await expect(
        updateTemplate(
          buildFormData({ templateId: "tpl-1", name: "Novo", isDefault: "on" })
        )
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=upd%20boom"
      );
      expect(unset._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        is_default: false,
      });
    });

    it("atualiza nome/descrição e redireciona com sucesso", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const update = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({ checklist_templates: [() => update] })
      );

      await expect(
        updateTemplate(buildFormData({ templateId: "tpl-1", name: "Novo" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?success=Template atualizado."
      );

      expect(update._calls.find((c) => c.method === "update")?.args[0]).toMatchObject({
        name: "Novo",
        is_default: false,
      });
    });
  });

  // ── deleteTemplate ───────────────────────────────────────────────

  describe("deleteTemplate", () => {
    it("rejeita sem templateId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(deleteTemplate(buildFormData({}))).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=Template inválido."
      );
    });

    it("propaga erro do banco ao excluir", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({
          checklist_templates: [() => chain({ error: { message: "del boom" } })],
        })
      );
      await expect(
        deleteTemplate(buildFormData({ templateId: "tpl-1" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?error=del%20boom"
      );
    });

    it("exclui template e redireciona para a listagem", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const del = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({ checklist_templates: [() => del] })
      );

      await expect(
        deleteTemplate(buildFormData({ templateId: "tpl-1" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates?success=Template excluído."
      );
      expect(del._calls.some((c) => c.method === "delete")).toBe(true);
    });
  });

  // ── addTemplateItem ──────────────────────────────────────────────

  describe("addTemplateItem", () => {
    it("rejeita sem templateId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        addTemplateItem(buildFormData({ label: "x" }))
      ).rejects.toThrow("NEXT_REDIRECT:/settings/checklist-templates?error=Template inválido.");
    });

    it("propaga erro do banco ao inserir item", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [
            () => chain({ data: { id: "tpl-1", organization_id: "org-1" }, error: null }),
          ],
          checklist_template_items: [
            () => chain({ data: { position: 2 }, error: null }),
            () => chain({ error: { message: "item boom" } }),
          ],
        })
      );

      await expect(
        addTemplateItem(buildFormData({ templateId: "tpl-1", label: "Item" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=item%20boom"
      );
    });

    it("exige texto do item", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(withTemplateAccess());
      await expect(
        addTemplateItem(buildFormData({ templateId: "tpl-1", label: " " }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=Texto do item obrigatório."
      );
    });

    it("calcula a próxima posição na seção e insere", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const maxRow = chain({ data: { position: 4 }, error: null });
      const insert = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [
            () => chain({ data: { id: "tpl-1", organization_id: "org-1" }, error: null }),
          ],
          checklist_template_items: [() => maxRow, () => insert],
        })
      );

      await expect(
        addTemplateItem(
          buildFormData({
            templateId: "tpl-1",
            label: "Conferir cabos",
            section: "operational",
            required: "on",
          })
        )
      ).rejects.toThrow(/success=Item adicionado/);

      expect(insert._calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
        template_id: "tpl-1",
        label: "Conferir cabos",
        section: "operational",
        position: 5,
        required: true,
      });
    });

    it("usa posição 0 quando a seção está vazia e default de seção inválida", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const maxRow = chain({ data: null, error: null });
      const insert = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        fakeSupabase({
          checklist_templates: [
            () => chain({ data: { id: "tpl-1", organization_id: "org-1" }, error: null }),
          ],
          checklist_template_items: [() => maxRow, () => insert],
        })
      );

      await expect(
        addTemplateItem(
          buildFormData({ templateId: "tpl-1", label: "Item", section: "xxx" })
        )
      ).rejects.toThrow(/success=Item adicionado/);

      expect(insert._calls.find((c) => c.method === "insert")?.args[0]).toMatchObject({
        position: 0,
        section: "strategic",
        required: false,
      });
    });
  });

  // ── updateTemplateItem ───────────────────────────────────────────

  describe("updateTemplateItem", () => {
    it("rejeita sem itemId/templateId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        updateTemplateItem(buildFormData({ templateId: "tpl-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/settings/checklist-templates?error=Item inválido.");
    });

    it("exige texto do item ao atualizar", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(withTemplateAccess());
      await expect(
        updateTemplateItem(
          buildFormData({ itemId: "it-1", templateId: "tpl-1", label: " " })
        )
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=Texto do item obrigatório."
      );
    });

    it("propaga erro do banco ao atualizar item", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({
          checklist_template_items: [() => chain({ error: { message: "upd item" } })],
        })
      );
      await expect(
        updateTemplateItem(
          buildFormData({ itemId: "it-1", templateId: "tpl-1", label: "X" })
        )
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=upd%20item"
      );
    });

    it("atualiza o item e redireciona", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const update = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({ checklist_template_items: [() => update] })
      );

      await expect(
        updateTemplateItem(
          buildFormData({
            itemId: "it-1",
            templateId: "tpl-1",
            label: "Atualizado",
            section: "commercial",
          })
        )
      ).rejects.toThrow(/success=Item atualizado/);

      expect(update._calls.find((c) => c.method === "update")?.args[0]).toEqual({
        label: "Atualizado",
        section: "commercial",
        required: false,
      });
    });
  });

  // ── deleteTemplateItem ───────────────────────────────────────────

  describe("deleteTemplateItem", () => {
    it("rejeita sem itemId/templateId", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      await expect(
        deleteTemplateItem(buildFormData({ templateId: "tpl-1" }))
      ).rejects.toThrow("NEXT_REDIRECT:/settings/checklist-templates?error=Item inválido.");
    });

    it("propaga erro do banco ao remover item", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({
          checklist_template_items: [() => chain({ error: { message: "del item" } })],
        })
      );
      await expect(
        deleteTemplateItem(buildFormData({ itemId: "it-1", templateId: "tpl-1" }))
      ).rejects.toThrow(
        "NEXT_REDIRECT:/settings/checklist-templates/tpl-1?error=del%20item"
      );
    });

    it("remove o item e redireciona", async () => {
      mocks.getCurrentUserContext.mockResolvedValue(ADMIN_CONTEXT);
      const del = chain({ error: null });
      mocks.createSupabaseAdminClient.mockReturnValue(
        withTemplateAccess({ checklist_template_items: [() => del] })
      );

      await expect(
        deleteTemplateItem(buildFormData({ itemId: "it-1", templateId: "tpl-1" }))
      ).rejects.toThrow(/success=Item removido/);
      expect(del._calls.some((c) => c.method === "delete")).toBe(true);
    });
  });
});
