// ──────────────────────────────────────────────────────────────────
// PARTION — Mock Data (visual-only phase)
// ──────────────────────────────────────────────────────────────────

export type EventStatus = "planning" | "gate_open" | "in_field" | "completed" | "cancelled";
export type ItemStatus = "available" | "reserved" | "maintenance" | "inactive";
export type Specialty = "sound" | "light" | "image";

// EVENTS
export const mockEvents = [
  {
    id: "1",
    name: "Festival Aurora 2025",
    client: "Produtora Neon",
    venue: "Arena Multiuso SP",
    city: "São Paulo",
    startDate: "2025-04-12",
    endDate: "2025-04-14",
    status: "gate_open" as EventStatus,
    gateProgress: 100,
    teamCount: 8,
    equipmentPlanned: 42,
    equipmentConfirmed: 42,
  },
  {
    id: "2",
    name: "Mapa Summit Tech",
    client: "Mapa Eventos",
    venue: "Centro de Convenções BR",
    city: "Curitiba",
    startDate: "2025-04-20",
    endDate: "2025-04-21",
    status: "planning" as EventStatus,
    gateProgress: 65,
    teamCount: 5,
    equipmentPlanned: 28,
    equipmentConfirmed: 0,
  },
  {
    id: "3",
    name: "Show Victor & Leo",
    client: "VM Produções",
    venue: "Ginásio Governador",
    city: "Goiânia",
    startDate: "2025-04-05",
    endDate: "2025-04-05",
    status: "completed" as EventStatus,
    gateProgress: 100,
    teamCount: 12,
    equipmentPlanned: 67,
    equipmentConfirmed: 67,
  },
  {
    id: "4",
    name: "Corporativo TechConf 2025",
    client: "Grupo Horizonte",
    venue: "Hotel Grand Hyatt",
    city: "Rio de Janeiro",
    startDate: "2025-05-03",
    endDate: "2025-05-04",
    status: "planning" as EventStatus,
    gateProgress: 30,
    teamCount: 4,
    equipmentPlanned: 18,
    equipmentConfirmed: 0,
  },
  {
    id: "5",
    name: "Reveillon Praia Show",
    client: "Turismo Cultural LTDA",
    venue: "Praia de Copacabana",
    city: "Rio de Janeiro",
    startDate: "2025-06-15",
    endDate: "2025-06-16",
    status: "in_field" as EventStatus,
    gateProgress: 100,
    teamCount: 15,
    equipmentPlanned: 88,
    equipmentConfirmed: 72,
  },
];

// EVENT DETAIL TABS
export const mockEventDetail = {
  id: "1",
  name: "Festival Aurora 2025",
  client: "Produtora Neon",
  clientContact: "Marcos Ribeiro",
  clientPhone: "(11) 99845-3210",
  venue: "Arena Multiuso SP",
  city: "São Paulo, SP",
  venueNote: "Carga: Porta lateral B | Voltagem: 220V trifásico | Elevador disponível",
  startDate: "2025-04-12",
  endDate: "2025-04-14",
  status: "gate_open" as EventStatus,
  gateProgress: 100,
  checklist: [
    { id: "1", label: "Palestrantes confirmados", done: true },
    { id: "2", label: "Plano de palco aprovado", done: true },
    { id: "3", label: "Rider técnico revisado", done: true },
    { id: "4", label: "Logística de transporte", done: true },
    { id: "5", label: "Plano de contingência", done: true },
  ],
  team: [
    { id: "1", name: "Diego Almeida", specialty: "sound" as Specialty, role: "Operador FOH" },
    { id: "2", name: "Camila Souza", specialty: "light" as Specialty, role: "Operadora de Luz" },
    { id: "3", name: "Rafael Costa", specialty: "image" as Specialty, role: "Diretor de Imagem" },
    { id: "4", name: "Tiago Ferreira", specialty: "sound" as Specialty, role: "RF Technician" },
    { id: "5", name: "Ana Lima", specialty: "light" as Specialty, role: "Rigger" },
    { id: "6", name: "Lucas Moura", specialty: "image" as Specialty, role: "Cameraman" },
  ],
  equipment: [
    { id: "e1", name: "Mesa Yamaha PM7", serial: "PM7-0042", qty: 1, planned: true, confirmed: true, status: "reserved" as ItemStatus },
    { id: "e2", name: "Moving Head Sharpy", serial: "SH-0091", qty: 1, planned: true, confirmed: true, status: "reserved" as ItemStatus },
    { id: "e3", name: "Cabo Fio Liso 2.5mm", serial: null, qty: 200, unit: "metros", planned: true, confirmed: true, status: "reserved" as ItemStatus },
    { id: "e4", name: "Caixa L-Acoustics K2", serial: "K2-0018", qty: 1, planned: true, confirmed: true, status: "reserved" as ItemStatus },
    { id: "e5", name: "Projector 4K Laser", serial: "PJ-0035", qty: 1, planned: true, confirmed: true, status: "reserved" as ItemStatus },
    { id: "e6", name: "Switch de Vídeo Barco", serial: "BRC-0012", qty: 1, planned: true, confirmed: false, status: "available" as ItemStatus },
  ],
  thirdParty: [
    { id: "t1", partner: "AV Locações SP", item: "Gerador 250KVA", qty: 1, returnDate: "2025-04-15" },
  ],
};

