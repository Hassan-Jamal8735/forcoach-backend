-- FORCOACH — full database schema for a FRESH self-hosted Supabase install.
--
-- This is the consolidated final state of all 8 migrations, flattened into one
-- file (no intermediate drops/recreates). Apply it once against a brand-new
-- database, after the Supabase stack is up and the `auth` schema exists.
--
--   docker cp schema.sql supabase-db:/tmp/schema.sql
--   docker exec -i supabase-db psql -U postgres -d postgres -f /tmp/schema.sql
--
-- Every table is scoped to auth.users(id) with row-level security, so one
-- coach can never read another coach's data even if the application layer has
-- a bug. The `(select auth.uid())` form is deliberate: it lets Postgres
-- evaluate the call once per query instead of once per row.

create extension if not exists "pgcrypto";

-- Shared trigger function that keeps updated_at honest.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- studios --
create table public.studios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  reference_id text,
  contact_person text,
  email text,
  phone text,
  address text,
  notes text,
  compensation_type text not null check (compensation_type in ('hourly', 'per_class')),
  compensation_value numeric(10,2) not null check (compensation_value >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.studios.metadata is 'Extensible bag for future studio fields without schema migrations.';

create index studios_user_id_idx on public.studios(user_id);
create index studios_user_id_status_idx on public.studios(user_id, status);

alter table public.studios enable row level security;

create policy "Users can view their own studios"
  on public.studios for select using ((select auth.uid()) = user_id);
create policy "Users can insert their own studios"
  on public.studios for insert with check ((select auth.uid()) = user_id);
create policy "Users can update their own studios"
  on public.studios for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own studios"
  on public.studios for delete using ((select auth.uid()) = user_id);

create trigger studios_set_updated_at
  before update on public.studios
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- ics_feeds --
create table public.ics_feeds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  name text not null,
  default_studio_id uuid references public.studios(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ics_feeds_user_id_idx on public.ics_feeds(user_id);
create index ics_feeds_default_studio_id_idx on public.ics_feeds(default_studio_id);

alter table public.ics_feeds enable row level security;

create policy "select own ics feeds" on public.ics_feeds
  for select using ((select auth.uid()) = user_id);
create policy "insert own ics feeds" on public.ics_feeds
  for insert with check ((select auth.uid()) = user_id);
create policy "update own ics feeds" on public.ics_feeds
  for update using ((select auth.uid()) = user_id);
create policy "delete own ics feeds" on public.ics_feeds
  for delete using ((select auth.uid()) = user_id);

create trigger ics_feeds_set_updated_at
  before update on public.ics_feeds
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------- events --
create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_id uuid references public.studios(id) on delete set null,
  ics_feed_id uuid references public.ics_feeds(id) on delete set null,
  title text not null,
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  source text not null check (source in ('google_calendar', 'csv', 'manual', 'ics')),
  external_id text,
  status text not null default 'unassigned' check (status in ('assigned', 'unassigned', 'excluded')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (end_time > start_time)
);

comment on column public.events.external_id is 'Source-provided identifier (e.g. Google Calendar event ID) used to detect duplicates on re-sync. Null for manual entries.';

create index events_user_id_start_time_idx on public.events(user_id, start_time);
create index events_user_id_status_idx on public.events(user_id, status);
create index events_studio_id_idx on public.events(studio_id);
create index events_ics_feed_id_idx on public.events(ics_feed_id);
create unique index events_dedup_idx on public.events(user_id, source, external_id) where external_id is not null;

alter table public.events enable row level security;

create policy "Users can view their own events"
  on public.events for select using ((select auth.uid()) = user_id);
create policy "Users can insert their own events"
  on public.events for insert with check ((select auth.uid()) = user_id);
create policy "Users can update their own events"
  on public.events for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own events"
  on public.events for delete using ((select auth.uid()) = user_id);

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- --------------------------------------------------- calendar_connections --
-- Per-user Google Calendar OAuth state. Service-role only in practice (tokens
-- never reach the browser), but RLS is still scoped as defense in depth.
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  google_account_email text,
  calendar_id text,
  calendar_name text,
  default_studio_id uuid references public.studios(id) on delete set null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index calendar_connections_user_provider_idx on public.calendar_connections(user_id, provider);
create index calendar_connections_default_studio_id_idx on public.calendar_connections(default_studio_id);

alter table public.calendar_connections enable row level security;

create policy "Users can view their own calendar connections"
  on public.calendar_connections for select using ((select auth.uid()) = user_id);
create policy "Users can insert their own calendar connections"
  on public.calendar_connections for insert with check ((select auth.uid()) = user_id);
create policy "Users can update their own calendar connections"
  on public.calendar_connections for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own calendar connections"
  on public.calendar_connections for delete using ((select auth.uid()) = user_id);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------- import_activity --
create table public.import_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('google_calendar', 'csv', 'ics')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  records_processed integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index import_activity_user_id_started_at_idx on public.import_activity(user_id, started_at desc);

alter table public.import_activity enable row level security;

create policy "Users can view their own import activity"
  on public.import_activity for select using ((select auth.uid()) = user_id);
create policy "Users can insert their own import activity"
  on public.import_activity for insert with check ((select auth.uid()) = user_id);
create policy "Users can update their own import activity"
  on public.import_activity for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --------------------------------------------------------------- invoices --
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  studio_id uuid references public.studios(id) on delete set null,
  studio_name text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  invoice_number text,
  issue_date timestamptz,
  due_date timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'generated', 'archived')),
  subtotal numeric not null default 0,
  vat_rate numeric,
  vat_amount numeric not null default 0,
  total numeric not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_period_valid check (period_end > period_start)
);

create unique index invoices_user_invoice_number_idx on public.invoices(user_id, invoice_number) where invoice_number is not null;
create index invoices_user_id_idx on public.invoices(user_id);
create index invoices_studio_id_idx on public.invoices(studio_id);
create index invoices_user_id_status_idx on public.invoices(user_id, status);

alter table public.invoices enable row level security;

create policy "select own invoices" on public.invoices
  for select using ((select auth.uid()) = user_id);
create policy "insert own invoices" on public.invoices
  for insert with check ((select auth.uid()) = user_id);
create policy "update own invoices" on public.invoices
  for update using ((select auth.uid()) = user_id);
create policy "delete own invoices" on public.invoices
  for delete using ((select auth.uid()) = user_id);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------- invoice_line_items --
-- Snapshotted at draft-creation time (not a live join) so a generated invoice
-- stays historically accurate even if the studio's name or rate changes later.
create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  title text not null,
  event_date timestamptz not null,
  hours numeric not null,
  rate numeric not null,
  compensation_type text not null check (compensation_type in ('hourly', 'per_class')),
  amount numeric not null,
  created_at timestamptz not null default now()
);

create index invoice_line_items_invoice_id_idx on public.invoice_line_items(invoice_id);
create index invoice_line_items_user_id_idx on public.invoice_line_items(user_id);
create index invoice_line_items_event_id_idx on public.invoice_line_items(event_id);

alter table public.invoice_line_items enable row level security;

-- No update policy: line items are immutable once written.
create policy "select own invoice line items" on public.invoice_line_items
  for select using ((select auth.uid()) = user_id);
create policy "insert own invoice line items" on public.invoice_line_items
  for insert with check ((select auth.uid()) = user_id);
create policy "delete own invoice line items" on public.invoice_line_items
  for delete using ((select auth.uid()) = user_id);
