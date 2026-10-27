# Bills

Multi-tenant PWA for landlords to collect monthly utility meter readings, split bills between units and send statements. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Layout

| Path | What |
|---|---|
| `apps/web` | React + Vite PWA (Hebrew/English, RTL/LTR) |
| `packages/engine` | Billing engine (integer agorot, fully unit-tested) |
| `supabase/migrations` | Database schema and Row Level Security |
| `docs` | Architecture and decisions |

## Develop (Windows)

Node 22 is managed by [fnm](https://github.com/Schniz/fnm) and is deliberately **not** the system default (the system Node is used by other projects). Use the wrapper, which runs pnpm under the Node version in `.node-version`:

```
scripts\pnpm install
scripts\pnpm dev            # starts the web app on http://localhost:5173
scripts\pnpm test           # engine tests
scripts\pnpm typecheck
```

Copy `.env.example` to `apps/web/.env.local` and fill in your Supabase project URL and publishable key. Never commit real `.env*` files; the service-role key and DB password must never be given a `VITE_` prefix.

## Database

Apply `supabase/migrations/*.sql` in order (Supabase dashboard → SQL Editor, or the Supabase CLI). To make yourself a platform admin after signing up once:

```sql
insert into public.platform_admins (user_id)
select id from auth.users where email = 'you@example.com';
```
