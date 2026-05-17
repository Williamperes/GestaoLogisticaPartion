# Partion — Contexto do Projeto

> Documento de referência consolidado a partir de materiais reais dos donos do sistema (Partion Audiovisual): template estratégico de OS, planejamento operacional/logístico e exemplo de Ordem de Serviço impressa em uso na operação.
>
> **Objetivo:** servir de fonte única para alinhar o produto digital ao fluxo real de trabalho da empresa. Toda decisão de modelagem, UI e regras de negócio deve checar contra este documento antes de implementar.

---

## 1. Visão geral do negócio

Partion Audiovisual presta serviços de locação e operação de estrutura para eventos: sonorização, iluminação, painéis de LED, estrutura (box truss/palco), extras (gerador, TV, projetor).

Cada serviço prestado é organizado em torno de uma **Ordem de Serviço (OS)** — entidade central do sistema, equivalente ao `event` no schema atual.

Operação típica por OS:
1. **Comercial** fecha venda com cliente (direto ou via agência).
2. **Produção/Operações** preenche planejamento estratégico, logístico e técnico.
3. **Almoxarifado** separa equipamentos da lista.
4. **Equipe** carrega o veículo no horário definido.
5. **Equipe em campo** monta, opera, desmonta.
6. **Retorno** — check-in de equipamentos no estoque.

A OS só pode avançar para **PRODUÇÃO / EXECUÇÃO** quando estiver **100% preenchida**. Esse é o gate de produção (já existe no banco como trigger `prevent_premature_ready_to_load`, hoje validando apenas um checklist fixo de 5 itens — precisa virar checklist dinâmico baseado nas seções abaixo).

---

## 2. Estrutura completa de uma OS

A OS real em uso tem três grandes blocos: **estratégico**, **estrutura vendida + equipe + pontos críticos**, e **planejamento operacional/logístico**. Abaixo, cada seção com seus campos exatos.

### 2.1. Informações estratégicas

- **Empresa** (interna — Partion ou unidade)
- **Responsável interno**
- **Agência envolvida?** (sim/não + nome)
- **CEO ou diretoria presente?** (sim/não) — bandeira de risco
- **Cliente** (contato principal)
- **Data do evento**
- **Cidade**
- **Local**
- **Horário de montagem**
- **Horário de início do evento**
- **Horário de término**
- **Horário de desmontagem**

### 2.2. Cronograma detalhado (obrigatório)

- **Abertura**
- **Encerramento**
- ⚠ Marcação se o espaço tem **horário rígido** (multa/corte de energia)

### 2.3. Palestrantes (quando houver pedidos específicos)

Lista — um registro por palestrante:
- Nome
- Microfone: lapela / headset / bastão
- Vai usar notebook próprio? (sim/não)
- Precisa adaptador? (sim/não + tipo)
- ⚠ Demanda técnico exclusivo de palco? (sim/não)

### 2.4. LED / Conteúdo

- Tamanho do painel
- Formato do material (16:9 confirmado?)
- Conteúdo revisado? (sim/não)
- Teste antes do evento? (sim/não)
- Quem opera o conteúdo?
- ⚠ Risco de vídeo pesado / erro de fonte?

### 2.5. Riscos operacionais (flags)

- Evento gravado? (sim/não)
- Tem transmissão ao vivo? (sim/não)
- Cliente exigente com estética? (sim/não)
- Agência muito detalhista? (sim/não)

### 2.6. Logística reforçada (estratégica)

- Montagem no dia anterior?
- Desmontagem e carga (horário)
- Necessita credenciamento antecipado?

### 2.7. Regras fixas do bloco estratégico

✔ Ensaio técnico obrigatório
✔ Teste de todos os vídeos
✔ Microfone reserva carregado
✔ Operador 100% focado

**Regra de gate:** para avançar para **PRODUÇÃO / EXECUÇÃO** o bloco precisa estar **100% preenchido**.

**Obrigatório anexar dados de cartão inicial** (social ou corporativo) — controle financeiro.

---

### 2.8. Estrutura vendida

Lista de equipamentos/serviços organizados por **categoria**, com quantidade e checkboxes operacionais.

