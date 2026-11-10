-- Fix: "Database error saving new user" during signup.
-- Makes username availability checkable before signup (and matches the
-- original app's case-insensitive usernames).

-- 1) Public helper: is a username free? (safe to expose, same as the
--    original app where register revealed taken usernames)
create or replace function public.username_available(p_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select not exists (
        select 1 from public.profiles where lower(username) = lower(p_username)
    )
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- 2) Case-insensitive uniqueness (MySQL behaved this way for the original app)
create unique index if not exists profiles_username_ci_key
    on public.profiles (lower(username));
