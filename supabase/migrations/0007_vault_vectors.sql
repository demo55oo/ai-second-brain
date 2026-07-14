-- Second Brain — Vault Vectors
-- ---------------------------------------------------------------------------
-- WHY: the curated GTM docs (content/knowledge/*) are the founder's polished
-- positioning, but the REAL second brain is their whole Obsidian vault. This
-- stores that vault as semantic vectors so /jarvis and the brain can retrieve
-- from everything the founder has ever written — not just the 12 hand-authored
-- docs.
--
-- Flow: /brain page uploads a .zip → notes are chunked + embedded
-- (text-embedding-3-small, 1536-dim) → rows land here → match_vault_chunks()
-- powers nearest-neighbour retrieval (same pattern as match_memories).
--
-- Single-tenant self-host: rows are scoped by `client` (a slug), not a user.
-- Reads happen server-side via the service-role client. RLS mirrors the
-- knowledge_docs convention (permissive read) so the brain UI can show stats.
--
-- Run AFTER 0006_agents_chat_knowledge.sql.
-- ---------------------------------------------------------------------------

create extension if not exists vector;

-- set_updated_at() already exists (0006); redefine defensively so this file is
-- safe to run on its own.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- vault_documents — one row per ingested note (the prose + its metadata).
-- =========================================================================
create table if not exists public.vault_documents (
  id          uuid primary key default gen_random_uuid(),
  client      text not null default 'default',
  path        text not null,                 -- relative path inside the vault
  title       text not null,
  folder      text not null default '(root)',
  tags        text[] not null default '{}',
  links       text[] not null default '{}',   -- outgoing [[wikilink]] targets → graph edges
  content     text not null default '',       -- full note body (frontmatter stripped)
  char_count  int not null default 0,
  chunk_count int not null default 0,
  mtime       bigint,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client, path)
);
comment on table public.vault_documents is 'One row per ingested Obsidian note. content is the full body; chunks live in vault_chunks.';
comment on column public.vault_documents.client is 'Tenant/vault slug. Single-tenant default = ''default''.';

create index if not exists vault_documents_client_idx on public.vault_documents(client);

-- =========================================================================
-- vault_chunks — one row per embedded chunk (the retrieval unit).
-- =========================================================================
create table if not exists public.vault_chunks (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.vault_documents(id) on delete cascade,
  client      text not null default 'default',
  path        text not null,
  title       text not null,
  folder      text not null default '(root)',
  chunk_index int not null default 0,
  content     text not null,
  embedding   vector(1536),                   -- text-embedding-3-small
  created_at  timestamptz not null default now()
);
comment on table public.vault_chunks is 'Embedded chunks of vault notes. match_vault_chunks() does cosine NN over embedding.';

create index if not exists vault_chunks_client_idx on public.vault_chunks(client);
create index if not exists vault_chunks_document_idx on public.vault_chunks(document_id);
create index if not exists vault_chunks_embedding_idx
  on public.vault_chunks
  using hnsw (embedding vector_cosine_ops);

-- =========================================================================
-- RLS — permissive read (matches knowledge_docs/agents); writes are
-- service-role only (the ingest API uses the admin client, bypassing RLS).
-- =========================================================================
alter table public.vault_documents enable row level security;
alter table public.vault_chunks enable row level security;

drop policy if exists "vault_documents readable" on public.vault_documents;
create policy "vault_documents readable" on public.vault_documents for select using (true);

drop policy if exists "vault_chunks readable" on public.vault_chunks;
create policy "vault_chunks readable" on public.vault_chunks for select using (true);

-- Single-tenant self-host: the ingest API prefers the service-role client (which
-- bypasses RLS), but falls back to the anon key when no service key is set. These
-- permissive write policies let that fallback work. The DB belongs to the one
-- founder uploading their own vault, so this matches the product's threat model.
drop policy if exists "vault_documents writable" on public.vault_documents;
create policy "vault_documents writable" on public.vault_documents for all using (true) with check (true);

drop policy if exists "vault_chunks writable" on public.vault_chunks;
create policy "vault_chunks writable" on public.vault_chunks for all using (true) with check (true);

drop trigger if exists vault_documents_updated_at on public.vault_documents;
create trigger vault_documents_updated_at before update on public.vault_documents
  for each row execute function public.set_updated_at();

-- =========================================================================
-- match_vault_chunks() — cosine-similarity retrieval (mirrors match_memories).
-- =========================================================================
create or replace function public.match_vault_chunks (
  query_embedding      vector(1536),
  filter_client        text default 'default',
  match_count          int default 8,
  similarity_threshold float default 0.2
)
returns table (
  id          uuid,
  document_id uuid,
  path        text,
  title       text,
  folder      text,
  chunk_index int,
  content     text,
  similarity  float
)
language sql stable as $$
  select
    c.id,
    c.document_id,
    c.path,
    c.title,
    c.folder,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.vault_chunks c
  where c.client = filter_client
    and c.embedding is not null
    and 1 - (c.embedding <=> query_embedding) > similarity_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
comment on function public.match_vault_chunks is 'Cosine NN search over vault_chunks for a client. Returns the nearest chunks with similarity.';

-- =========================================================================
-- vault_stats() — quick counts for the /brain UI + status endpoint.
-- =========================================================================
create or replace function public.vault_stats(filter_client text default 'default')
returns table (documents bigint, chunks bigint, folders bigint)
language sql stable as $$
  select
    (select count(*) from public.vault_documents d where d.client = filter_client),
    (select count(*) from public.vault_chunks    c where c.client = filter_client),
    (select count(distinct d.folder) from public.vault_documents d where d.client = filter_client);
$$;
comment on function public.vault_stats is 'Document/chunk/folder counts for a client vault.';
