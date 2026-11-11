-- ============================================================
-- Activity Board - Supabase schema
-- Run this ONCE in the Supabase SQL Editor (Dashboard -> SQL)
-- ============================================================

-- ---------- Profiles (mirrors legacy `users`) ----------
create table if not exists public.profiles (
    id          uuid primary key references auth.users (id) on delete cascade,
    username    text not null check (char_length(username) between 3 and 30),
    avatar_url  text,
    is_admin    boolean not null default false,
    last_seen   timestamptz,
    created_at timestamptz not null default now(),
    constraint profiles_username_key unique (username),
    constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,30}$')
);

-- First ever user becomes the admin, everyone else a normal member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, username, is_admin)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'username', 'user_' || substr(new.id::text, 1, 8)),
        (select count(*) = 0 from public.profiles)
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------- Boards ----------
create table if not exists public.boards (
    id         uuid primary key default gen_random_uuid(),
    owner_id   uuid not null references public.profiles (id) on delete cascade,
    title      text not null check (char_length(title) between 1 and 100),
    created_at timestamptz not null default now()
);

create table if not exists public.board_members (
    board_id   uuid not null references public.boards (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    role       text not null default 'member' check (role in ('owner', 'manager', 'member')),
    created_at timestamptz not null default now(),
    primary key (board_id, user_id)
);

-- ---------- Lists ----------
create table if not exists public.lists (
    id         uuid primary key default gen_random_uuid(),
    board_id   uuid not null references public.boards (id) on delete cascade,
    title      text not null check (char_length(title) between 1 and 100),
    color      text not null default '#ffffff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
    position   integer not null default 0,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);
create index if not exists lists_board_pos_idx on public.lists (board_id, position);

-- ---------- Cards ----------
create table if not exists public.cards (
    id          uuid primary key default gen_random_uuid(),
    list_id     uuid not null references public.lists (id) on delete cascade,
    title       text not null check (char_length(title) between 1 and 200),
    description text not null default '' check (char_length(description) <= 5000),
    link_url    text check (link_url is null or char_length(link_url) <= 2000),
    created_by  uuid references public.profiles (id) on delete set null,
    due_date    date,
    due_time    time,
    priority    text not null default 'none' check (priority in ('none', 'low', 'medium', 'high')),
    position    integer not null default 0,
    created_at  timestamptz not null default now()
);
create index if not exists cards_list_pos_idx on public.cards (list_id, position);

-- ---------- Card assignees ----------
create table if not exists public.card_assignees (
    card_id    uuid not null references public.cards (id) on delete cascade,
    user_id    uuid not null references public.profiles (id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (card_id, user_id)
);

-- ---------- Card attachments (files live in the private "attachments" bucket) ----------
create table if not exists public.card_attachments (
    id            uuid primary key default gen_random_uuid(),
    card_id       uuid not null references public.cards (id) on delete cascade,
    uploaded_by   uuid references public.profiles (id) on delete set null,
    storage_path  text not null,
    original_name text not null,
    mime_type     text,
    size_bytes    bigint not null default 0,
    created_at    timestamptz not null default now()
);
create index if not exists card_attachments_card_idx on public.card_attachments (card_id);

-- ============================================================
-- Helper functions (SECURITY DEFINER so RLS policies can use them)
-- ============================================================

create or replace function public.board_role(p_board uuid)
returns text
language sql
security definer
set search_path = public
as $$
    select role from public.board_members
    where board_id = p_board and user_id = auth.uid()
$$;

create or replace function public.is_board_member(p_board uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.board_members
        where board_id = p_board and user_id = auth.uid()
    )
$$;

-- Cards belong to lists which belong to boards.
create or replace function public.card_board(p_card uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
    select l.board_id from public.cards c
    join public.lists l on l.id = c.list_id
    where c.id = p_card
$$;

-- Only the creator of a card, or a board owner/manager with granted power,
-- may edit it.
create or replace function public.can_edit_card(p_card uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.cards c
        where c.id = p_card
          and (
              c.created_by = auth.uid()
              or public.board_role(public.card_board(p_card)) in ('owner', 'manager')
          )
    )
$$;

-- Atomic board creation (board + owner membership in one call).
create or replace function public.create_board(p_title text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    new_id uuid;
begin
    if auth.uid() is null then
        raise exception 'Not authenticated';
    end if;
    if p_title is null or char_length(btrim(p_title)) not between 1 and 100 then
        raise exception 'Board title must be 1-100 characters';
    end if;

    insert into public.boards (owner_id, title)
    values (auth.uid(), btrim(p_title))
    returning id into new_id;

    insert into public.board_members (board_id, user_id, role)
    values (new_id, auth.uid(), 'owner');

    return new_id;
end;
$$;

-- Presence heartbeat (called by the client every ~15s).
create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
    update public.profiles set last_seen = now() where id = auth.uid()
$$;

-- Admin-only storage/database stats for the admin monitor page.
create or replace function public.admin_storage_stats()
returns json
language plpgsql
security definer
set search_path = public, storage
as $$
begin
    if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
        raise exception 'Forbidden';
    end if;

    return json_build_object(
        'tables', (
            select coalesce(json_agg(t), '[]'::json) from (
                select c.relname as table_name,
                       greatest(c.reltuples::bigint, 0) as row_estimate,
                       pg_total_relation_size(c.oid) as total_bytes,
                       pg_relation_size(c.oid) as data_bytes,
                       pg_total_relation_size(c.oid) - pg_relation_size(c.oid) as index_bytes
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                order by pg_total_relation_size(c.oid) desc
            ) t
        ),
        'buckets', (
            select coalesce(json_agg(b), '[]'::json) from (
                select bk.name as bucket,
                       count(o.id) as object_count,
                       coalesce(sum((o.metadata ->> 'size')::bigint), 0) as bytes
                from storage.buckets bk
                left join storage.objects o on o.bucket_id = bk.id
                group by bk.name
                order by bk.name
            ) b
        ),
        'db_total_bytes', pg_database_size(current_database())
    );
end;
$$;

grant execute on function public.create_board(text) to authenticated;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.admin_storage_stats() to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;

-- Username availability pre-check for signup (anon can call it).
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

-- Usernames are unique case-insensitively (matches the original MySQL app).
create unique index if not exists profiles_username_ci_key
    on public.profiles (lower(username));

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles         enable row level security;
alter table public.boards           enable row level security;
alter table public.board_members    enable row level security;
alter table public.lists            enable row level security;
alter table public.cards            enable row level security;
alter table public.card_assignees   enable row level security;
alter table public.card_attachments enable row level security;

-- profiles: everyone logged in can read usernames/avatars (needed for sharing
-- by username and rendering avatars). Users can only edit their own row.
create policy "profiles read" on public.profiles
    for select to authenticated using (true);

create policy "profiles update own" on public.profiles
    for update to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

-- boards
create policy "boards read member" on public.boards
    for select to authenticated using (public.is_board_member(id));

create policy "boards insert own" on public.boards
    for insert to authenticated with check (owner_id = auth.uid());

create policy "boards update manage" on public.boards
    for update to authenticated
    using (public.board_role(id) in ('owner', 'manager'))
    with check (public.board_role(id) in ('owner', 'manager'));

create policy "boards delete owner" on public.boards
    for delete to authenticated using (public.board_role(id) = 'owner');

-- board_members: read if you are on the board; owner/manager can add people;
-- removal rules mirror the PHP app (managers cannot remove managers).
create policy "members read" on public.board_members
    for select to authenticated using (public.is_board_member(board_id));

create policy "members insert manage" on public.board_members
    for insert to authenticated
    with check (public.board_role(board_id) in ('owner', 'manager'));

create policy "members delete manage" on public.board_members
    for delete to authenticated
    using (
        role <> 'owner'
        and (
            public.board_role(board_id) = 'owner'
            or (public.board_role(board_id) = 'manager' and role = 'member')
        )
    );

create policy "members role owner" on public.board_members
    for update to authenticated
    using (public.board_role(board_id) = 'owner')
    with check (public.board_role(board_id) = 'owner' and role in ('manager', 'member'));

-- lists
create policy "lists read member" on public.lists
    for select to authenticated using (public.is_board_member(board_id));

create policy "lists insert member" on public.lists
    for insert to authenticated
    with check (public.is_board_member(board_id) and created_by = auth.uid());

-- Only the list creator, or a board owner/manager, may edit a list.
create policy "lists update creator or manage" on public.lists
    for update to authenticated
    using (
        public.is_board_member(board_id)
        and (created_by = auth.uid() or public.board_role(board_id) in ('owner', 'manager'))
    )
    with check (
        public.is_board_member(board_id)
        and (created_by = auth.uid() or public.board_role(board_id) in ('owner', 'manager'))
    );

-- Lists can only be deleted while empty (matches PHP behavior).
create policy "lists delete empty" on public.lists
    for delete to authenticated
    using (
        public.is_board_member(board_id)
        and (created_by = auth.uid() or public.board_role(board_id) in ('owner', 'manager'))
        and not exists (select 1 from public.cards c where c.list_id = lists.id)
    );

-- cards
create policy "cards read member" on public.cards
    for select to authenticated
    using (public.is_board_member((select board_id from public.lists l where l.id = cards.list_id)));

create policy "cards insert member" on public.cards
    for insert to authenticated
    with check (
        created_by = auth.uid()
        and public.is_board_member((select board_id from public.lists l where l.id = list_id))
    );

-- Members may reorder cards (position only), but content edits are guarded by
-- the cards_guard_edit trigger below.
create policy "cards update member" on public.cards
    for update to authenticated
    using (public.is_board_member((select board_id from public.lists l where l.id = cards.list_id)))
    with check (public.is_board_member((select board_id from public.lists l where l.id = list_id)));

-- Only the card creator, or a board owner/manager with granted power, may
-- change a card's content. Position-only reordering stays open to members.
create or replace function public.guard_card_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if (
        new.title       is distinct from old.title
        or new.description is distinct from old.description
        or new.link_url    is distinct from old.link_url
        or new.due_date    is distinct from old.due_date
        or new.due_time    is distinct from old.due_time
        or new.priority    is distinct from old.priority
        or new.created_by  is distinct from old.created_by
        or new.list_id     is distinct from old.list_id
    ) and not public.can_edit_card(old.id) then
        raise exception 'Only the card creator or a board manager can edit this card';
    end if;
    return new;
end;
$$;

drop trigger if exists cards_guard_edit on public.cards;
create trigger cards_guard_edit
    before update on public.cards
    for each row execute function public.guard_card_edit();

-- Creator or manager/owner may delete a card.
create policy "cards delete creator or manage" on public.cards
    for delete to authenticated
    using (
        public.is_board_member(public.card_board(id))
        and (created_by = auth.uid() or public.board_role(public.card_board(id)) in ('owner', 'manager'))
    );

-- card_assignees
create policy "assignees read member" on public.card_assignees
    for select to authenticated
    using (public.is_board_member(public.card_board(card_id)));

create policy "assignees insert member" on public.card_assignees
    for insert to authenticated
    with check (public.can_edit_card(card_id));

create policy "assignees delete member" on public.card_assignees
    for delete to authenticated
    using (public.can_edit_card(card_id));

-- card_attachments
create policy "attachments read member" on public.card_attachments
    for select to authenticated
    using (public.is_board_member(public.card_board(card_id)));

create policy "attachments insert member" on public.card_attachments
    for insert to authenticated
    with check (
        uploaded_by = auth.uid()
        and public.can_edit_card(card_id)
    );

create policy "attachments delete uploader or manage" on public.card_attachments
    for delete to authenticated
    using (public.can_edit_card(card_id));

-- ============================================================
-- Storage buckets (avatars = public, attachments = private)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

update storage.buckets
   set file_size_limit = 2097152,            -- 2 MB (legacy AVATAR_MAX_BYTES)
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
 where id = 'avatars';

update storage.buckets
   set file_size_limit = 26214400            -- 25 MB (legacy ATTACHMENT_MAX_BYTES)
 where id = 'attachments';

-- Users manage objects inside their own avatars/<uid>/ folder.
create policy "avatars read" on storage.objects
    for select using (bucket_id = 'avatars');

create policy "avatars write own folder" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text));

create policy "avatars update own folder" on storage.objects
    for update to authenticated
    using (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text))
    with check (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text));

