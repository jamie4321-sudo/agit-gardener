-- 아지트 가드너 · v8: 휴대폰 알림 (Web Push · 안드로이드 크롬 / 아이폰 홈 화면 앱)
-- v7.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
-- ※ 열쇠(VAPID·비밀값)는 v8_keys.sql 에 따로 있어요 (공개 저장소에 올리지 않음). 이 파일 다음에 그것도 Run.
--   보내는 길 : 트리거 → pg_net → https://agit-gardener.pages.dev/api/push (Cloudflare Pages Functions) → 각 휴대폰
--   알림 종류 : 새 현장 이슈(올린 사람 빼고 모두) · 조치 완료(올린 사람) · 댓글·칭찬 스티커(올린 사람·조치한 사람)

create extension if not exists pg_net with schema extensions;

-- 1. 기기별 구독 (한 기기 = 지금 로그인한 한 사람)
create table if not exists ag_push_subs (
  endpoint text primary key,
  member_id uuid not null references ag_members(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  ua text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ag_push_subs_member on ag_push_subs(member_id);
alter table ag_push_subs enable row level security;

-- 2. 열쇠 (한 줄만) — 값은 v8_keys.sql 에서 넣어요
create table if not exists ag_push_config (
  id int primary key default 1 check (id = 1),
  pub text not null,
  priv text not null,
  secret text not null,
  fn_url text not null default 'https://agit-gardener.pages.dev/api/push'
);
alter table ag_push_config enable row level security;
revoke all on ag_push_subs, ag_push_config from anon, authenticated;

-- 3. 화면에서 부르는 함수
create or replace function ag_push_key() returns text
language sql security definer set search_path = public, extensions as $$ select pub from ag_push_config where id = 1 $$;

create or replace function ag_push_subscribe(p_token text, p_endpoint text, p_p256dh text, p_auth text, p_ua text default '') returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'BAD_ENDPOINT'; end if;
  insert into ag_push_subs(endpoint, member_id, p256dh, auth, ua) values (p_endpoint, m.id, p_p256dh, p_auth, left(coalesce(p_ua, ''), 200))
    on conflict (endpoint) do update set member_id = excluded.member_id, p256dh = excluded.p256dh, auth = excluded.auth, ua = excluded.ua, created_at = now();
end $$;

create or replace function ag_push_unsubscribe(p_token text, p_endpoint text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__me(p_token);
  delete from ag_push_subs where endpoint = p_endpoint;
end $$;

-- 알림 보내는 곳 (Pages Function)이 지운 기기를 알려 줄 때
create or replace function ag_push_prune(p_secret text, p_endpoints text[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from ag_push_config where id = 1 and secret = p_secret) then raise exception 'FORBIDDEN'; end if;
  delete from ag_push_subs where endpoint = any(p_endpoints);
end $$;

-- 4. 보내기 (안에서만 씀). 실패해도 원래 저장은 그대로 돼요.
create or replace function ag__push(p_members uuid[], p_msg jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare c ag_push_config; v_subs jsonb;
begin
  select * into c from ag_push_config where id = 1;
  if c is null then return; end if;
  select jsonb_agg(jsonb_build_object('endpoint', endpoint, 'p256dh', p256dh, 'auth', auth)) into v_subs
    from ag_push_subs where member_id = any(p_members);
  if v_subs is null then return; end if;
  perform net.http_post(url := c.fn_url,
    body := jsonb_build_object('vapid', jsonb_build_object('pub', c.pub, 'priv', c.priv), 'secret', c.secret, 'subs', v_subs, 'msg', p_msg),
    headers := '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds := 8000);
exception when others then
  raise warning 'ag__push: %', sqlerrm;
end $$;

create or replace function ag__issue_where(i ag_issues) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when i.zone is not null and i.place <> '' then coalesce((select label from ag_zones where code = i.zone), i.zone) || ' · ' || i.place
              when i.place <> '' then i.place
              when i.zone is not null then coalesce((select label from ag_zones where code = i.zone), i.zone)
              else '현장' end
$$;
create or replace function ag__name(p_id uuid) returns text
language sql stable security definer set search_path = public, extensions as $$ select coalesce((select name from ag_members where id = p_id), '누군가') $$;

-- 시험 알림 (내 기기들로)
create or replace function ag_push_test(p_token text) returns int
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; n int;
begin
  m := ag__me(p_token);
  select count(*) into n from ag_push_subs where member_id = m.id;
  perform ag__push(array[m.id], jsonb_build_object('title', '아지트 가드너', 'body', m.name || '님, 알림이 잘 와요 🌱', 'tag', 'test', 'url', ''));
  return n;
end $$;

-- 5. 트리거
create or replace function ag__push_issue() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare v_to uuid[]; v_url text := '?issue=' || new.id || '&day=' || coalesce(new.day::text, '');
begin
  if tg_op = 'INSERT' then
    select array_agg(id) into v_to from ag_members where active and id is distinct from new.created_by;
    perform ag__push(v_to, jsonb_build_object('title', '새 현장 이슈 · ' || ag__issue_where(new),
      'body', ag__name(new.created_by) || '님이 올렸어요' || case when new.memo <> '' then E'\n' || left(new.memo, 80) else '' end,
      'tag', 'issue-' || new.id, 'url', v_url));
  elsif old.done_at is null and new.done_at is not null and new.created_by is distinct from new.done_by and new.created_by is not null then
    perform ag__push(array[new.created_by], jsonb_build_object('title', '조치 완료 · ' || ag__issue_where(new),
      'body', ag__name(new.done_by) || '님이 조치했어요' || case when new.done_note <> '' then E'\n' || left(new.done_note, 80) else '' end,
      'tag', 'issue-' || new.id, 'url', v_url));
  end if;
  return null;
end $$;
drop trigger if exists ag_push_issue on ag_issues;
create trigger ag_push_issue after insert or update of done_at on ag_issues for each row execute function ag__push_issue();

create or replace function ag__push_talk() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare i ag_issues; v_by uuid; v_to uuid[]; v_title text; v_body text;
begin
  select * into i from ag_issues where id = new.issue_id;
  if i is null then return null; end if;
  if tg_table_name = 'ag_issue_comments' then
    v_by := new.created_by; v_title := '새 댓글 · ' || ag__issue_where(i); v_body := ag__name(v_by) || ': ' || left(new.body, 100);
  else
    v_by := new.member_id; v_title := '칭찬 스티커 · ' || ag__issue_where(i);
    v_body := ag__name(v_by) || '님이 ' || case new.kind when 'thanks' then '‘고마워요’를 남겼어요 🌱' when 'best' then '‘최고예요’를 남겼어요 👏'
                                                  when 'clean' then '‘깔끔해요’를 남겼어요 ✨' else '하트를 눌렀어요 ♥' end;
  end if;
  select array_agg(distinct x) into v_to from unnest(array[i.created_by, i.done_by]) x where x is not null and x is distinct from v_by;
  if v_to is not null then
    perform ag__push(v_to, jsonb_build_object('title', v_title, 'body', v_body, 'tag', 'issue-' || i.id, 'url', '?issue=' || i.id || '&day=' || coalesce(i.day::text, '')));
  end if;
  return null;
end $$;
drop trigger if exists ag_push_comment on ag_issue_comments;
create trigger ag_push_comment after insert on ag_issue_comments for each row execute function ag__push_talk();
drop trigger if exists ag_push_heart on ag_issue_hearts;
create trigger ag_push_heart after insert on ag_issue_hearts for each row execute function ag__push_talk();

revoke execute on function ag__push(uuid[], jsonb), ag__issue_where(ag_issues), ag__name(uuid), ag__push_issue(), ag__push_talk() from public, anon, authenticated;
grant execute on function ag_push_key(), ag_push_subscribe(text, text, text, text, text), ag_push_unsubscribe(text, text),
  ag_push_prune(text, text[]), ag_push_test(text) to anon, authenticated;

notify pgrst, 'reload schema';
