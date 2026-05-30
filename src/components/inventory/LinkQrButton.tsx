"use client";

import { useState } from "react";
import { toast } from "sonner";

import { setUnitQrCode } from "@/app/(dashboard)/inventory/actions";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { QrScanner } from "@/components/inventory/QrScanner";

interface LinkQrButtonProps {
  unitId: string;
  unitSerial: string;
}

export function LinkQrButton({ unitId, unitSerial }: LinkQrButtonProps) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(code: string) {
    if (busy) return;
    setBusy(true);
    const result = await setUnitQrCode(unitId, code);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Erro");
      return;
    }
    toast.success(`QR vinculado a ${unitSerial}`);
    setOpen(false);
    setManual("");
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground"
        type="button"
      >
        Vincular QR
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Vincular QR — {unitSerial}</SheetTitle>
          <SheetDescription>
            Bipe o adesivo QR ou digite o código manualmente.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {open && (
            <QrScanner
              onResult={(text) => submit(text)}
              onError={(e) => toast.error(e.message)}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(manual);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="Ou digite o código"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !manual.trim()}
              className="rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background disabled:opacity-50"
            >
              Vincular
            </button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
