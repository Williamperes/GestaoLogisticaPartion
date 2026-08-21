# Material a mais na carga da OS

## Objetivo

Permitir que a equipe de almoxarifado (`warehouse`) registre material retirado além do planejamento original de uma Ordem de Serviço. O material entra imediatamente na OS, compromete o estoque, participa da carga e deve voltar no fluxo normal de devolução.

## Escopo e acesso

- O recurso fica na rota de carregamento de uma OS, como terceira aba ao lado de **Bipar** e **Desbipar**.
- A aba **Material a mais** é renderizada exclusivamente para usuários com papel `warehouse`.
- A ação de servidor valida novamente o papel `warehouse`; ocultar a aba não é a barreira de segurança.
- O usuário precisa ser membro da organização da OS e estar associado àquela OS pelas regras já usadas na página de carga.
- A inclusão é permitida somente quando a OS está `ready_to_load` ou `in_field`.
- `admin`, `super_admin`, `operations`, `employee`, `client` e usuários sem papel não podem executar a inclusão, mesmo chamando a ação diretamente.

## Modelo de dados

### `event_equipment`

A tabela continua sendo a fonte canônica de todos os materiais da OS. Serão adicionadas as colunas:

- `extra_qty integer not null default 0 check (extra_qty >= 0)`
- `extra_reason text`
- `extra_added_by uuid references auth.users(id) on delete set null`
- `extra_added_at timestamptz`
- `bulk_loaded_qty integer not null default 0 check (bulk_loaded_qty >= 0)`
- `bulk_returned_qty integer not null default 0 check (bulk_returned_qty >= 0)`

`qty` representa a quantidade total atual da OS: quantidade planejada mais quantidade extra. `extra_qty` registra quanto desse total foi acrescentado pela equipe.

Regras:

- Material que já existe na OS: incrementar `qty` e `extra_qty` na mesma linha.
- Material que ainda não existe: criar a linha com `qty` e `extra_qty` iguais à quantidade retirada.
- `extra_reason`, `extra_added_by` e `extra_added_at` guardam os dados da operação extra mais recente daquela linha para consultas simples.
- `extra_qty` nunca pode superar `qty`.
- Para linhas em lote, `bulk_returned_qty <= bulk_loaded_qty <= qty`.
- Para linhas serializadas, os contadores continuam derivados de `event_equipment_units`; os novos contadores agregados permanecem em zero.

### Auditoria

Uma tabela `event_equipment_extra_log` registra cada operação sem se tornar uma segunda fonte de itens:

- `id uuid primary key`
- `event_id uuid not null`
- `event_equipment_id uuid not null`
- `equipment_id uuid not null`
- `variant_id uuid null`
- `equipment_unit_id uuid null`
- `qty integer not null check (qty > 0)`
- `reason text not null` com valor não vazio
- `added_by uuid null`
- `created_at timestamptz not null`

A tabela terá índices por OS, linha de equipamento e data. Exclusão da OS ou da linha correspondente remove seus logs. RLS permite leitura aos membros da organização, mas inserção somente a `warehouse` vinculada à OS. Atualização e exclusão de logs não serão permitidas pela aplicação.

## Fluxo serializado por QR

1. O usuário abre **Material a mais** e informa o motivo obrigatório.
2. Bipa o QR de uma unidade física.
3. O servidor valida autenticação, papel, vínculo com a OS, estado da OS e motivo.
4. O servidor localiza a unidade e rejeita unidades em manutenção, inativas ou comprometidas com outra OS ativa.
5. Na mesma transação, o servidor cria ou incrementa `event_equipment`, vincula a unidade em `event_equipment_units` já com `loaded_at` e `loaded_by`, e cria o log de auditoria.
6. A UI atualiza a lista de extras e o progresso de carga.

Uma unidade já carregada na mesma OS retorna sucesso idempotente sem aumentar novamente as quantidades. Um QR usado em outra OS ativa retorna erro e não altera dados.

## Fluxo manual e material em lote

1. O usuário pesquisa materiais da organização por nome, marca, modelo ou variante.
2. A lista mostra tipo, variante e disponibilidade atual.
3. Para item em lote, o usuário informa uma quantidade positiva; para serializado sem QR, seleciona uma unidade disponível.
4. O motivo é obrigatório.
5. O servidor repete todas as validações e registra a operação atomicamente.

