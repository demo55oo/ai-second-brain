# AI Danny — Second Brain

Talk to your notes. Upload markdown (or a vault zip), index it in Supabase, and
ask questions from the `/jarvis-code` cockpit.

**This deployable build uses the API brain** (`BRAIN_ENGINE=api`): Anthropic or
Vercel AI Gateway — **no local Claude CLI required**. That is what runs on
Vercel and Netlify.

```
┌─────────────────┐   NDJSON    ┌──────────────────────┐
│  /jarvis-code   │ ◀────────── │  /api/jarvis-code/run │
│  (UI)           │             │  API brain            │
└─────────────────┘             └──────────┬───────────┘
                                           │ hybrid search
                                 ┌─────────▼──────────┐
                                 │ Supabase vault_*   │
                                 │ + curated knowledge│
                                 └────────────────────┘
```

## One-click deploy

> Both buttons open the host UI and ask for the env vars listed below.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain&env=BRAIN_ENGINE,AI_GATEWAY_API_KEY,AI_MODEL,NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,OPENAI_API_KEY&envDescription=API%20brain%20%2B%20Supabase%20vault%20%2B%20embeddings&envLink=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain%23environment-variables&project-name=ai-second-brain&repository-name=ai-second-brain)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/demo55oo/ai-second-brain#BRAIN_ENGINE=api&AI_MODEL=anthropic/claude-sonnet-4-6)

After deploy, open **Site settings → Environment variables** (Netlify) or
**Project → Settings → Environment Variables** (Vercel) and fill any keys the
button did not prompt for.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `BRAIN_ENGINE` | yes | Set to `api` for Vercel/Netlify |
| `AI_GATEWAY_API_KEY` **or** `ANTHROPIC_API_KEY` | yes | Chat answers |
| `AI_MODEL` | recommended | e.g. `anthropic/claude-sonnet-4-6` |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Vault + brand kits |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Client-safe key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Ingest / search (server only) |
| `OPENAI_API_KEY` | if no gateway embeddings | `text-embedding-3-small` |
| `APP_URL` | optional | Public site URL |

Copy [`.env.example`](./.env.example) locally as `.env.local`.

## Supabase setup (once)

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run at least:
   - [`supabase/migrations/0007_vault_vectors.sql`](./supabase/migrations/0007_vault_vectors.sql) — vault search
   - [`supabase/migrations/0009_brand_kits.sql`](./supabase/migrations/0009_brand_kits.sql) — optional branding
3. Enable the **vector** extension if the migration asks for it (Dashboard → Database → Extensions).
4. Paste URL + anon + service_role keys into your host env.

## Local setup

```bash
npm install
cp .env.example .env.local   # fill keys
npm run dev
```

Open <http://localhost:3000/jarvis-code>.

1. Click the **gear** → **Vault upload**.
2. **Seed from content/knowledge** (ships sample docs) **or** upload `.md` / `.zip`.
3. Ask a question in the command bar.

## What works in this slim build

| Feature | Status |
|---|---|
| AI Brain chat (`/jarvis-code`) | ✅ API engine |
| Vault upload + semantic search | ✅ Supabase |
| Curated knowledge docs | ✅ `content/knowledge/*` |
| Brand kit settings | ✅ if Supabase brand_kits applied |
| Claude Code CLI / MCP / LinkedIn / Apify | ⏸ optional local only (`BRAIN_ENGINE=cli`) |

## Project layout

```
src/app/jarvis-code/       cockpit UI
src/app/api/brain/         graph, search, upload
src/app/api/jarvis-code/   run (API brain + optional CLI)
src/lib/vault-supabase.ts  ingest + match_vault_chunks
src/lib/api-brain.ts       deployable LLM path
supabase/migrations/       SQL schema
content/knowledge/         seed markdown
```

## Cost notes

- Chat bills against Anthropic or your AI Gateway plan.
- Embeddings use `text-embedding-3-small` (~$0.02 / 1M tokens).
- Vercel/Netlify free tiers have function time limits — keep vault zips under ~10–20 MB on hobby plans.

## Desktop / Claude CLI (optional)

The old subscription-based Claude Code spawn still exists. Set `BRAIN_ENGINE=cli`,
install the Claude Code CLI, and see [DESKTOP.md](./DESKTOP.md). That path
**does not** run on serverless.