Categorias canônicas (extraídas da OS real):
- **Iluminação** — moving beam, par led, COB, fog, interface Daslight, etc.
- **Cabeamento DMX** — subdividido por tamanho (2M, 5M, 10M, 15M).
- **Extensões** — subdividido por tamanho (20M, 15M, 10M, 7M, 5M, 2M) + acessórios (Régua 5M, Paralelo, T, Pentacústica Completo).
- **Sonorização** — kit, mesa, caixas, microfones, pedestais.
- **Gaveteiro** — sub-bucket de sonorização para acessórios pequenos (cabos P2, adaptadores XLR↔P10, XLR↔RCA, DIs, SM58).
- **Cabeamento sonoro** — XLR por tamanho (5M, 10M), Régua Pentacústica, Powercon X Flecha.
- **Estrutural** — caixa de ferramenta, maleta de fitas/cintas, palco, box truss.
- **Extras** — gerador, TV, projetor, "outro".

**Colunas por item (modelo de impressão e de check operacional):**

| ☐ Carregado | Quant. | Material | ☐ Separado |

Fluxo dos dois checkboxes:
1. **Separado** — almoxarifado tirou da prateleira e colocou na área de carregamento.
2. **Carregado** — equipe colocou no veículo.

> **Gap atual:** o schema `event_equipment` tem apenas um booleano `confirmed`. Precisa virar **dois estados** (`separated` + `loaded`) ou um enum (`pending` → `separated` → `loaded`).

#### 2.8.1. Sonorização — descrição livre

Texto livre descrevendo sistema completo: P.A, retorno, microfones, mesa.

#### 2.8.2. Iluminação — descrição livre

Texto livre: refletores, moving, ribaltas, luz cênica.

#### 2.8.3. Painel de LED

- Tamanho
- Resolução
- Conteúdo enviado? (sim/não)
- Operador necessário? (sim/não)

#### 2.8.4. Extras (multi-select)

☐ Gerador ☐ Box truss ☐ TV ☐ Projetor ☐ Palco ☐ Outro: ___

---

### 2.9. Equipe designada

- Técnico responsável
- Operador de áudio
- Operador de luz
- Operador de LED
- Auxiliares / carregadores (lista N)
- Responsável comercial (default: Andri)

> **Atenção:** em eventos multi-data, a equipe pode rodar por dia. Exemplo real: `Ismael — 28/02 / Fabrício — 01/03`. Precisa modelar **escala por data**, não atribuição única.

---

### 2.10. Pontos críticos do evento

Texto livre por campo, mas estruturado:
- Perfil do cliente
- Expectativa principal
- O que ele mais valoriza
- Pontos sensíveis
- Algo que **NÃO PODE** acontecer

---

### 2.11. Informações importantes do local (VT — Visita Técnica)

- Tensão elétrica disponível (110/220/380, trifásico, etc.)
- Distância carga/descarga
- Tem elevador? (sim/não + capacidade)
- Acesso fácil? (descrição)
- Horário limite de som?
- Necessário ART? (sim/não)

---

### 2.12. Anexos (multi-select com upload)

☐ Layout LED
☐ Rider técnico
☐ Identidade visual
☐ Mapa de palco
☐ Cronograma do cerimonial

> Cada anexo precisa de arquivo (PDF/PNG/JPG) — armazenamento em Supabase Storage.

---

### 2.13. Check final comercial (gate)

☐ Evento 100% pago ou alinhado
☐ Informações completas
☐ Estrutura confirmada
☐ Equipe avisada
☐ Cliente ciente dos horários

---

## 3. Planejamento operacional & logística

Segundo gate, separado do comercial.

### 3.1. Logística

- Logística definida? (sim/não)

### 3.2. Transporte

- Veículo(s) utilizado(s)
- Motorista(s)
- Endereço de saída
- Horário de saída
- Tempo estimado de deslocamento
- Previsão de chegada

> **Atenção:** veículo é campo de primeira classe na OS impressa (`VEÍCULO: Kombi Ilmar`). Hoje não existe no schema.

### 3.3. Hospedagem

- Não precisa / Reservado
- Hotel + Endereço
- Quantidade de quartos
- Check-in / Check-out
- Quem ficará hospedado (lista da equipe)

### 3.4. Alimentação da equipe

Tipo: cliente fornece / incluso em contrato / equipe responsável + observações livres.

### 3.5. Carga e descarga

- Local permitido
- Responsável no local
- Necessário credencial? (sim/não)
- Taxa de entrada? (sim/não + valor)
- Horário de desmontagem e carga

### 3.6. Check final operacional (gate)

☐ Logística definida
☐ Hospedagem alinhada
☐ Transporte confirmado
☐ Estrutura revisada
☐ Equipe avisada
☐ Financeiro alinhado
☐ Cliente ciente dos horários

---

## 4. Exemplo real — OS impressa (referência de modelagem)

OS real da Partion (Formatura — Dom Manuel — 28/02 a 01/03):

**Cabeçalho (tabela chave-valor):**