Para estoque em lote, a disponibilidade continua derivada das quantidades comprometidas por OS ativas. A inclusão extra aumenta `event_equipment.qty` e `bulk_loaded_qty` na mesma quantidade, passando a reduzir imediatamente a disponibilidade e a registrar que o lote já saiu fisicamente. A transação bloqueia/revalida a linha de estoque e a capacidade antes da escrita para impedir overbooking concorrente.

## Carga e devolução

- Material extra é considerado carregado imediatamente no momento da inclusão.
- Para serializados, isso é representado em `event_equipment_units.loaded_at`.
- Para lote, a carga e a devolução usam `bulk_loaded_qty` e `bulk_returned_qty`, pois não existem unidades físicas em `event_equipment_units`.
- Os cálculos de progresso passam a usar a contagem de `event_equipment_units` para serializados e os contadores agregados para lote.
- O material extra aparece na página de devolução usando a mesma linha `event_equipment`.
- A OS só pode ser concluída quando todo material efetivamente carregado, incluindo extras, tiver sido devolvido ou tratado pelas regras existentes de danificado/perdido.
- Ao desfazer uma inclusão antes da saída, a aplicação deverá registrar uma operação compensatória em vez de apagar o log original. Esta primeira entrega não oferecerá edição ou exclusão direta de logs.

## Interface

- A aba **Material a mais** aparece apenas quando `role === "warehouse"`.
- Ela contém o scanner, campo de motivo obrigatório e acesso à busca manual.
- A busca manual permite escolher variante/unidade e quantidade quando aplicável.
- Uma seção lista os extras da OS com nome, variante, quantidade, motivo, responsável e horário.
- Confirmações bem-sucedidas usam feedback visual/sonoro compatível com a bipagem atual.
- Falhas mostram mensagens específicas e mantêm o motivo digitado para nova tentativa.
- A aba não é mostrada em acessos administrativos.

## Erros e consistência

Nenhuma escrita parcial é aceita. A operação deve falhar integralmente para:

- usuário não autenticado ou sem papel `warehouse`;
- usuário sem vínculo com a OS;
- OS inexistente, cancelada, concluída ou em estado não permitido;
- motivo vazio;
- quantidade inválida ou superior à disponibilidade;
- material ou variante de outra organização;
- unidade indisponível, inativa, em manutenção ou comprometida em outra OS;
- QR repetido de forma não idempotente.

A implementação deve usar uma função SQL transacional/RPC para validar disponibilidade, atualizar a linha da OS, registrar unidade carregada e inserir auditoria como uma única operação. A action Next.js faz autenticação, autorização inicial, normalização de entrada e traduz erros da RPC em mensagens de interface.

## Consultas e tipos

- A consulta de evento passa a retornar `extraQty`, `extraReason`, `extraAddedBy` e `extraAddedAt` em cada item.
- Uma consulta específica retorna o histórico `event_equipment_extra_log` para a aba.
- A busca de material disponível reutiliza as regras de disponibilidade já existentes, filtrada pela organização e pelas datas/estado da OS.
- Tipos TypeScript distinguem entradas por QR serializado e inclusão manual.

## Testes

### Banco e domínio

- cria item extra novo e seu log atomicamente;
- incrementa item já planejado sem perder a quantidade original;
- rejeita quantidade acima da disponibilidade e concorrência que causaria overbooking;
- atualiza carga e devolução agregadas de material em lote;
- trata repetição do mesmo QR na mesma OS de modo idempotente;
- rejeita QR comprometido em outra OS ativa;
- inclui o extra na devolução e só libera estoque após retorno;
- preserva cada motivo no histórico.

### Autorização

- `warehouse` vinculado pode incluir;
- `warehouse` não vinculado não pode incluir;
- demais papéis não podem incluir por chamada direta;
- materiais de outra organização são rejeitados.

### Interface

- aba aparece somente para `warehouse`;
- motivo vazio impede envio;
- QR e inclusão manual atualizam a lista e o progresso;
- erros não apagam a entrada do usuário;
- extras aparecem na devolução.

## Fora do escopo

- aprovação prévia por administrador;
- edição ou exclusão de logs de auditoria;
- aba equivalente para outros papéis;
- inventário livre digitado sem vínculo com um material cadastrado;
- notificações externas por e-mail ou mensagem.
