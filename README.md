This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Material a mais na carga da OS

O fluxo de carga permite que um usuário `warehouse` vinculado à Ordem de Serviço registre material retirado além do planejamento. A aba **Material a mais** só aparece para esse papel, mas a segurança não depende da interface: cada Server Action e cada RPC revalida autenticação, organização, papel e vínculo com a OS.

- A inclusão é aceita apenas quando a OS está em `ready_to_load` ou `in_field`.
- Material serializado é registrado por QR ou seleção de unidade; material em lote exige uma quantidade inteira positiva.
- O motivo é obrigatório e normalizado com `trim()`.
- Cada inclusão atualiza os metadados mais recentes em `event_equipment` e cria um registro imutável em `event_equipment_extra_log`, preservando o histórico de motivos, responsável e horário.
- O material extra entra carregado imediatamente, reduz a disponibilidade e precisa ser devolvido antes da conclusão da OS.
- `admin` e os demais papéis não veem a terceira aba e não podem contornar a regra chamando a action diretamente. Um `warehouse` não vinculado também é rejeitado.

### Ordem de implantação

1. Faça backup e confirme explicitamente que o projeto Supabase alvo não é produção.
2. Aplique as migrations em ordem cronológica; `20260820_000026_event_extra_material.sql` deve vir depois de `20260816_000024_employee_role.sql` e `20260816_000025_employee_events_maintenance_policies.sql`.
3. Valide colunas e constraints de `event_equipment`, RLS e leitura de `event_equipment_extra_log`, grants das RPCs para `authenticated` e rollback transacional em uma OS descartável.
4. Só então implante a aplicação compatível e execute a aceitação dos perfis `warehouse` vinculado, `admin` e `warehouse` não vinculado.

Não aplique a migration em produção sem autorização explícita. Os comandos, verificações e a orientação de rollback estão em [`supabase/README.md`](supabase/README.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
