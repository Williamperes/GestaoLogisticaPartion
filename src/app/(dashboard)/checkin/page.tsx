"use client";

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CornerDownLeft,
  X,
  Camera as CameraIcon,
} from "lucide-react";
import { mockCheckoutItems } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";

interface ReturnItem {
  id: string;
  name: string;
  serial: string;
  returned: boolean;
  damaged: boolean;
}

export default function CheckinPage() {
  const [items, setItems] = useState<ReturnItem[]>(
    mockCheckoutItems.map((i) => ({ ...i, returned: false, damaged: false }))
  );
  const [damagingId, setDamagingId] = useState<string | null>(null);
  const [extraviado, setExtraviado] = useState(0);

  const returned = items.filter((i) => i.returned).length;
  const damaged = items.filter((i) => i.damaged).length;
  const progress = Math.round((returned / items.length) * 100);

  const markReturned = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, returned: !i.returned } : i))
    );
  };

  const markDamaged = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, damaged: true, returned: true } : i))
    );
    setDamagingId(null);
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 text-blue-600 text-xs font-semibold mb-3">
          <CornerDownLeft className="w-3.5 h-3.5" />
          Portal de Retorno
        </div>
        <h1 className="text-xl font-bold">Festival Aurora 2025</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Produtora Neon • 14 Abr 2025</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border bg-card rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-foreground">{returned}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Retornados</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${damaged > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
          <p className={`text-xl font-bold ${damaged > 0 ? "text-red-600" : "text-foreground"}`}>{damaged}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Avarias</p>
        </div>
        <div className={`border rounded-xl p-3 text-center ${extraviado > 0 ? "border-red-500/30 bg-red-500/5" : "border-border bg-card"}`}>
          <p className={`text-xl font-bold ${extraviado > 0 ? "text-red-600" : "text-foreground"}`}>{extraviado}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Extraviados</p>
        </div>
      </div>

      <div className="border border-border bg-card rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{returned}/{items.length} itens</span>
          <span className="text-sm font-bold text-foreground">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2 bg-black/10" />
      </div>

      {/* Scanner */}
      <button className="w-full border-2 border-dashed border-border rounded-xl py-7 flex flex-col items-center gap-3 hover:border-blue-500/40 hover:bg-black/2 transition-all">
        <div className="w-12 h-12 rounded-full bg-black/5 flex items-center justify-center">
          <Camera className="w-6 h-6 text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground">Escanear QR de Retorno</p>
      </button>

      {/* Damage Modal */}
      <AnimatePresence>
        {damagingId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4"
          >
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-5 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Registrar Avaria
                </h3>
                <button onClick={() => setDamagingId(null)}>
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                {items.find((i) => i.id === damagingId)?.name}
              </p>
              <textarea
                placeholder="Descreva a avaria..."
                className="w-full bg-black/5 border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-red-500/40"
                rows={3}
              />
              <button className="w-full flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-black/5 transition-colors">
                <CameraIcon className="w-4 h-4" /> Adicionar foto
              </button>
              <button
                onClick={() => markDamaged(damagingId)}
                className="w-full py-2.5 rounded-lg bg-red-500/15 text-red-600 font-semibold text-sm hover:bg-red-500/25 transition-colors border border-red-500/30"
              >
                Confirmar Avaria + Bloquear Item
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item list */}
      <div className="border border-border bg-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens para Retorno</p>
        </div>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${item.damaged ? "bg-red-500/5" : ""}`}
            >
              <div
                onClick={() => markReturned(item.id)}
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border cursor-pointer transition-all ${
                  item.returned && !item.damaged
                    ? "bg-emerald-500/20 border-emerald-500/40"
                    : item.damaged
                    ? "bg-red-500/20 border-red-500/40"
                    : "bg-black/5 border-border hover:border-blue-500/40"
                }`}
              >
                {item.returned && !item.damaged && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {item.damaged && <AlertTriangle className="w-3 h-3 text-red-600" />}
                {!item.returned && <Clock className="w-3 h-3 text-muted-foreground/40" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.damaged ? "text-red-600" : "text-foreground"}`}>
                  {item.name}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">{item.serial}</p>
                {item.damaged && <p className="text-[10px] text-red-600 font-semibold mt-0.5">⚠ BLOQUEADO — Manutenção</p>}
              </div>

              {!item.damaged && (
                <button
                  onClick={() => setDamagingId(item.id)}
                  className="text-[10px] text-muted-foreground hover:text-red-600 transition-colors px-2 py-1 rounded border border-transparent hover:border-red-500/30"
                >
                  Avaria
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <button
        className="w-full py-3.5 rounded-xl font-semibold text-sm bg-blue-500/15 text-blue-600 border border-blue-500/30 hover:bg-blue-500/25 transition-colors disabled:opacity-40"
        disabled={returned < items.length}
      >
        {returned === items.length ? "Finalizar Check-in ✓" : `Aguardando ${items.length - returned} item(s)...`}
      </button>

      <button
        onClick={() => setExtraviado((e) => e + 1)}
        className="w-full py-2 rounded-xl border border-red-500/20 text-xs text-red-600 hover:bg-red-500/5 transition-colors"
      >
        [demo] Simular extravio
      </button>
    </div>
  );
}
