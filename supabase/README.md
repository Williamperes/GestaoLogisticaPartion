# Supabase Schema

As migrations em `supabase/migrations` são incrementais e devem ser aplicadas pela ordem do prefixo de data. A base mantém isolamento multi-tenant por `organization_id`, organização primária por `is_primary` e autorização efetiva por RLS e funções do banco, além dos guards da aplicação.

## Migration 026 — material extra

`20260820_000026_event_extra_material.sql` depende do schema de eventos, equipamentos, unidades, equipes e papéis criado pelas migrations anteriores. Na sequência imediata, aplique:

1. `20260816_000024_employee_role.sql`
2. `20260816_000025_employee_events_maintenance_policies.sql`
3. `20260820_000026_event_extra_material.sql`

A migration 026 adiciona os metadados `extra_*` e os contadores `bulk_*` a `event_equipment`, cria a auditoria append-only `event_equipment_extra_log` e instala as RPCs atômicas de inclusão, carga e devolução. Ela não é idempotente e não deve ser executada manualmente uma segunda vez.

### Aplicação controlada

Antes de qualquer escrita, confirme com o responsável o `project-ref`, o ambiente e a existência de backup. O alvo deve ser desenvolvimento ou homologação; produção exige autorização explícita.

```bash
# confira o projeto vinculado e as migrations pendentes
supabase migration list

# somente depois de confirmar o alvo não produtivo
supabase db push
```

Não use `--include-all`, não cole a migration parcialmente no SQL Editor e não execute estes comandos a partir de um projeto Supabase não confirmado. A aplicação Next.js compatível deve ser implantada somente após o banco.

### Verificação pós-migration

No ambiente controlado, confirme:

- `event_equipment.extra_qty`, `extra_reason`, `extra_added_by`, `extra_added_at`, `bulk_loaded_qty` e `bulk_returned_qty`, incluindo `extra_qty <= qty` e `bulk_returned_qty <= bulk_loaded_qty <= qty`;
- RLS habilitada em `event_equipment_extra_log`, leitura limitada a membros da organização e ausência de políticas de update/delete da aplicação;
- `EXECUTE` para `authenticated` e ausência de grant público nas RPCs expostas pela migration;
- inclusão permitida somente para `warehouse` vinculado, em OS `ready_to_load` ou `in_field`;
- inclusão negada para `admin`, outros papéis e `warehouse` não vinculado, inclusive por chamada direta;
- motivo vazio rejeitado e cada operação bem-sucedida preservada como nova linha de auditoria, sem sobrescrever o histórico;
- serializado e lote já aparecem carregados na OS e permanecem pendentes até a devolução.

Para validar atomicidade, use uma OS descartável de homologação: registre o estado inicial das linhas e logs, provoque uma falha conhecida dentro da RPC (por exemplo, quantidade acima da disponibilidade) e confirme que `event_equipment`, `event_equipment_units` e `event_equipment_extra_log` ficaram inalterados. Em seguida faça uma inclusão válida, devolva todo o material e conclua a OS.

## Rollback

Prefira uma migration corretiva para ambientes que já receberam operações, pois remover a migration 026 elimina a trilha de auditoria e torna a aplicação atual incompatível.

Em incidente de implantação:

1. interrompa novas inclusões extras e preserve logs e evidências;
2. reverta primeiro a aplicação para uma versão compatível com o schema anterior;
3. restaure o backup anterior à migration, ou crie e revise uma migration corretiva que reverta funções, grants, policies, tabela, constraints e colunas na ordem inversa;
4. reaplique/valide RLS e grants, execute a suíte e repita a aceitação em homologação antes de liberar tráfego.

Nunca apague `event_equipment_extra_log` em um banco com uso real sem retenção aprovada. Um rollback destrutivo só deve ocorrer em ambiente controlado, com backup validado e autorização explícita do responsável pelo banco.
