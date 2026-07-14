-- GTM Agents + Persistent Chat + Knowledge Index
-- ---------------------------------------------------------------------------
-- Adds the productized agent system on top of the existing brain:
--   agents          — editable per-agent config (prompt override, tone, handle…)
--   conversations   — a chat thread per (user, agent)
--   messages        — the turns in a thread (parts jsonb = AI SDK parts/blocks)
--   knowledge_docs  — queryable mirror of the ingested business-doc frontmatter
--   onboarding      — the KYC answers (channels, content types, reference)
--
-- Self-setup: run the full migration set on a fresh Supabase project and the DB
-- is ready. Agent SYSTEM PROMPTS live in code (src/lib/agents.ts AGENT_DEFAULTS);
-- this table stores user EDITS only (null system_prompt = use the code default).
--
-- Run AFTER 0005_identity_knowledge.sql.
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- agents — deployment-level config for the 5 GTM agents. Edited from the UI
-- settings panel (writes go through the service-role client, bypassing RLS).
-- =========================================================================
create table if not exists public.agents (
  key             text primary key,                 -- research|content|marketing|sales|outreach
  name            text not null,
  role            text,
  color           text,
  icon            text,
  tone            text not null default 'casual',    -- casual | formal
  handle          text,                              -- the founder's @handle (optional)
  system_prompt   text,                              -- NULL = use the code default
  knowledge_scope text[] not null default '{}',      -- doc_types this agent reads
  model           text not null default 'anthropic/claude-opus-4-8',
  enabled         boolean not null default true,
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.agents is 'Editable config for the 5 GTM agents. system_prompt NULL means use the in-code default.';
comment on column public.agents.tone is 'casual | formal — injected as a tone directive into the system prompt.';
comment on column public.agents.knowledge_scope is 'doc_types (voice-dna, icp-profile, …) this agent reads by default.';

alter table public.agents enable row level security;
drop policy if exists "agents readable" on public.agents;
create policy "agents readable" on public.agents for select using (true);
-- writes are service-role only (settings API uses the admin client)

drop trigger if exists agents_updated_at on public.agents;
create trigger agents_updated_at before update on public.agents
  for each row execute function public.set_updated_at();

-- Seed the 5 agents (metadata only; prompts come from code).
insert into public.agents (key, name, role, color, icon, tone, knowledge_scope, sort) values
  ('research',  'Research',  'Trending topics in your niche',        '#22d3ee', 'Binoculars', 'casual',
     array['rule-of-one','messaging-house','business-authority','brand-positioning','business-inbox','icp-profile'], 1),
  ('content',   'Content',   'Posts in your voice across platforms', '#a78bfa', 'PenNib', 'casual',
     array['voice-dna','personal-authority','messaging-house','business-authority','rule-of-one','brand-positioning'], 2),
  ('marketing', 'Marketing', 'Newsletters, stories, campaigns',      '#34d399', 'Megaphone', 'casual',
     array['voice-dna','messaging-house','profile-optimization','offer-strategy','brand-positioning','strategic-roadmap'], 3),
  ('sales',     'Sales',     'ICP, qualification, prospect lists',   '#f59e0b', 'Target', 'casual',
     array['icp-profile','icp-intake','offer-strategy','strategic-roadmap','rule-of-one','business-inbox'], 4),
  ('outreach',  'Outreach',  'Custom messages in your voice',        '#f43f5e', 'PaperPlaneTilt', 'casual',
     array['voice-dna','icp-profile','messaging-house','offer-strategy','profile-optimization','strategic-roadmap'], 5)
on conflict (key) do nothing;

-- =========================================================================
-- conversations — one chat thread per (user, agent). Persistent history.
-- =========================================================================
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  agent_key   text not null,
  title       text,
  pinned      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.conversations is 'A persistent chat thread for one agent. Title is auto-derived from the first message.';

create index if not exists conversations_user_idx on public.conversations(user_id, updated_at desc);
create index if not exists conversations_agent_idx on public.conversations(user_id, agent_key, updated_at desc);

alter table public.conversations enable row level security;
drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

-- =========================================================================
-- messages — the turns. `parts` holds the AI SDK message parts (text + the
-- rich block markup the UI renders). `content` is a plain-text convenience.
-- =========================================================================
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null,           -- user | assistant | system | tool
  parts           jsonb,                   -- AI SDK parts / block markup
  content         text,                    -- plain-text mirror (titles, search)
  created_at      timestamptz not null default now()
);
comment on table public.messages is 'Turns in a conversation. parts = AI SDK parts incl. rich block markup; content = plain text.';

create index if not exists messages_conversation_idx on public.messages(conversation_id, created_at);

alter table public.messages enable row level security;
drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =========================================================================
-- knowledge_docs — queryable mirror of the ingested note frontmatter. The
-- routing index for the UI + onboarding status. Source of truth is the note
-- on disk; this is populated by ingestion / a sync step.
-- =========================================================================
create table if not exists public.knowledge_docs (
  id             uuid primary key default gen_random_uuid(),
  client         text not null,
  doc_type       text not null,
  title          text,
  authority      int,
  serves_agents  text[] not null default '{}',
  answers        text[] not null default '{}',
  summary        text,
  storage_path   text,
  status         text not null default 'ingested',  -- ingested | pending | error
  last_ingested  date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique(client, doc_type)
);
comment on table public.knowledge_docs is 'Routing index mirror of the ingested business-doc frontmatter (doc_type, answers, serves_agents).';

create index if not exists knowledge_docs_client_idx on public.knowledge_docs(client);

alter table public.knowledge_docs enable row level security;
drop policy if exists "knowledge readable" on public.knowledge_docs;
create policy "knowledge readable" on public.knowledge_docs for select using (true);
-- writes are service-role only (ingestion uses the admin client)

drop trigger if exists knowledge_docs_updated_at on public.knowledge_docs;
create trigger knowledge_docs_updated_at before update on public.knowledge_docs
  for each row execute function public.set_updated_at();

-- =========================================================================
-- onboarding — the KYC answers captured during first-run setup.
-- =========================================================================
create table if not exists public.onboarding (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  channels          text[] not null default '{}',   -- linkedin, x, youtube, instagram, tiktok…
  content_types     text[] not null default '{}',   -- reels, carousels, static, video…
  handles           jsonb,                           -- { linkedin: "...", x: "..." }
  reference_content text,                             -- pasted example content
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(user_id)
);
comment on table public.onboarding is 'First-run KYC: which channels, content types, handles, and reference content the user posts.';

alter table public.onboarding enable row level security;
drop policy if exists "own onboarding" on public.onboarding;
create policy "own onboarding" on public.onboarding
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists onboarding_updated_at on public.onboarding;
create trigger onboarding_updated_at before update on public.onboarding
  for each row execute function public.set_updated_at();
