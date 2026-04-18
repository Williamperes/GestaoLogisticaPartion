"use client";

import { useState } from "react";
import { Search, Users, ArrowUpRight, Phone } from "lucide-react";
import { mockClients } from "@/lib/mock-data";

export default function ClientsPage() {
  const [search, setSearch] = useState("");

  const filtered = mockClients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mockClients.length} clientes cadastrados</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors">
          + Novo Cliente
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-card border border-border text-sm text-muted-foreground max-w-sm">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou cidade..."
          className="bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground flex-1"
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((client) => (
          <div
            key={client.id}
            className="group border border-border bg-card rounded-xl p-5 hover:border-amber-500/30 hover:bg-black/2 transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/20 flex items-center justify-center">
                <Users className="w-5 h-5 text-amber-600" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-amber-600 transition-colors" />
            </div>

            <h2 className="font-semibold text-foreground group-hover:text-amber-600 transition-colors">
              {client.name}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{client.city}</p>

            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
              <span className="text-muted-foreground flex items-center gap-1">
                <Phone className="w-3 h-3" />
                {client.contact}
              </span>
              <span className="text-amber-600 font-semibold">{client.eventsCount} eventos</span>
            </div>

            <p className="text-xs text-muted-foreground mt-1.5">
              Último: <span className="text-foreground/70">{client.lastEvent}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