create policy "avatars delete own folder" on storage.objects
    for delete to authenticated
    using (bucket_id = 'avatars' and (split_part(name, '/', 1) = auth.uid()::text));

-- Attachment paths look like:  <board_id>/<card_id>/<random>.<ext>
create or replace function public.attachment_board(p_path text)
returns uuid
language plpgsql
immutable
as $$
declare
    seg text := split_part(p_path, '/', 1);
begin
    return seg::uuid;
exception when invalid_text_representation then
    return null;
end;
$$;

create policy "attachments read member" on storage.objects
    for select to authenticated
    using (bucket_id = 'attachments' and public.is_board_member(public.attachment_board(name)));

create policy "attachments write member" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'attachments' and public.is_board_member(public.attachment_board(name)));

create policy "attachments delete member" on storage.objects
    for delete to authenticated
    using (bucket_id = 'attachments' and public.is_board_member(public.attachment_board(name)));

-- ============================================================
-- Realtime (live sync between users)
-- ============================================================
do $$
begin
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        alter publication supabase_realtime add table public.profiles;
        alter publication supabase_realtime add table public.boards;
        alter publication supabase_realtime add table public.board_members;
        alter publication supabase_realtime add table public.lists;
        alter publication supabase_realtime add table public.cards;
        alter publication supabase_realtime add table public.card_assignees;
        alter publication supabase_realtime add table public.card_attachments;
    end if;
exception when duplicate_object then
    null; -- already in the publication
end $$;

-- ============================================================
-- Promote a user to admin manually (uncomment and edit):
-- update public.profiles set is_admin = true where username = 'your_username';
-- ============================================================