// INVENTORY
export const mockInventory = [
  { id: "i1", name: "Mesa Yamaha PM7", category: "Áudio", serial: "PM7-0042", status: "reserved" as ItemStatus, bulk: false, lastEvent: "Festival Aurora 2025", image: null },
  { id: "i2", name: "Mesa DiGiCo SD8", category: "Áudio", serial: "SD8-0019", status: "available" as ItemStatus, bulk: false, lastEvent: "Show Victor & Leo", image: null },
  { id: "i3", name: "Moving Head Sharpy", category: "Iluminação", serial: "SH-0091", status: "reserved" as ItemStatus, bulk: false, lastEvent: "Festival Aurora 2025", image: null },
  { id: "i4", name: "Moving Head Beam 200", category: "Iluminação", serial: "BM-0103", status: "maintenance" as ItemStatus, bulk: false, lastEvent: "Reveillon Praia Show", image: null },
  { id: "i5", name: "Caixa L-Acoustics K2", category: "Áudio", serial: "K2-0018", status: "reserved" as ItemStatus, bulk: false, lastEvent: "Festival Aurora 2025", image: null },
  { id: "i6", name: "Projector 4K Laser", category: "Imagem", serial: "PJ-0035", status: "reserved" as ItemStatus, bulk: false, lastEvent: "Festival Aurora 2025", image: null },
  { id: "i7", name: "Switch Barco E2", category: "Imagem", serial: "BRC-0012", status: "available" as ItemStatus, bulk: false, lastEvent: "Mapa Summit Tech", image: null },
  { id: "i8", name: "Cabo Fio Liso 2.5mm", category: "Cabeamento", serial: null, status: "available" as ItemStatus, bulk: true, unit: "metros", totalQty: 1500, availableQty: 1300, lastEvent: null, image: null },
  { id: "i9", name: "Cabo NL4", category: "Cabeamento", serial: null, status: "available" as ItemStatus, bulk: true, unit: "metros", totalQty: 800, availableQty: 600, lastEvent: null, image: null },
  { id: "i10", name: "Gancho Meia Cana", category: "Hardware", serial: null, status: "available" as ItemStatus, bulk: true, unit: "unidades", totalQty: 250, availableQty: 210, lastEvent: null, image: null },
  { id: "i11", name: "DI Box Radial", category: "Áudio", serial: "DI-0067", status: "inactive" as ItemStatus, bulk: false, lastEvent: "TechConf 2024", image: null },
];

export const mockInventoryDetail = {
  id: "i4",
  name: "Moving Head Beam 200",
  brand: "Chauvet Professional",
  model: "Rogue R2 Beam",
  category: "Iluminação",
  serial: "BM-0103",
  patrimony: "PAT-2023-042",
  purchaseDate: "2023-03-15",
  purchaseValue: "R$ 12.500,00",
  status: "maintenance" as ItemStatus,
  bulk: false,
  history: [
    { date: "2025-04-05", event: "Reveillon Praia Show", role: "Moving beam stage right" },
    { date: "2025-03-12", event: "Carnaval Corporate", role: "Moving beam B-stage" },
    { date: "2024-12-31", event: "NYE Festival", role: "Key light truss" },
  ],
  maintenanceLog: [
    { date: "2025-04-06", issue: "Gobo motor travado após checkout", status: "Em Manutenção", reportedBy: "Diego Almeida" },
    { date: "2023-11-20", issue: "Troca do ventilador interno", status: "Resolvido", reportedBy: "Carlos Tech" },
  ],
};