| Campo | Valor |
|---|---|
| EVENTO | Formatura |
| LOCAL | Dom Manuel |
| DATA | 28/02 — 20:00 / 01/03 — 12:00 |
| MONTAGEM | 27/02 — 14:00 |
| VEÍCULO | Kombi Ilmar |
| COR DA ILUMINAÇÃO CÊNICA | DMX |
| EQUIPE | Ismael — 28/02 / Fabrício — 01/03 |
| BANDA | Henry (Voz e Viola) — 01/03 |

**Iluminação:**

| Carregado | Quant. | Material | Separado |
|---|---|---|---|
| ☐ | 02 | Moving Beam 7R | ☐ |
| ☐ | 04 | Par Led LPG | ☐ |
| ☐ | 08 | Cob Outdoor PLS | ☐ |
| ☐ | 01 | Fog 900w (Mandar com líquido) | ☐ |
| ☐ | 01 | Interface Daslight 512 + Notebook Acer | ☐ |

**Cabeamento DMX (Quant | Tamanho | Carregado):** 05×2M, 02×5M, 02×10M, 02×15M.

**Extensões:** 01×20M, 02×15M, 08×10M, 10×7M, 10×5M, 10×2M, 04×Réguas 5M, 10×Paralelo, 10×T, 01×Pentacústica Completo.

**Sonorização:**

| Carregado | Quant. | Material | Separado |
|---|---|---|---|
| ☐ | 01 | Kit Slim V851 TRG | ☐ |
| ☐ | 01 | Mesa de Som UI24R | ☐ |
| ☐ | 02 | Caixa Ativa DBR | ☐ |
| ☐ | 01 | Microfone S/ Fio Shure PGXD | ☐ |
| ☐ | 02 | Pedestal de Microfone | ☐ |

**Gaveteiro (sub-bucket sonorização):** 02×Cabos P2, 02×Adaptador XLR Fêmea X P10, 02×Adaptador XLR Macho X P10, 02×Adaptador XLR X RCA, 02×DI, 01×SM58.

**Cabeamento sonoro:** 05×XLR-5M, 05×XLR-10M, 01×Régua Pentacústica, 01×Powercon X Flecha.

**Estrutural:** 01×Caixa de Ferramenta, 01×Maleta de Fitas / Cintas Plásticas.

**Observação livre:**
- Cênica externa só no sábado.
- 2 Caixas Ativa vai ser utilizada no domingo.

---

## 5. Modelo conceitual derivado

Mapeamento das seções acima para entidades no produto. Use como guia para evoluir o schema.

### 5.1. Entidades

| Entidade | Existe hoje? | Observações |
|---|---|---|
| `events` (OS) | ✓ | Faltam: `vehicle`, `lighting_color`, `assembly_date`, `assembly_time`, `event_start_time`, `event_end_time`, `teardown_time`, `agency_id`, `executive_present`, `is_recorded`, `is_livestreamed`, `client_demanding`, `agency_detailed`, `notes` (livre). |
| `event_dates` | ✗ | Multi-data por OS (`28/02` + `01/03`). |
| `event_speakers` | ✗ | Lista de palestrantes com mic, notebook, adaptador, técnico exclusivo. |
| `event_led_panel` | ✗ | Tamanho, resolução, conteúdo enviado, operador necessário. |
| `event_extras` | ✗ | Gerador, box truss, TV, projetor, palco, outros. |
| `event_team_assignments` | parcial | Vinculação por **data** (escala diária), não atribuição única. Papéis: técnico responsável, áudio, luz, LED, auxiliares, comercial. |
| `event_critical_points` | ✗ | Perfil cliente, expectativa, valores, sensibilidades, "não pode acontecer". |
| `event_venue_info` | ✗ | Tensão, distância carga, elevador, acesso, limite som, ART. |
| `event_attachments` | ✗ | Layout LED, rider, identidade visual, mapa palco, cronograma cerimonial. Storage. |
| `event_transport` | ✗ | Veículo, motorista, saída, deslocamento. |
| `event_lodging` | ✗ | Hotel, quartos, check-in/out, hóspedes. |
| `event_meals` | ✗ | Tipo + observações. |
| `event_load_dock` | ✗ | Local, responsável, credencial, taxa, horário. |
| `equipment_categories` | parcial | Existe `categories` mas precisa suportar **sub-buckets** (Gaveteiro dentro de Sonorização) e ordenação na lista impressa. |
| `equipment_size_variants` | ✗ | Cabo XLR-5M ≠ XLR-10M. Hoje não há variantes — ou modela como itens separados ou cria variantes. |
| `event_equipment` | ✓ | Trocar `confirmed` por **dois estados** (`separated` + `loaded`) ou enum `pending → separated → loaded`. |
| `event_checklist_items` | ✓ | Hoje 5 itens fixos. Virar **dinâmico** baseado nas seções estratégicas/comerciais/operacionais. |

