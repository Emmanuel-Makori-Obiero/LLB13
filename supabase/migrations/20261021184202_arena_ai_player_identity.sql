-- AI opponents are stored in debate_ai_players, not auth.users. The initial
-- single-target foreign keys on second player, message author and winner made
-- the already-supported AI fallback fail at insert time. Replace those three
-- single-table FKs with security-definer guards that validate against either
-- identity table and ensure messages/winners belong to the room.

alter table public.debate_rooms
  drop constraint if exists debate_rooms_player_two_id_fkey,
  drop constraint if exists debate_rooms_winner_id_fkey;

alter table public.debate_messages
  drop constraint if exists debate_messages_user_id_fkey;

create or replace function public.guard_debate_room_player_identities()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.player_two_id is not null then
    if new.player_two_id = new.player_one_id then
      raise exception 'A debate room requires two different players';
    end if;
    if not exists (select 1 from auth.users u where u.id = new.player_two_id)
       and not exists (select 1 from public.debate_ai_players ai where ai.user_id = new.player_two_id) then
      raise exception 'Second player must be a registered student or configured AI player';
    end if;
  end if;

  if new.winner_id is not null
     and new.winner_id is distinct from new.player_one_id
     and new.winner_id is distinct from new.player_two_id then
    raise exception 'Winner must be a participant in this debate room';
  end if;
  return new;
end;
$$;

create or replace function public.guard_debate_message_player_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if not exists (
    select 1
    from public.debate_rooms r
    where r.id = new.room_id
      and (r.player_one_id = new.user_id or r.player_two_id = new.user_id)
  ) then
    raise exception 'Debate message author must be a participant in that room';
  end if;
  return new;
end;
$$;

-- Keep the former ON DELETE SET NULL / CASCADE behavior for real accounts.
-- Player-one deletion still cascades the room through its retained auth FK.
create or replace function public.cleanup_debate_user_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  update public.debate_rooms
     set player_two_id = case when player_two_id = old.id then null else player_two_id end,
         winner_id = case when winner_id = old.id then null else winner_id end
   where player_two_id = old.id or winner_id = old.id;
  delete from public.debate_messages where user_id = old.id;
  return old;
end;
$$;

drop trigger if exists debate_rooms_player_identity_guard on public.debate_rooms;
create trigger debate_rooms_player_identity_guard
before insert or update on public.debate_rooms
for each row execute function public.guard_debate_room_player_identities();

drop trigger if exists debate_messages_player_identity_guard on public.debate_messages;
create trigger debate_messages_player_identity_guard
before insert or update on public.debate_messages
for each row execute function public.guard_debate_message_player_identity();

drop trigger if exists debate_auth_user_identity_cleanup on auth.users;
create trigger debate_auth_user_identity_cleanup
after delete on auth.users
for each row execute function public.cleanup_debate_user_identity();

revoke all on function public.guard_debate_room_player_identities() from public, anon, authenticated;
revoke all on function public.guard_debate_message_player_identity() from public, anon, authenticated;
revoke all on function public.cleanup_debate_user_identity() from public, anon, authenticated;
