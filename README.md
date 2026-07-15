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

> Paste only your **LLM API key**. `BRAIN_ENGINE=api` is already the default.
> On Vercel, the button also **creates a private Blob store** and injects
> `BLOB_READ_WRITE_TOKEN` — you do **not** copy/paste a Blob token.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain&env=AI_GATEWAY_API_KEY&envDescription=Paste%20your%20Vercel%20AI%20Gateway%20key%20(or%20set%20ANTHROPIC_API_KEY%20after%20deploy).%20Blob%20storage%20is%20created%20automatically%20%E2%80%94%20do%20not%20paste%20a%20Blob%20token.&envLink=https%3A%2F%2Fgithub.com%2Fdemo55oo%2Fai-second-brain%23environment-variables&project-name=ai-second-brain&repository-name=ai-second-brain&stores=%5B%7B%22type%22%3A%22blob%22%2C%22access%22%3A%22private%22%7D%5D)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/demo55oo/ai-second-brain)

After deploy, open **Environment variables** and paste `AI_GATEWAY_API_KEY` **or**
`ANTHROPIC_API_KEY`. Blob (Vercel) is provisioned by the button — the app detects
`BLOB_READ_WRITE_TOKEN` automatically for `/brain` uploads.

**Already deployed without Blob?** In the Vercel project: **Storage → Create → Blob**
(private) → connect to this project. The token is injected for you — still no paste
into the app. Then redeploy.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` **or** `ANTHROPIC_API_KEY` | yes | Chat answers |
| `AI_MODEL` | optional | Defaults internally; e.g. `anthropic/claude-sonnet-4-6` |
| `BRAIN_ENGINE` | no | Defaults to `api` — do not set unless you want `cli` locally |
| `BLOB_READ_WRITE_TOKEN` | auto on Vercel Deploy | Injected when Blob store is created — **do not paste manually**. Powers BRAIN.md, brand kit, and knowledge doc saves |
| `NEXT_PUBLIC_SUPABASE_URL` | optional | Only if you prefer Supabase vault |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | optional | Only with Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Only with Supabase |
| `OPENAI_API_KEY` | optional | Embeddings / direct OpenAI images. **Carousel slides also work with `AI_GATEWAY_API_KEY` alone** |
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

### Your knowledge

| Where you run | What happens on upload |
|---|---|
| Local (`npm run dev`) | Merged into `content/knowledge/owner/BRAIN.md` |
| Vercel (Deploy button) | Blob store **auto-created**; one `owner/BRAIN.md` in Blob — token injected, no paste |
| Vercel (no Blob yet) | Browser fallback until you add Storage → Blob (or re-clone with the button) |
| Optional Supabase | Cloud vault + embeddings (`0007` SQL) |

That single `BRAIN.md` (disk or Blob) is what the AI reads. Uploads replace Danny.

## What works in this slim build

| Feature | Status |
|---|---|
| AI Brain chat (`/jarvis-code`) | ✅ API engine — **no Supabase** |
| Curated knowledge docs | ✅ `content/knowledge/*` |
| Owner BRAIN.md (merged uploads) | ✅ local disk or Vercel Blob |
| Browser vault (no Blob) | ✅ IndexedDB fallback |
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
