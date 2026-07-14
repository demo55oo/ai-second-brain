-- Second Brain — Brand Kits (the founder's visual identity for generated assets)
-- ---------------------------------------------------------------------------
-- WHY: carousels/content must look like the FOUNDER's brand, not generic AI. A
-- brand kit holds the locked visual style (the carousel "style spec"), accent
-- colour, header text, and the founder's face/logo assets so the image model
-- (gpt-image-2 edits) can place their likeness and match the brand on every
-- slide. The settings UI (later) edits this; for now it's seeded per client.
--
-- Run AFTER 0008_content_guides.sql.
-- ---------------------------------------------------------------------------

create table if not exists public.brand_kits (
  id           uuid primary key default gen_random_uuid(),
  client       text not null unique,
  display_name text,                          -- header name, e.g. "Daniel Paul"
  handle       text,
  tagline      text,                          -- header subtitle line
  accent_hex   text default '#ED1846',        -- the one brand accent colour
  style_spec   text not null default '',      -- the FULL locked visual style block (drives image prompts)
  face_path    text,                          -- disk path to the face shot (server reads bytes)
  face_url     text,                          -- optional uploaded URL (settings UI)
  logo_path    text,
  logo_url     text,
  fonts        text,                          -- typography direction
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.brand_kits is 'Per-client visual identity: locked style spec + accent + face/logo assets for on-brand generated visuals.';
comment on column public.brand_kits.style_spec is 'The full locked carousel/visual style block injected into image prompts.';

-- Permissive RLS (matches vault/content_guides); service-role for writes.
alter table public.brand_kits enable row level security;
drop policy if exists "brand_kits readable" on public.brand_kits;
create policy "brand_kits readable" on public.brand_kits for select using (true);
drop policy if exists "brand_kits writable" on public.brand_kits;
create policy "brand_kits writable" on public.brand_kits for all using (true) with check (true);

drop trigger if exists brand_kits_updated_at on public.brand_kits;
create trigger brand_kits_updated_at before update on public.brand_kits
  for each row execute function public.set_updated_at();
