# AI Danny — Second Brain

Talk to your notes from the `/jarvis-code` cockpit.

**This deployable build uses the API brain** (`BRAIN_ENGINE=api`): Anthropic or
Vercel AI Gateway — **no local Claude CLI required**. That is what runs on
Vercel and Netlify.

**Minimum to chat:** one LLM key. The app ships curated knowledge in
`content/knowledge/*` and answers from that with no database.

```
┌─────────────────┐   NDJSON    ┌──────────────────────┐
│  /jarvis-code   │ ◀────────── │  /api/jarvis-code/run │
│  (UI)           │             │  API brain            │
└─────────────────┘             └──────────┬───────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                                 ▼
                 content/knowledge/*              Supabase vault (optional)
                 (always available)               upload + semantic search
```

## One-click deploy

> Buttons only ask for your **LLM API key**. `BRAIN_ENGINE=api` is already the
> default — you do not set it. Supabase is optional.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain&env=AI_GATEWAY_API_KEY&envDescription=Paste%20your%20Vercel%20AI%20Gateway%20key%20(or%20set%20ANTHROPIC_API_KEY%20after%20deploy).%20BRAIN_ENGINE%20defaults%20to%20api%20%E2%80%94%20no%20need%20to%20add%20it.&envLink=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain%23environment-variables&project-name=ai-second-brain&repository-name=ai-second-brain)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/demo55oo/ai-second-brain)

After deploy, open **Environment variables** and paste `AI_GATEWAY_API_KEY` **or**
`ANTHROPIC_API_KEY`. Nothing else is required to chat.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` **or** `ANTHROPIC_API_KEY` | yes | Chat answers |
| `AI_MODEL` | optional | Defaults internally; e.g. `anthropic/claude-sonnet-4-6` |
| `BRAIN_ENGINE` | no | Defaults to `api` — do not set unless you want `cli` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | optional | Cloud vault upload only |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional | Only with Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Only for cloud vault ingest |
| `OPENAI_API_KEY` | optional | Embeddings if using Supabase vault without gateway |
| `APP_URL` | optional | Public site URL |

Copy [`.env.example`](./.env.example) locally as `.env.local`.

## Optional: Supabase vault upload

Skip this entirely if you only want chat against the shipped knowledge docs.

1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run [`supabase/migrations/0007_vault_vectors.sql`](./supabase/migrations/0007_vault_vectors.sql).
3. Paste URL + anon + service_role into your host env.
4. In the app: gear → **Vault upload** → upload `.md` / `.zip` or seed.

See [`supabase/SETUP.md`](./supabase/SETUP.md).

## Local setup

```bash
npm install
cp .env.example .env.local   # fill AI_GATEWAY_API_KEY or ANTHROPIC_API_KEY
npm run dev
```

Open <http://localhost:3000/jarvis-code> and ask a question. No Supabase needed.

## What works in this slim build

| Feature | Status |
|---|---|
| AI Brain chat (`/jarvis-code`) | ✅ API engine — **no Supabase** |
| Curated knowledge docs | ✅ `content/knowledge/*` |
| Vault upload + semantic search | ⚪ optional (Supabase + `0007` SQL) |
| Brand kit settings | ⚪ optional (Supabase brand_kits) |
| Claude Code CLI / MCP / LinkedIn / Apify | ⏸ optional local only (`BRAIN_ENGINE=cli`) |

## Project layout

```
src/app/jarvis-code/       cockpit UI
src/app/api/brain/         graph, search, upload
src/app/api/jarvis-code/   run (API brain + optional CLI)
src/lib/api-brain.ts       deployable LLM path
src/lib/client-knowledge.ts curated docs (no DB)
src/lib/vault-supabase.ts  optional ingest + match_vault_chunks
supabase/migrations/       optional SQL schema
content/knowledge/         seed markdown (works offline)
```

## Cost notes

- Chat bills against Anthropic or your AI Gateway plan.
- Embeddings only matter if you enable vault upload.

## Desktop / Claude CLI (optional)

The old subscription-based Claude Code spawn still exists. Set `BRAIN_ENGINE=cli`,
install the Claude Code CLI, and see [DESKTOP.md](./DESKTOP.md). That path
**does not** run on serverless.
