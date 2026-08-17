# Cadastro e login público de funcionários

## Objetivo

Adicionar à tela pública de autenticação um fluxo separado para funcionários criarem a própria conta e entrarem no sistema. Toda conta criada por esse fluxo será vinculada automaticamente à organização Partion com o perfil `employee`, recebendo acesso imediato somente a Eventos/OS e Manutenção.

## Experiência da tela

A página `/login` manterá um único cartão responsivo. No topo do cartão haverá duas abas:

- **Equipe interna**: preserva o login existente para os perfis atuais;
- **Funcionários**: oferece entrada e criação de conta para o perfil `employee`.

Na aba Funcionários, o estado inicial será **Entrar**. Um controle textual permitirá alternar entre **Entrar** e **Criar conta** sem sair da página.

O formulário de criação de conta solicitará:

- nome completo;
- email;
- senha com no mínimo 8 caracteres;
- confirmação da senha.

No desktop e no celular o conteúdo continuará dentro de um único cartão. As abas serão horizontais e o formulário ocupará toda a largura disponível.

## Separação dos logins

O login da Equipe interna aceitará os perfis existentes, exceto `employee`. Se uma conta `employee` usar essa aba, a sessão será encerrada e a página exibirá uma orientação para entrar pela aba Funcionários.

O login de Funcionários aceitará somente o perfil `employee`. Se outra conta usar essa aba, a sessão será encerrada e a página orientará o usuário a entrar pela aba Equipe interna.

Após autenticação válida:

- funcionários serão direcionados para `/events`;
- os demais perfis manterão seus destinos atuais.

## Cadastro público

O cadastro será livre, sem código da empresa e sem aprovação administrativa. Após validar os campos, a action do servidor deverá:

1. obter o identificador da organização Partion a partir da variável obrigatória `EMPLOYEE_ORGANIZATION_ID`;
2. confirmar com cliente administrativo que a organização existe e está ativa;
3. criar o usuário no Supabase Auth com email confirmado e `full_name` nos metadados;
4. inserir uma associação primária em `organization_members` com `role = 'employee'`;
5. autenticar o novo usuário por email e senha;
6. redirecionar para `/events`.

Se a associação à organização falhar depois da criação no Auth, a action deverá apagar o usuário recém-criado para não deixar uma conta órfã. Se a autenticação final falhar, a conta continuará criada e a interface orientará o funcionário a usar o formulário Entrar.

## Configuração

A variável de servidor abaixo será obrigatória para o cadastro público:

```env
EMPLOYEE_ORGANIZATION_ID=<uuid da organização Partion>
```

Ela não terá prefixo `NEXT_PUBLIC_` e nunca será enviada ao navegador. Ausência ou UUID inválido exibirá uma mensagem genérica de indisponibilidade do cadastro, sem revelar detalhes internos.

## Validação e mensagens

As validações serão executadas no servidor, mesmo que os inputs também tenham atributos HTML:

- nome completo obrigatório;
- email obrigatório e normalizado para minúsculas;
- senha com no mínimo 8 caracteres;
- confirmação idêntica à senha;
- organização configurada, existente e ativa;
- email ainda não cadastrado.

As mensagens serão devolvidas na própria aba e modo que originaram a ação por parâmetros de consulta codificados. Senhas nunca serão incluídas em URL, log ou mensagem.

## Autorização

O cadastro público atribuirá exclusivamente o papel `employee`; o cliente não enviará nem escolherá um papel. A action ignorará qualquer campo adicional de permissão.

As restrições implementadas para `employee` permanecem:

- pode listar, criar e editar Eventos/OS;
- não pode excluir Eventos/OS;
- pode listar e resolver Manutenção da própria organização;
- não pode acessar Dashboard, Bipar OS, Inventário, Clientes, Equipe, Sublocações ou Configurações.

## Risco explicitamente aceito

Qualquer pessoa que encontre a página poderá criar uma conta e obter acesso imediato aos Eventos/OS e à Manutenção da organização configurada. Não haverá aprovação, convite, código da empresa, domínio de email permitido, CAPTCHA ou limitação de cadastros nesta entrega.

## Testes e critérios de aceite

A entrega estará concluída quando os testes demonstrarem que:

- a tela possui as abas Equipe interna e Funcionários;
- a aba Funcionários alterna entre Entrar e Criar conta;
- o formulário público envia somente nome, email, senha e confirmação;
- cadastro válido cria Auth user, membership primária `employee` e sessão;
- falha no membership remove o Auth user criado;
- senha curta, confirmação diferente, email inválido e configuração ausente são rejeitados antes de criar usuário;
- funcionário entra somente pela aba Funcionários e é enviado a `/events`;
- conta não employee é rejeitada na aba Funcionários;
- conta employee é rejeitada na aba Equipe interna;
- os destinos e logins dos perfis existentes permanecem inalterados;
- a suíte completa não apresenta regressões.

## Fora do escopo

- aprovação administrativa;
- convite ou código de empresa;
- recuperação de senha;
- confirmação de email;
- CAPTCHA e rate limiting;
- seleção de organização pelo visitante;
- criação de outros perfis pelo cadastro público.
