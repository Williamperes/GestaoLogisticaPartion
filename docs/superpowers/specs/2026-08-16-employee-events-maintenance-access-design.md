# Acesso de funcionário a Eventos/OS e Manutenção

## Objetivo

Criar um perfil de acesso chamado **Funcionário** para membros da equipe que precisam trabalhar com Eventos/OS e Manutenção, mas não devem acessar as demais áreas administrativas ou operacionais do sistema.

O perfil será selecionável nos fluxos existentes de criação de técnico com acesso e de concessão de acesso a um técnico já cadastrado.

## Escopo funcional

O perfil `employee` poderá:

- visualizar a lista e os detalhes de Eventos/OS da organização;
- criar Eventos/OS;
- editar Eventos/OS e seus dados relacionados já disponíveis nessa área;
- visualizar a fila de Manutenção da organização;
- resolver uma ocorrência de manutenção, fechando o registro e liberando a unidade para o estoque.

O perfil não poderá acessar:

- Dashboard;
- Bipar OS;
- Inventário;
- Clientes;
- Equipe;
- Sublocações;
- Configurações;
- qualquer outra área não explicitamente permitida neste documento.

Excluir Eventos/OS continuará seguindo a regra atual do sistema: somente administradores podem excluir. A inclusão do perfil `employee` nas permissões de escrita não ampliará a permissão de exclusão.

## Modelo de autorização

Será acrescentado o valor `employee` ao enum `public.app_role` por uma nova migration e ao tipo `AppRole` da aplicação. As permissões serão explícitas por recurso, sem tratar esse perfil como acesso geral à área de Operações.

A autorização será aplicada em todas as camadas relevantes:

1. O menu mostrará apenas “Eventos & OS” e “Manutenção” dentro do grupo Operações.
2. As páginas dessas duas áreas aceitarão o perfil `employee`; páginas proibidas continuarão redirecionando ou negando acesso.
3. Server actions de Eventos/OS permitirão as operações de criação e edição necessárias ao fluxo da tela.
4. As políticas RLS das tabelas de Eventos/OS e registros relacionados incluirão `employee` para leitura, inserção e atualização, sem incluí-lo nas políticas de exclusão administrativas.
5. A ação de resolução de manutenção validará sessão, perfil, organização e pertencimento da ocorrência antes de atualizar o registro e a unidade.

Esconder itens do menu não será considerado uma barreira de segurança. Acesso direto por URL e chamadas diretas às ações deverão ser bloqueados pelas verificações de servidor e pelo banco.

## Cadastro do acesso

Os dois formulários existentes na área Equipe receberão a opção:

> Funcionário — Eventos/OS e Manutenção

Ela estará disponível tanto ao criar um técnico com “Criar acesso ao app” quanto ao conceder acesso a um técnico existente. As actions aceitarão `employee` na lista de perfis provisionáveis.

Somente os perfis que já podem provisionar acessos continuarão autorizados a fazê-lo. Esta funcionalidade não dará ao próprio funcionário acesso à tela Equipe nem permissão para criar outros usuários.

## Navegação e redirecionamento

Após autenticação, um usuário `employee` deverá entrar em `/events`. Isso evita direcioná-lo ao Dashboard, que não faz parte de seu acesso.

Tentativas de abrir rotas proibidas deverão levar o usuário a `/events`. O menu lateral, inclusive na versão móvel, exibirá somente os dois links autorizados e a opção de sair.

## Eventos/OS

O perfil terá o mesmo conjunto de operações de criação e edição de Eventos/OS hoje permitido ao perfil `operations`, incluindo os dados auxiliares manipulados na página de detalhes. Ele não herdará permissões de `operations` para Inventário, Clientes, Equipe, Sublocações ou Dashboard.

As tabelas e actions efetivamente usadas por criação e edição serão inventariadas no plano de implementação para que não haja autorização parcial, em que a tela abre mas alguma seção falha ao salvar.

## Manutenção

O perfil poderá listar ocorrências abertas e acionar “Resolver”. A resolução deverá ocorrer apenas quando:

- o usuário estiver autenticado;
- seu perfil for `super_admin`, `admin`, `operations`, `warehouse` ou `employee`;
- a ocorrência pertencer à organização primária do usuário;
- a unidade relacionada também pertencer à mesma organização.

Registros inexistentes, já resolvidos ou pertencentes a outra organização não poderão provocar alterações indevidas. O resultado deverá retornar uma mensagem segura para a interface, sem expor dados de outra organização.

## Compatibilidade e migração

Os perfis atuais (`super_admin`, `admin`, `operations`, `warehouse`, `finance` e `client`) manterão seu comportamento. Nenhum usuário existente será convertido automaticamente para `employee`.

A mudança do enum será feita em migration incremental e deverá preceder políticas ou inserts que usem o novo valor.

## Testes e critérios de aceite

A implementação estará concluída quando os testes demonstrarem que:

- `employee` é reconhecido como um `AppRole` válido;
- o menu desktop e móvel mostra somente Eventos & OS e Manutenção para esse perfil;
- o perfil é oferecido nos dois fluxos de criação de acesso da Equipe;
- administradores conseguem provisionar um usuário com o novo perfil;
- o funcionário acessa a lista e os detalhes de Eventos/OS;
- o funcionário cria e edita Eventos/OS e os dados relacionados suportados pela tela;
- o funcionário não exclui Eventos/OS;
- o funcionário lista e resolve manutenção da própria organização;
- o funcionário não resolve manutenção de outra organização;
- acesso direto às áreas proibidas é negado;
- os perfis existentes preservam seu comportamento.

Serão priorizados testes unitários e de componentes já adotados pelo projeto, complementados por testes das actions e verificações das políticas incluídas na migration.

## Fora do escopo

- permissões configuráveis por usuário;
- criação de uma tela genérica de gestão de perfis;
- conversão automática de usuários existentes;
- alteração dos recursos disponíveis aos demais perfis;
- permitir que o perfil Funcionário cadastre novos usuários.
