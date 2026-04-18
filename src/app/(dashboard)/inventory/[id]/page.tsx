"use client";

import {
  Package,
  QrCode,
  ChevronRight,
  CalendarDays,
  AlertTriangle,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { mockInventoryDetail } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";

export default function InventoryDetailPage() {
  const item = mockInventoryDetail;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Inventário</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{item.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-5">
        {/* QR + Info */}
        <div className="border border-border bg-card rounded-xl p-5 flex gap-5 flex-1">
          {/* QR Code placeholder */}
          <div className="w-20 h-20 rounded-lg border border-border bg-black/5 flex items-center justify-center shrink-0">
            <QrCode className="w-10 h-10 text-muted-foreground/30" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-xl font-bold">{item.name}</h1>
              <StatusBadge status={item.status} type="item" />
            </div>
            <p className="text-sm text-muted-foreground">{item.brand} — {item.model}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
              <span>Patrimônio: <span className="font-mono text-foreground">{item.patrimony}</span></span>
              <span>Serial: <span className="font-mono text-foreground">{item.serial}</span></span>
              <span>Categoria: <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">{item.category}</Badge></span>
            </div>
          </div>
        </div>

        {/* Metadata */}
        <div className="border border-border bg-card rounded-xl p-5 w-full md:w-52 shrink-0">
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Categoria</dt>
              <dd className="font-medium text-foreground mt-0.5">{item.category}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Aquisição</dt>
              <dd className="font-medium text-foreground mt-0.5">{new Date(item.purchaseDate).toLocaleDateString("pt-BR")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Valor</dt>
              <dd className="font-medium text-foreground mt-0.5">{item.purchaseValue}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Maintenance Alert */}
      {item.status === "maintenance" && (
        <div className="border border-red-500/30 bg-red-500/8 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-600">Item em Manutenção</p>
            <p className="text-xs text-muted-foreground mt-0.5">{item.maintenanceLog[0]?.issue}</p>
            <p className="text-xs text-muted-foreground">Reportado por {item.maintenanceLog[0]?.reportedBy}</p>
          </div>
        </div>
      )}

      {/* History & Maintenance */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Usage history */}
        <div className="border border-border bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold">Histórico de Uso</h2>
          </div>
          <ul className="divide-y divide-border">
            {item.history.map((h, i) => (
              <li key={i} className="px-5 py-3 flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center shrink-0">
                  <Package className="w-3.5 h-3.5 text-muted-foreground" />
                </span>
                <div>
                  <p className="text-sm font-medium">{h.event}</p>
                  <p className="text-xs text-muted-foreground">{h.role} • {new Date(h.date).toLocaleDateString("pt-BR")}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Maintenance log */}
        <div className="border border-border bg-card rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
            <Wrench className="w-4 h-4 text-amber-600" />
            <h2 className="text-sm font-semibold">Manutenções</h2>
          </div>
          <ul className="divide-y divide-border">
            {item.maintenanceLog.map((m, i) => (
              <li key={i} className="px-5 py-3 flex items-start gap-3">
                <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${m.status === "Resolvido" ? "bg-emerald-400" : "bg-red-400"}`} />
                <div>
                  <p className="text-sm">{m.issue}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{new Date(m.date).toLocaleDateString("pt-BR")} • {m.reportedBy}</p>
                  <span className={`text-[10px] font-semibold ${m.status === "Resolvido" ? "text-emerald-600" : "text-red-600"}`}>
                    {m.status === "Resolvido" ? <CheckCircle2 className="inline w-3 h-3 mr-0.5" /> : <AlertTriangle className="inline w-3 h-3 mr-0.5" />}
                    {m.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