### 5.2. Estados / gates

OS atravessa três gates sequenciais:

1. **Gate Estratégico/Comercial** (seções 2.1–2.13) → libera para `production`.
2. **Gate Operacional/Logístico** (seção 3) → libera para `ready_to_load`.
3. **Operação de campo** (separação → carregamento → checkout → in_field → checkin/retorno → completed).

Status sugerido para `event_status`:

```
draft → strategic_review → production → ready_to_load → in_field → returning → completed
                                                                 ↘ cancelled
```

(hoje: `planning → ready_to_load → in_field → completed → cancelled` — falta `draft`, `strategic_review`, `production`, `returning`.)

### 5.3. Lista de equipamentos — visualização

A OS impressa (seção 4) é a referência canônica para a tela de equipamentos da OS:

- Agrupada por **categoria** com cabeçalho.
- Sub-bucket nominal dentro da categoria (ex.: Gaveteiro).
- Cabeamento listado **por tamanho** (quant + tamanho + 1 checkbox simples só "Carregado" — tabela mais densa).
- Material principal listado em tabela `Carregado | Quant | Material | Separado`.
- Observações livres no fim.

---

## 6. Implicações imediatas para o produto

Priorizado para evolução próxima do app.

### 6.1. Bloqueadores conhecidos

1. **Checklist hard-coded em 5 itens** (`DEFAULT_CHECKLIST_ITEMS` em `src/lib/events.ts:60`). Precisa virar template configurável e por organização, refletindo seções 2.1–2.13 e 3.1–3.6.
2. **Sem multi-data por OS.** Schema atual tem `start_date` / `end_date` simples — não suporta `28/02 + 01/03` com equipe diferente por dia.
3. **Sem campo de veículo nem motorista.**
4. **`event_equipment.confirmed` é um único bool.** Falta o estado `separado` antes de `carregado`.
5. **Sem variantes de tamanho** para cabos — hoje precisaria cadastrar `XLR-5M` e `XLR-10M` como equipamentos separados.
6. **Sem categorias hierárquicas / sub-buckets** (Gaveteiro dentro de Sonorização).
7. **Sem anexos / storage** para layout, rider, identidade visual, mapa palco.
8. **Sem cadastro de palestrantes, equipe rotativa, hospedagem, transporte.**

### 6.2. Refatorações sugeridas (em ordem de dependência)

1. **Checklist dinâmico** — `checklist_templates` + `checklist_template_items` (por organização e por tipo de OS).
2. **`event_dates`** — uma OS, N datas, cada uma com horário de montagem/início/término/desmontagem e escala de equipe.
3. **`event_equipment` — fluxo de 2 estados** (`separated_at`, `loaded_at` ou enum).
4. **Variantes de tamanho** em `equipment` ou `equipment_size_variants`.
5. **Sub-buckets de categoria** (campo `parent_category_id`).
6. **Campos novos em `events`**: `vehicle`, `assembly_at`, `teardown_at`, `lighting_color`, `agency_id`, flags de risco, `notes`.
7. **Tabelas auxiliares**: `event_speakers`, `event_led_panel`, `event_extras`, `event_critical_points`, `event_venue_info`, `event_attachments`, `event_transport`, `event_lodging`, `event_meals`, `event_load_dock`.

---

## 7. Glossário operacional

| Termo | Significado |
|---|---|
| OS | Ordem de Serviço — uma venda/evento. |
| Gate | Marco que bloqueia avanço de status até preenchimento completo. |
| VT | Visita Técnica — vistoria no local antes do evento. |
| ART | Anotação de Responsabilidade Técnica (engenharia). |
| Pentacústica | Régua/distribuidor de áudio de 5 canais. |
| Powercon | Conector elétrico travado (Neutrik). |
| Flecha | Tomada/conector específico no jargão Partion. |
| Gaveteiro | Caixa/maleta com acessórios pequenos de sonorização. |
| Rider técnico | Documento do artista/banda com exigências de equipamento. |
| Cênica | Iluminação cênica de palco. |
| Box truss | Estrutura metálica de treliça para iluminação/palco. |

---

## 8. Histórico do documento

- **2026-05-13** — versão inicial consolidada a partir de: template estratégico (Andri), template logístico, exemplo real OS Formatura Dom Manuel 28/02–01/03.
