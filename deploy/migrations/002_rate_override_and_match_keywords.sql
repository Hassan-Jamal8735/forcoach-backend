-- FORCOACH migration 002
--
-- Apply on the VPS with:
--   docker cp 002_rate_override_and_match_keywords.sql supabase-db:/tmp/m002.sql
--   docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f /tmp/m002.sql
--
-- Safe to re-run: every statement is guarded.

begin;

-- 1. Per-class rate override -----------------------------------------------
-- Null means "use the studio's rate". Replaces the studio's compensation_value
-- while keeping its compensation_type, so an hourly studio still multiplies by
-- duration and a per-class studio does not.
alter table public.events
  add column if not exists rate_override numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_rate_override_non_negative'
  ) then
    alter table public.events
      add constraint events_rate_override_non_negative
      check (rate_override is null or rate_override >= 0);
  end if;
end $$;

comment on column public.events.rate_override is
  'Overrides the studio compensation_value for this one class. Keeps the studio''s compensation_type. Null = use the studio rate.';

-- 2. Studio matching keywords ----------------------------------------------
-- Matched case-insensitively against an imported event's title and location to
-- pick a studio automatically. The studio name is always tried as well, so an
-- empty list still works for the common case.
alter table public.studios
  add column if not exists match_keywords text[] not null default '{}';

comment on column public.studios.match_keywords is
  'Extra keywords for auto-assigning imported classes to this studio. The studio name is always tried as well.';

commit;

-- Verify
select
  (select count(*) from information_schema.columns
     where table_name = 'events' and column_name = 'rate_override') as rate_override_added,
  (select count(*) from information_schema.columns
     where table_name = 'studios' and column_name = 'match_keywords') as match_keywords_added;
