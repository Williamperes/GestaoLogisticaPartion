"use client";

import { updateEquipmentUnitStatus } from "@/app/(dashboard)/inventory/actions";
import type { EquipmentStatus } from "@/lib/inventory";

interface UnitStatusFormProps {
  unitId: string;
  equipmentId: string;
  currentStatus: EquipmentStatus;
}

export function UnitStatusForm({ unitId, equipmentId, currentStatus }: UnitStatusFormProps) {
  return (
    <form action={updateEquipmentUnitStatus}>
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="cursor-pointer rounded-md border border-border bg-transparent px-2 py-1 text-xs outline-none transition focus:border-primary/50"
      >
        <option value="available">Disponível</option>
        <option value="reserved">Reservado</option>
        <option value="in_field">Em Campo</option>
        <option value="maintenance">Manutenção</option>
        <option value="inactive">Inativo</option>
      </select>
    </form>
  );
}
