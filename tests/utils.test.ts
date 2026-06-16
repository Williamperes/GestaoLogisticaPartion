import { describe, expect, it } from "vitest";

import { cn, formatPhoneNumber } from "@/lib/utils";

describe("cn", () => {
  it("junta classes condicionais", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("resolve conflitos do tailwind mantendo a última", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("formatPhoneNumber", () => {
  it("retorna vazio para entrada vazia", () => {
    expect(formatPhoneNumber("")).toBe("");
  });

  it("formata DDD parcial", () => {
    expect(formatPhoneNumber("11")).toBe("(11");
  });

  it("formata fixo de 10 dígitos", () => {
    expect(formatPhoneNumber("1133224455")).toBe("(11) 3322-4455");
  });

  it("formata celular de 11 dígitos", () => {
    expect(formatPhoneNumber("11999887766")).toBe("(11) 99988-7766");
  });

  it("ignora caracteres não numéricos", () => {
    expect(formatPhoneNumber("(11) 99988-7766")).toBe("(11) 99988-7766");
  });

  it("trunca em 11 dígitos", () => {
    expect(formatPhoneNumber("119998877661234")).toBe("(11) 99988-7766");
  });
});
