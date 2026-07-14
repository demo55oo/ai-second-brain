-- Second Brain — Content Guidelines (the "how to write" prompt library)
-- ---------------------------------------------------------------------------
-- WHY: the founder's Notion content playbook (docs/contentguidelines.md) holds
-- the MASTER PROMPTS for every format — carousels, the three cheatsheet styles
-- (listicles / vs / do's-and-don'ts), text posts, content strategy, profile
-- optimization, tone of voice. When an agent writes a given format we want to
-- retrieve the RIGHT section IN FULL and let it drive the generation.
--
-- These are stored chunk-free (one row per section, full body) AND embedded, so
-- retrieval is by task: match_content_guides() finds the section that best fits
-- "make a do's-and-don'ts cheatsheet about cold email", etc.
--
-- Run AFTER 0007_vault_vectors.sql.
-- ---------------------------------------------------------------------------

create extension if not exists vector;

create table if not exists public.content_guides (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,           -- stable slug, e.g. new-carousel-prompt
  title       text not null,                  -- the section heading
  category    text not null default 'misc',   -- carousel|cheatsheet|text|strategy|description|profile|tone|misc
  variant     text,                           -- for cheatsheets: listicle|vs|dos-donts
  is_new      boolean not null default false, -- the "New …" sections are the current ones — preferred
  body        text not null,                  -- the FULL prompt/instructions (retrieved whole)
  char_count  int not null default 0,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);
comment on table public.content_guides is 'Full master prompts per content format from the founder''s playbook. Retrieved in full, by task, to drive generation.';

create index if not exists content_guides_category_idx on public.content_guides(category);
create index if not exists content_guides_embedding_idx
  on public.content_guides using hnsw (embedding vector_cosine_ops);

-- Permissive RLS (matches the vault tables): reads + service-or-anon writes.
alter table public.content_guides enable row level security;
drop policy if exists "content_guides readable" on public.content_guides;
create policy "content_guides readable" on public.content_guides for select using (true);
drop policy if exists "content_guides writable" on public.content_guides;
create policy "content_guides writable" on public.content_guides for all using (true) with check (true);

-- Retrieve the best-matching guide(s) for a task. Optional category filter; the
-- caller boosts "new" rows. Mirrors match_vault_chunks / match_memories.
create or replace function public.match_content_guides (
  query_embedding      vector(1536),
  filter_category      text default null,
  match_count          int default 3,
  similarity_threshold float default 0.0
)
returns table (
  id         uuid,
  key        text,
  title      text,
  category   text,
  variant    text,
  is_new     boolean,
  body       text,
  similarity float
)
language sql stable as $$
  select
    c.id, c.key, c.title, c.category, c.variant, c.is_new, c.body,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.content_guides c
  where c.embedding is not null
    and (filter_category is null or c.category = filter_category)
    and 1 - (c.embedding <=> query_embedding) > similarity_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
comment on function public.match_content_guides is 'Cosine NN over content_guides, optionally filtered by category. Returns full guide bodies.';
