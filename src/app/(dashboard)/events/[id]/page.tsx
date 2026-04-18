"use client";

import {
  MapPin,
  Users,
  CheckCircle2,
  Clock,
  ChevronRight,
  Truck,
  Link2,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { StatusBadge, SpecialtyBadge } from "@/components/ui/StatusBadge";
import { mockEventDetail } from "@/lib/mock-data";

export default function EventDetailPage() {
  const event = mockEventDetail;

  const completedChecks = event.checklist.filter((c) => c.done).length;
  const gateProgress = Math.round((completedChecks / event.checklist.length) * 100);

  return (
    <div className="max-w-5xl space-y-6">
      <nav className="flex items-center gap-1.5 overflow-x-auto text-xs text-muted-foreground whitespace-nowrap">
        <span>Eventos & OS</span>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-foreground font-medium">{event.name}</span>
      </nav>

      <div className="flex flex-col md:flex-row md:items-start gap-4">
        <div className="flex-1">
          <div className="mb-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <h1 className="text-2xl font-bold">{event.name}</h1>
            <StatusBadge status={event.status} type="event" />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              {event.client}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {event.venue}, {event.city}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {new Date(event.startDate).toLocaleDateString("pt-BR")} — {new Date(event.endDate).toLocaleDateString("pt-BR")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/60 mt-1 flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {event.venueNote}
          </p>
        </div>

        <div className={`w-full shrink-0 rounded-xl border p-4 md:w-56 ${gateProgress === 100 ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gate de Produção</p>
            {gateProgress === 100 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Clock className="w-4 h-4 text-amber-600" />
            )}
          </div>
          <p className={`text-2xl font-bold mb-2 ${gateProgress === 100 ? "text-emerald-600" : "text-amber-600"}`}>
            {gateProgress}%
          </p>
          <Progress value={gateProgress} className="h-1.5 bg-black/10" />
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {completedChecks}/{event.checklist.length} itens do checklist
          </p>
          {gateProgress === 100 && (
            <p className="text-[10px] text-emerald-600 mt-1 font-semibold">✓ Carga liberada para o depósito</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full overflow-x-auto border border-border bg-card">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="checklist">Checklist</TabsTrigger>
          <TabsTrigger value="equipment">
            Equipamentos
            <span className="ml-1.5 bg-amber-500/20 text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {event.equipment.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
          <TabsTrigger value="third">Terceiros</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="border border-border bg-card rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-foreground">{event.team.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Técnicos</p>
            </div>
            <div className="border border-border bg-card rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-foreground">{event.equipment.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Equipamentos</p>
            </div>
            <div className="border border-border bg-card rounded-xl p-4 text-center">
              <p className="text-3xl font-bold text-amber-600">{event.thirdParty.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Cross-rental</p>
            </div>
          </div>
          <div className="mt-4 border border-border bg-card rounded-xl p-4">
            <p className="text-sm font-semibold mb-2">Contato do Cliente</p>
            <p className="text-sm text-foreground">{event.clientContact}</p>
            <p className="text-sm text-muted-foreground">{event.clientPhone}</p>
          </div>
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <div className="border border-border bg-card rounded-xl overflow-hidden">
            <ul className="divide-y divide-border">
              {event.checklist.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${item.done ? "bg-emerald-500/20" : "bg-black/5 border border-border"}`}>
                    {item.done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  </div>
                  <span className={`text-sm ${item.done ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.label}
                  </span>
                  {item.done && <span className="text-[10px] font-semibold text-emerald-600 sm:ml-auto">CONCLUÍDO</span>}
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-[640px] w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase hidden md:table-cell">Serial / Qtd</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Confirmado</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {event.equipment.map((eq) => (
                  <tr key={eq.id} className="hover:bg-black/2 transition-colors">
                    <td className="px-5 py-3.5 font-medium">{eq.name}</td>
                    <td className="px-4 py-3.5 text-muted-foreground hidden md:table-cell font-mono text-xs">
                      {eq.serial ?? `${eq.qty} ${eq.unit ?? "un"}`}
                    </td>
                    <td className="px-4 py-3.5">
                      {eq.confirmed ? (
                        <span className="text-emerald-600 text-xs font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Sim
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" /> Pendente
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={eq.status} type="item" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-start gap-2 sm:justify-end">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all">
              <Truck className="w-4 h-4" />
              Iniciar Checkout
            </button>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {event.team.map((member) => (
              <div key={member.id} className="flex items-center gap-3 border border-border bg-card rounded-xl p-4">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-500/30 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-amber-600">
                    {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{member.name}</p>
                  <p className="text-xs text-muted-foreground">{member.role}</p>
                </div>
                <SpecialtyBadge specialty={member.specialty} />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="third" className="mt-4">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="min-w-[620px] w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-muted-foreground uppercase">Parceiro</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Qty</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase">Devolução</th>
                </tr>
              </thead>
              <tbody>
                {event.thirdParty.map((tp) => (
                  <tr key={tp.id} className="border-b border-border hover:bg-black/2">
                    <td className="px-5 py-3.5 flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5 text-blue-600" />
                      {tp.partner}
                    </td>
                    <td className="px-4 py-3.5">{tp.item}</td>
                    <td className="px-4 py-3.5">{tp.qty}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {new Date(tp.returnDate).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
