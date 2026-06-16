import { beforeEach, describe, expect, it, vi } from "vitest";

import { chain, fakeSupabase } from "./helpers/supabaseMock";

const mocks = vi.hoisted(() => ({ createSupabaseAdminClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

import {
  listChecklistTemplates,
  getChecklistTemplate,
  getDefaultChecklistTemplate,
} from "@/lib/checklist-templates";

describe("listChecklistTemplates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conta itens e itens obrigatórios", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        checklist_templates: [
          () =>
            chain({
              data: [
                {
                  id: "t-1",
                  organization_id: "org-1",
                  name: "Padrão",
                  description: null,
                  is_default: true,
                  checklist_template_items: [
                    { id: "i1", required: true },
                    { id: "i2", required: false },
                    { id: "i3", required: true },
                  ],
                },
              ],
              error: null,
            }),
        ],
      })
    );

    const [t] = await listChecklistTemplates("org-1");
    expect(t).toMatchObject({ id: "t-1", itemCount: 3, requiredCount: 2, isDefault: true });
  });

  it("propaga erro do banco", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ checklist_templates: [() => chain({ data: null, error: new Error("db") })] })
    );
    await expect(listChecklistTemplates("org-1")).rejects.toThrow("db");
  });
});

describe("getChecklistTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna null quando não existe", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ checklist_templates: [() => chain({ data: null, error: null })] })
    );
    expect(await getChecklistTemplate("t-x")).toBeNull();
  });

  it("ordena itens por seção (SECTION_ORDER) e depois por posição", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        checklist_templates: [
          () =>
            chain({
              data: {
                id: "t-1",
                organization_id: "org-1",
                name: "Padrão",
                description: null,
                is_default: false,
                checklist_template_items: [
                  { id: "op2", template_id: "t-1", label: "Op2", section: "operational", position: 2, required: false },
                  { id: "st1", template_id: "t-1", label: "St1", section: "strategic", position: 1, required: true },
                  { id: "op1", template_id: "t-1", label: "Op1", section: "operational", position: 1, required: true },
                  { id: "com1", template_id: "t-1", label: "Com1", section: "commercial", position: 1, required: false },
                ],
              },
              error: null,
            }),
        ],
      })
    );

    const t = await getChecklistTemplate("t-1");
    // strategic < commercial < operational; dentro de operational, position asc.
    expect(t?.items?.map((i) => i.id)).toEqual(["st1", "com1", "op1", "op2"]);
    expect(t?.requiredCount).toBe(2);
  });
});

describe("getDefaultChecklistTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna null quando não há default", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({ checklist_templates: [() => chain({ data: null, error: null })] })
    );
    expect(await getDefaultChecklistTemplate("org-1")).toBeNull();
  });

  it("resolve o default e busca o template completo", async () => {
    mocks.createSupabaseAdminClient.mockReturnValue(
      fakeSupabase({
        checklist_templates: [
          () => chain({ data: { id: "t-default" }, error: null }), // lookup do default
          () =>
            chain({
              data: {
                id: "t-default",
                organization_id: "org-1",
                name: "Default",
                description: null,
                is_default: true,
                checklist_template_items: [],
              },
              error: null,
            }),
        ],
      })
    );

    const t = await getDefaultChecklistTemplate("org-1");
    expect(t).toMatchObject({ id: "t-default", isDefault: true, itemCount: 0 });
  });
});
