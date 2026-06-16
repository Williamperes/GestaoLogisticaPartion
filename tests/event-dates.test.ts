import { describe, expect, it } from "vitest";

import {
  formatEventTeamRole,
  EVENT_TEAM_ROLE_LABELS,
  EVENT_TEAM_ROLE_ORDER,
} from "@/lib/event-dates";

describe("formatEventTeamRole", () => {
  it("usa o label fixo para papéis conhecidos", () => {
    expect(formatEventTeamRole("audio", null)).toBe("Operador de áudio");
    expect(formatEventTeamRole("tecnico_responsavel", null)).toBe("Técnico responsável");
  });

  it('usa o customRole quando o papel é "outro"', () => {
    expect(formatEventTeamRole("outro", "DJ")).toBe("DJ");
  });

  it('cai no label "Outro" quando é "outro" sem customRole', () => {
    expect(formatEventTeamRole("outro", null)).toBe("Outro");
  });

  it("ignora customRole para papéis que não são 'outro'", () => {
    expect(formatEventTeamRole("luz", "qualquer")).toBe("Operador de luz");
  });
});

describe("EVENT_TEAM_ROLE_ORDER / LABELS", () => {
  it("a ordem cobre exatamente todas as chaves de labels", () => {
    expect([...EVENT_TEAM_ROLE_ORDER].sort()).toEqual(
      Object.keys(EVENT_TEAM_ROLE_LABELS).sort()
    );
  });

  it("todo papel da ordem tem label não vazio", () => {
    for (const role of EVENT_TEAM_ROLE_ORDER) {
      expect(EVENT_TEAM_ROLE_LABELS[role]).toBeTruthy();
    }
  });
});
