-- 아지트 가드너 · Supabase 스키마 (SIGN 프로젝트 공용, 접두어 ag_)
-- SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
--
-- 보안 방식: 표(table)는 RLS 를 켜고 정책을 하나도 두지 않아 공개 키로는 직접 읽기/쓰기가 막혀요.
-- 화면은 아래 ag_* 함수(RPC)만 부르고, 함수가 로그인 토큰(비밀번호 4자리로 받은 것)과 역할을 확인해요.

create extension if not exists pgcrypto with schema extensions;

-- ── 표 ──
create table if not exists ag_members(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'crew' check (role in ('manager','crew')),
  pin_hash text not null,
  sort int not null default 0,
  active boolean not null default true,
  fails int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists ag_sessions(
  token text primary key,
  member_id uuid not null references ag_members(id) on delete cascade,
  expires_at timestamptz not null
);
create table if not exists ag_zones(
  code text primary key,
  label text not null,
  sort int not null default 0,
  active boolean not null default true
);
-- 배정은 '그 날짜부터' 적용. 다음에 바꿀 때까지 그대로 이어져요.
create table if not exists ag_assign(
  day date not null,
  member_id uuid not null references ag_members(id) on delete cascade,
  zones text[] not null default '{}',
  note text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(day, member_id)
);
create table if not exists ag_done(
  day date not null,
  zone text not null,
  member_id uuid references ag_members(id) on delete set null,
  done_at timestamptz not null default now(),
  primary key(day, zone)
);

alter table ag_members enable row level security;
alter table ag_sessions enable row level security;
alter table ag_zones enable row level security;
alter table ag_assign enable row level security;
alter table ag_done enable row level security;
revoke all on ag_members, ag_sessions, ag_zones, ag_assign, ag_done from anon, authenticated;

-- ── 기본 데이터 ──
insert into ag_zones(code,label,sort) values
  ('B1','지하 1층 춘식도락',0),('1F','1층 공용',1),('2F','2층 아지뜰',2),('3F','3층 공용',3),('4F','4층 공용',4),
  ('5A','5층 A',5),('5B','5층 B',6),('6A','6층 A',7),('6B','6층 B',8),('7A','7층 A',9),('7B','7층 B',10),
  ('8A','8층 A',11),('9A','9층 A',12),('9B','9층 B',13),('10A','10층 A',14),('11A','11층 A',15),
  ('12A','12층 A',16),('13A','13층 A',17),('14A','14층 A',18),('15A','15층 A',19)
on conflict (code) do nothing;

-- 처음 한 번만: 매니저 1명 + 크루 4명. 이름·비밀번호는 매니저 화면 '크루 관리'에서 바꿔요.
do $$ begin
  if not exists (select 1 from ag_members) then
    insert into ag_members(name,role,pin_hash,sort) values
      ('매니저','manager',extensions.crypt('0427',extensions.gen_salt('bf')),0),
      ('가드너 1','crew',extensions.crypt('1111',extensions.gen_salt('bf')),1),
      ('가드너 2','crew',extensions.crypt('2222',extensions.gen_salt('bf')),2),
      ('가드너 3','crew',extensions.crypt('3333',extensions.gen_salt('bf')),3),
      ('가드너 4','crew',extensions.crypt('4444',extensions.gen_salt('bf')),4);
  end if;
end $$;

-- ── 내부 도우미 (공개 호출 불가) ──
create or replace function ag__me(p_token text) returns ag_members
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  select a.* into m from ag_sessions s join ag_members a on a.id = s.member_id
   where s.token = p_token and s.expires_at > now() and a.active;
  if not found then raise exception 'AUTH' using errcode = '28000'; end if;
  return m;
end $$;

create or replace function ag__manager(p_token text) returns ag_members
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role <> 'manager' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function ag__today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- 그 날짜에 실제로 적용되는 배정 (날짜가 같거나 이전인 것 중 가장 최근)
create or replace function ag__effective(p_day date)
returns table(member_id uuid, day date, zones text[], note text)
language sql stable security definer set search_path = public as $$
  select distinct on (a.member_id) a.member_id, a.day, a.zones, a.note
    from ag_assign a join ag_members m on m.id = a.member_id and m.active
   where a.day <= p_day
   order by a.member_id, a.day desc
$$;

revoke execute on function ag__me(text), ag__manager(text), ag__effective(date) from public, anon, authenticated;

-- ── 화면에서 부르는 함수 ──

-- 로그인 화면의 이름 목록 (이름·역할만)
create or replace function ag_roster() returns table(id uuid, name text, role text)
language sql stable security definer set search_path = public as $$
  select id, name, role from ag_members where active order by sort, created_at
$$;

-- 비밀번호 4자리 확인 → 토큰. 5번 틀리면 5분 잠금.
create or replace function ag_login(p_id uuid, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; t text;
begin
  select * into m from ag_members where id = p_id and active for update;
  if not found then return json_build_object('ok', false, 'err', 'none'); end if;
  if m.locked_until is not null and m.locked_until > now() then
    return json_build_object('ok', false, 'err', 'locked', 'wait', ceil(extract(epoch from m.locked_until - now())));
  end if;
  if m.pin_hash <> crypt(coalesce(p_pin, ''), m.pin_hash) then
    update ag_members
       set fails = case when fails + 1 >= 5 then 0 else fails + 1 end,
           locked_until = case when fails + 1 >= 5 then now() + interval '5 minutes' else null end
     where id = m.id;
    if m.fails + 1 >= 5 then return json_build_object('ok', false, 'err', 'locked', 'wait', 300); end if;
    return json_build_object('ok', false, 'err', 'pin', 'left', 4 - m.fails);
  end if;
  update ag_members set fails = 0, locked_until = null where id = m.id;
  delete from ag_sessions where expires_at < now();
  t := encode(gen_random_bytes(24), 'hex');
  insert into ag_sessions(token, member_id, expires_at) values (t, m.id, now() + interval '180 days');
  return json_build_object('ok', true, 'token', t, 'me', json_build_object('id', m.id, 'name', m.name, 'role', m.role));
end $$;

create or replace function ag_logout(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from ag_sessions where token = p_token
$$;

-- 하루치 화면 데이터 한 번에
create or replace function ag_board(p_token text, p_day date) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  return json_build_object(
    'me', json_build_object('id', m.id, 'name', m.name, 'role', m.role),
    'today', ag__today(),
    'members', (select coalesce(json_agg(json_build_object('id', id, 'name', name, 'role', role, 'sort', sort) order by sort, created_at), '[]'::json)
                  from ag_members where active),
    'zones', (select coalesce(json_agg(json_build_object('code', code, 'label', label) order by sort), '[]'::json)
                from ag_zones where active),
    'assign', (select coalesce(json_agg(json_build_object('member', e.member_id, 'day', e.day, 'zones', e.zones, 'note', e.note)), '[]'::json)
                 from ag__effective(p_day) e),
    'done', (select coalesce(json_agg(json_build_object('zone', zone, 'member', member_id, 'at', done_at)), '[]'::json)
               from ag_done where day = p_day)
  );
end $$;

-- 매니저: 업무 배정 (그 날짜부터 적용)
create or replace function ag_assign_set(p_token text, p_day date, p_member uuid, p_zones text[], p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__manager(p_token);
  insert into ag_assign(day, member_id, zones, note, updated_at, updated_by)
  values (p_day, p_member,
          array(select z from unnest(coalesce(p_zones, '{}')) z where z in (select code from ag_zones)),
          left(coalesce(p_note, ''), 500), now(), m.id)
  on conflict (day, member_id) do update
    set zones = excluded.zones, note = excluded.note, updated_at = now(), updated_by = m.id;
end $$;

-- 크루: '다 했어요' (자기 층·오늘만). 매니저는 아무 날·아무 층.
create or replace function ag_done_set(p_token text, p_day date, p_zone text, p_done boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role <> 'manager' then
    if p_day <> ag__today() then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    if not exists (select 1 from ag__effective(p_day) e where e.member_id = m.id and p_zone = any(e.zones)) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  if p_done then
    insert into ag_done(day, zone, member_id) values (p_day, p_zone, m.id)
    on conflict (day, zone) do update set member_id = excluded.member_id, done_at = now();
  else
    delete from ag_done where day = p_day and zone = p_zone;
  end if;
end $$;

-- 매니저: 크루 추가/수정 (p_id 가 null 이면 추가). 비밀번호는 바꿀 때만 4자리 숫자.
create or replace function ag_member_save(p_token text, p_id uuid, p_name text, p_role text, p_pin text, p_sort int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
begin
  m := ag__manager(p_token);
  if coalesce(trim(p_name), '') = '' then raise exception '이름을 적어 주세요'; end if;
  if p_role not in ('manager', 'crew') then raise exception 'BAD_ROLE'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception '비밀번호는 숫자 4자리예요'; end if;
  if p_id = m.id and (p_role <> 'manager' or not p_active) then raise exception '내 계정은 매니저에서 뺄 수 없어요'; end if;
  if p_id is null then
    if p_pin is null then raise exception '비밀번호 4자리를 정해 주세요'; end if;
    insert into ag_members(name, role, pin_hash, sort, active)
    values (trim(p_name), p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_sort, 99), coalesce(p_active, true))
    returning id into v_id;
  else
    update ag_members set name = trim(p_name), role = p_role, sort = coalesce(p_sort, sort), active = coalesce(p_active, active),
           pin_hash = case when p_pin is null then pin_hash else crypt(p_pin, gen_salt('bf')) end,
           fails = case when p_pin is null then fails else 0 end,
           locked_until = case when p_pin is null then locked_until else null end
     where id = p_id returning id into v_id;
    if p_pin is not null or not coalesce(p_active, true) then delete from ag_sessions where member_id = p_id and member_id <> m.id; end if;
  end if;
  return v_id;
end $$;

grant execute on function ag_roster(), ag_login(uuid, text), ag_logout(text), ag_board(text, date),
  ag_assign_set(text, date, uuid, text[], text), ag_done_set(text, date, text, boolean),
  ag_member_save(text, uuid, text, text, text, int, boolean) to anon, authenticated;
