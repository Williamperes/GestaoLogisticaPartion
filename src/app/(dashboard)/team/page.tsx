"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import { SpecialtyBadge } from "@/components/ui/StatusBadge";
import { mockTeam, type Specialty } from "@/lib/mock-data";

const specialtyOrder: Specialty[] = ["sound", "light", "image"];
const specialtyLabel: Record<Specialty, string> = {
  sound: "Som",
  light: "Iluminação",
  image: "Imagem",
};

export default function TeamPage() {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{mockTeam.length} técnicos cadastrados</p>
        </div>
        <button className="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition-colors">
          + Novo Técnico
        </button>
      </div>

      {/* Groups by specialty */}
      {specialtyOrder.map((specialty) => {
        const members = mockTeam.filter((m) => m.specialty === specialty);
        return (
          <section key={specialty}>
            <div className="flex items-center gap-3 mb-3">
              <SpecialtyBadge specialty={specialty} />
              <span className="text-xs text-muted-foreground">{members.length} técnicos</span>
              <span className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {members.map((member) => {
                const isHovered = hovered === member.id;
                const isBlurred = hovered !== null && !isHovered;

                return (
                  <div
                    key={member.id}
                    onMouseEnter={() => setHovered(member.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={`border rounded-xl p-5 transition-all duration-200 cursor-pointer ${
                      isBlurred
                        ? "opacity-40 scale-[0.98] blur-[1px]"
                        : isHovered
                        ? "border-amber-500/40 bg-amber-500/5 scale-[1.01]"
                        : "border-border bg-card"
                    }`}
                  >
                    {/* Avatar */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative w-12 h-12 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-500/30 flex items-center justify-center">
                        <span className="text-sm font-bold text-amber-600">
                          {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </span>
                        {/* Online dot */}
                        <span
                          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                            member.available ? "bg-emerald-400" : "bg-zinc-500"
                          }`}
                        />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <SpecialtyBadge specialty={member.specialty} />
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          member.available
                            ? "bg-emerald-500/15 text-emerald-600"
                            : "bg-zinc-500/15 text-zinc-400"
                        }`}
                      >
                        {member.available ? "Disponível" : "Ocupado"}
                      </span>
                    </div>

                    {isHovered && (
                      <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground flex items-center gap-1.5">
                        <UserRound className="w-3 h-3" />
                        {member.phone}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