// CLIENTS
export const mockClients = [
  { id: "c1", name: "Produtora Neon", contact: "Marcos Ribeiro", phone: "(11) 99845-3210", city: "São Paulo", eventsCount: 8, lastEvent: "Festival Aurora 2025" },
  { id: "c2", name: "Mapa Eventos", contact: "Sandra Costa", phone: "(41) 98732-1109", city: "Curitiba", eventsCount: 5, lastEvent: "Mapa Summit Tech" },
  { id: "c3", name: "VM Produções", contact: "Victor Almeida", phone: "(62) 99014-5521", city: "Goiânia", eventsCount: 12, lastEvent: "Show Victor & Leo" },
  { id: "c4", name: "Grupo Horizonte", contact: "Patricia Munhoz", phone: "(21) 97823-0041", city: "Rio de Janeiro", eventsCount: 3, lastEvent: "Corporate HR Day" },
  { id: "c5", name: "Turismo Cultural LTDA", contact: "Fernando Rios", phone: "(21) 96611-8803", city: "Rio de Janeiro", eventsCount: 7, lastEvent: "Reveillon Praia Show" },
];

// TEAM
export const mockTeam = [
  { id: "t1", name: "Diego Almeida", specialty: "sound" as Specialty, role: "Operador FOH", available: true, phone: "(11) 99001-2233" },
  { id: "t2", name: "Tiago Ferreira", specialty: "sound" as Specialty, role: "RF Technician", available: false, phone: "(11) 98823-4411" },
  { id: "t3", name: "Fernanda Rocha", specialty: "sound" as Specialty, role: "Operadora Mon", available: true, phone: "(11) 97712-3399" },
  { id: "t4", name: "Camila Souza", specialty: "light" as Specialty, role: "Programadora GrandMA", available: true, phone: "(11) 99201-5500" },
  { id: "t5", name: "Ana Lima", specialty: "light" as Specialty, role: "Rigger", available: true, phone: "(11) 96600-7788" },
  { id: "t6", name: "Pedro Braga", specialty: "light" as Specialty, role: "Eletricista Cênico", available: false, phone: "(11) 99100-4422" },
  { id: "t7", name: "Rafael Costa", specialty: "image" as Specialty, role: "Diretor de Imagem", available: true, phone: "(11) 98800-9911" },
  { id: "t8", name: "Lucas Moura", specialty: "image" as Specialty, role: "Cameraman", available: true, phone: "(11) 97711-6600" },
  { id: "t9", name: "Juliana Matos", specialty: "image" as Specialty, role: "Operadora Replay", available: false, phone: "(11) 99300-2244" },
];

// CHECKOUT items mock
export const mockCheckoutItems = [
  { id: "e1", name: "Mesa Yamaha PM7", serial: "PM7-0042", confirmed: true },
  { id: "e2", name: "Moving Head Sharpy", serial: "SH-0091", confirmed: true },
  { id: "e3", name: "Caixa L-Acoustics K2", serial: "K2-0018", confirmed: true },
  { id: "e4", name: "Projector 4K Laser", serial: "PJ-0035", confirmed: false },
  { id: "e5", name: "Switch Barco E2", serial: "BRC-0012", confirmed: false },
  { id: "e6", name: "DI Box Radial #1", serial: "DI-0067", confirmed: false },
];

// DASHBOARD KPIs
export const mockKPIs = {
  eventsThisMonth: 5,
  eventsNextMonth: 3,
  itemsInMaintenance: 4,
  utilizationRate: 78,
  pendingReturns: 2,
  activeAlerts: 3,
};

export const mockUtilizationChart = [
  { month: "Out", utilization: 65 },
  { month: "Nov", utilization: 72 },
  { month: "Dez", utilization: 88 },
  { month: "Jan", utilization: 54 },
  { month: "Fev", utilization: 70 },
  { month: "Mar", utilization: 78 },
];

export const mockCategoryChart = [
  { name: "Áudio", value: 38 },
  { name: "Iluminação", value: 31 },
  { name: "Imagem", value: 18 },
  { name: "Cabeamento", value: 13 },
];
