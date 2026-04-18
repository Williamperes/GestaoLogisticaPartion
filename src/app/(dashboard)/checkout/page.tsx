"use client";

import { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Truck,
  X,
} from "lucide-react";
import { mockCheckoutItems } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";

export default function CheckoutPage() {
  const [items, setItems] = useState(mockCheckoutItems);
  const [scanning, setScanning] = useState(false);
  const [divergence, setDivergence] = useState(false);

  const confirmed = items.filter((i) => i.confirmed).length;
  const progress = Math.round((confirmed / items.length) * 100);
  const allClear = confirmed === items.length;

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, confirmed: !i.confirmed } : i))
    );
  };

  return (
    <div className="max-w-md mx-auto space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 text-xs font-semibold mb-3">
          <Truck className="w-3.5 h-3.5" />
          Portal de Checkout
        </div>
        <h1 className="text-xl font-bold">Festival Aurora 2025</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Produtora Neon • 12 Abr 2025</p>
      </div>

      {/* Progress */}
      <div className={`border rounded-xl p-4 ${allClear ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{confirmed}/{items.length} itens confirmados</span>
          <span className={`text-sm font-bold ${allClear ? "text-emerald-600" : "text-amber-600"}`}>{progress}%</span>
        </div>
        <Progress value={progress} className="h-2 bg-black/10" />
        {allClear && (
          <p className="text-xs text-emerald-600 font-semibold mt-2 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> Pronto para fechar o caminhão!
          </p>
        )}
      </div>

      {/* Scanner area */}
      <button
        onClick={() => { setScanning(!scanning); setDivergence(false); }}
        className={`w-full border-2 border-dashed rounded-xl py-8 flex flex-col items-center gap-3 transition-all ${
          scanning
            ? "border-amber-500/60 bg-amber-500/5"
            : "border-border hover:border-amber-500/40 hover:bg-black/2"
        }`}
      >
        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${scanning ? "bg-amber-500/20" : "bg-black/5"}`}>
          <Camera className={`w-7 h-7 ${scanning ? "text-amber-600" : "text-muted-foreground/40"}`} />
        </div>
        <div className="text-center">
          <p className={`text-sm font-semibold ${scanning ? "text-amber-600" : "text-foreground"}`}>
            {scanning ? "Câmera Ativa — Aponte para o QR" : "Toque para Escanear"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Leitura via câmera do celular</p>
        </div>
      </button>

      {/* Divergence alert */}
      <AnimatePresence>
        {divergence && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="border border-red-500/40 bg-red-500/10 rounded-xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-600">Item não planejado detectado!</p>
              <p className="text-xs text-muted-foreground mt-0.5">Este item não consta na OS. Confirme com o responsável.</p>
            </div>
            <button onClick={() => setDivergence(false)}>
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Item List */}
      <div className="border border-border bg-card rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lista de Conferência</p>
        </div>
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <li
              key={item.id}
              onClick={() => toggleItem(item.id)}
              className="flex items-center gap-3 px-4 py-3.5 cursor-pointer hover:bg-black/2 active:bg-black/4 transition-colors select-none"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
                item.confirmed
                  ? "bg-emerald-500/20 border-emerald-500/40"
                  : "bg-black/5 border-border"
              }`}>
                {item.confirmed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                {!item.confirmed && <Clock className="w-3 h-3 text-muted-foreground/40" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.confirmed ? "text-foreground" : "text-muted-foreground"}`}>
                  {item.name}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono">{item.serial}</p>
              </div>
              {item.confirmed && (
                <span className="text-[10px] text-emerald-600 font-semibold">OK</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Action */}
      <button
        disabled={!allClear}
        className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-amber-500 text-black hover:bg-amber-400"
      >
        {allClear ? "Fechar Caminhão ✓" : `Aguardando ${items.length - confirmed} item(s)...`}
      </button>

      {/* Test divergence */}
      <button
        onClick={() => setDivergence(true)}
        className="w-full py-2 rounded-xl border border-red-500/20 text-xs text-red-600 hover:bg-red-500/5 transition-colors"
      >
        [demo] Simular item não planejado
      </button>
    </div>
  );
}
