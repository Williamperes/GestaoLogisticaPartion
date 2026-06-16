import { describe, expect, it } from "vitest";

import {
  mockEvents,
  mockEventDetail,
  mockInventory,
  mockInventoryDetail,
  mockClients,
  mockTeam,
  mockCheckoutItems,
} from "@/lib/mock-data";

const EVENT_STATUSES = ["planning", "ready_to_load", "in_field", "completed", "cancelled", "gate_open"];
const ITEM_STATUSES = ["available", "reserved", "maintenance", "inactive"];
const SPECIALTIES = ["sound", "light", "image"];

describe("mockEvents", () => {
  it("tem ids únicos e campos essenciais", () => {
    expect(mockEvents.length).toBeGreaterThan(0);
    const ids = mockEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const ev of mockEvents) {
      expect(ev.name).toBeTruthy();
      expect(EVENT_STATUSES).toContain(ev.status);
      expect(ev.gateProgress).toBeGreaterThanOrEqual(0);
      expect(ev.gateProgress).toBeLessThanOrEqual(100);
      expect(ev.equipmentConfirmed).toBeLessThanOrEqual(ev.equipmentPlanned);
    }
  });
});

describe("mockEventDetail", () => {
  it("checklist, team e equipment são consistentes", () => {
    expect(mockEventDetail.checklist.every((c) => typeof c.done === "boolean")).toBe(true);
    expect(mockEventDetail.team.every((m) => SPECIALTIES.includes(m.specialty))).toBe(true);
    expect(mockEventDetail.equipment.every((e) => ITEM_STATUSES.includes(e.status))).toBe(true);
    expect(mockEventDetail.equipment.every((e) => e.qty > 0)).toBe(true);
  });
});

describe("mockInventory", () => {
  it("itens bulk têm quantidades; serializados têm serial", () => {
    for (const item of mockInventory) {
      expect(ITEM_STATUSES).toContain(item.status);
      if (item.bulk) {
        expect(item.totalQty).toBeGreaterThan(0);
        expect(item.availableQty).toBeLessThanOrEqual(item.totalQty!);
      } else {
        expect(item.serial).toBeTruthy();
      }
    }
  });
});

describe("mockInventoryDetail / mockClients / mockTeam / mockCheckoutItems", () => {
  it("detalhe de inventário traz histórico e log", () => {
    expect(mockInventoryDetail.history.length).toBeGreaterThan(0);
    expect(mockInventoryDetail.maintenanceLog.length).toBeGreaterThan(0);
    expect(ITEM_STATUSES).toContain(mockInventoryDetail.status);
  });

  it("clientes têm telefone formatado e contagem de eventos", () => {
    expect(mockClients.length).toBeGreaterThan(0);
    expect(mockClients.every((c) => c.phone.startsWith("("))).toBe(true);
    expect(mockClients.every((c) => c.eventsCount >= 0)).toBe(true);
  });

  it("equipe usa especialidades válidas e flag de disponibilidade booleana", () => {
    expect(mockTeam.every((m) => SPECIALTIES.includes(m.specialty))).toBe(true);
    expect(mockTeam.every((m) => typeof m.available === "boolean")).toBe(true);
  });

  it("itens de checkout têm flag confirmed booleana", () => {
    expect(mockCheckoutItems.length).toBeGreaterThan(0);
    expect(mockCheckoutItems.every((i) => typeof i.confirmed === "boolean")).toBe(true);
  });
});
