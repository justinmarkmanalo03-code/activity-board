-- ============================================================
-- Migration: card links + creator-only editing
-- Run ONCE in the Supabase SQL Editor on an existing database.
-- (Fresh installs already get these from schema.sql.)
-- ============================================================

-- ---------- New columns ----------
alter table public.cards
    add column if not exists link_url text
        check (link_url is null or char_length(link_url) <= 2000);

alter table public.lists
    add column if not exists created_by uuid
        references public.profiles (id) on delete set null;

-- Existing lists were created before ownership tracking; attribute them to
-- the board owner so they remain editable by someone.
update public.lists l
   set created_by = b.owner_id
  from public.boards b
 where l.board_id = b.id
   and l.created_by is null;

-- ---------- Helper: who may edit a card ----------
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

-- ---------- Lists: only creator or owner/manager ----------
drop policy if exists "lists update member" on public.lists;
drop policy if exists "lists update creator or manage" on public.lists;
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

drop policy if exists "lists insert member" on public.lists;
create policy "lists insert member" on public.lists
    for insert to authenticated
    with check (public.is_board_member(board_id) and created_by = auth.uid());

drop policy if exists "lists delete empty" on public.lists;
create policy "lists delete empty" on public.lists
    for delete to authenticated
    using (
        public.is_board_member(board_id)
        and (created_by = auth.uid() or public.board_role(board_id) in ('owner', 'manager'))
        and not exists (select 1 from public.cards c where c.list_id = lists.id)
    );

-- ---------- Cards: content edits are creator/manager only ----------
-- Position-only reordering must stay available to members, so the RLS policy
-- stays member-level and a trigger guards the content columns.
drop policy if exists "cards update creator or manage" on public.cards;
drop policy if exists "cards update member" on public.cards;
create policy "cards update member" on public.cards
    for update to authenticated
    using (public.is_board_member((select board_id from public.lists l where l.id = cards.list_id)))
    with check (public.is_board_member((select board_id from public.lists l where l.id = list_id)));

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

-- ---------- Card assignees: follow the card edit permission ----------
drop policy if exists "assignees insert member" on public.card_assignees;
create policy "assignees insert member" on public.card_assignees
    for insert to authenticated
    with check (public.can_edit_card(card_id));

drop policy if exists "assignees delete member" on public.card_assignees;
create policy "assignees delete member" on public.card_assignees
    for delete to authenticated
    using (public.can_edit_card(card_id));

-- ---------- Card attachments: follow the card edit permission ----------
drop policy if exists "attachments insert member" on public.card_attachments;
create policy "attachments insert member" on public.card_attachments
    for insert to authenticated
    with check (uploaded_by = auth.uid() and public.can_edit_card(card_id));

drop policy if exists "attachments delete uploader or manage" on public.card_attachments;
create policy "attachments delete uploader or manage" on public.card_attachments
    for delete to authenticated
    using (public.can_edit_card(card_id));
