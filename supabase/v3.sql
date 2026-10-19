-- 아지트 가드너 · v3: 관리자 역할 + 크루 비밀번호 설정 + 현장 이슈(사진 이력)
-- schema.sql · admin.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
--
-- 역할: admin(관리자) > manager(매니저) > crew(가드너)
--   관리자  : 관리자 설정(크루 이름·역할·비밀번호, 층 목록) + 매니저가 하는 모든 일
--   매니저  : 업무 배정 · 현장 이슈 올리기/고치기/지우기
--   가드너  : 내 업무 · 전체 보기 · 현장 이슈 보기 + '조치 완료'(사진 선택)

-- ── 1. 역할에 admin 추가 ──
do $$ declare c text; begin
  for c in select conname from pg_constraint
            where conrelid = 'ag_members'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table ag_members drop constraint %I', c); end loop;
end $$;
alter table ag_members add constraint ag_members_role_check check (role in ('admin','manager','crew'));

-- 처음 한 번만: 관리자 계정. 이름·비밀번호는 로그인 후 '관리자 설정'에서 바꿔요.
do $$ begin
  if not exists (select 1 from ag_members where role = 'admin') then
    insert into ag_members(name, role, pin_hash, sort)
    values ('관리자', 'admin', extensions.crypt('9999', extensions.gen_salt('bf')), -1);
  end if;
end $$;

-- ── 2. 권한 도우미 ──
-- 매니저 일(업무 배정 등)은 관리자도 할 수 있어요.
create or replace function ag__manager(p_token text) returns ag_members
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role not in ('manager', 'admin') then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return m;
end $$;

create or replace function ag__admin(p_token text) returns ag_members
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role <> 'admin' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  return m;
end $$;
revoke execute on function ag__manager(text), ag__admin(text) from public, anon, authenticated;

-- '다 했어요': 가드너는 자기 층·오늘만, 매니저·관리자는 아무 날·아무 층
create or replace function ag_done_set(p_token text, p_day date, p_zone text, p_done boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role = 'crew' then
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

-- ── 3. 크루 관리는 관리자만 ──
create or replace function ag_member_save(p_token text, p_id uuid, p_name text, p_role text, p_pin text, p_sort int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
begin
  m := ag__admin(p_token);
  if coalesce(trim(p_name), '') = '' then raise exception '이름을 적어 주세요'; end if;
  if p_role not in ('admin', 'manager', 'crew') then raise exception 'BAD_ROLE'; end if;
  if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception '비밀번호는 숫자 4자리예요'; end if;
  if p_id = m.id and (p_role <> 'admin' or not coalesce(p_active, true)) then raise exception '내 계정은 관리자에서 뺄 수 없어요'; end if;
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

-- 관리자: 크루 비밀번호 새로 정하기 (잠금도 같이 풀리고, 그 크루의 다른 기기 로그인은 끊겨요)
create or replace function ag_member_pin(p_token text, p_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__admin(p_token);
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception '비밀번호는 숫자 4자리예요'; end if;
  update ag_members set pin_hash = crypt(p_pin, gen_salt('bf')), fails = 0, locked_until = null where id = p_id;
  if not found then raise exception '크루를 찾지 못했어요'; end if;
  delete from ag_sessions where member_id = p_id and member_id <> m.id;
end $$;

create or replace function ag_member_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__admin(p_token);
  if p_id = m.id then raise exception '내 계정은 삭제할 수 없어요'; end if;
  delete from ag_members where id = p_id;
end $$;

create or replace function ag_member_order(p_token text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__admin(p_token);
  update ag_members a set sort = o.i - 1
    from unnest(p_ids) with ordinality as o(id, i) where a.id = o.id;
end $$;

-- 층 목록도 관리자 설정 안에 있으니 관리자만
create or replace function ag_zone_save(p_token text, p_old text, p_code text, p_label text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform ag__admin(p_token);
  if v_code !~ '^[A-Z0-9]{1,6}$' then raise exception '층 이름은 영어·숫자 6자 이내예요 (예: 5A, B1)'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception '설명을 적어 주세요 (예: 5층 A)'; end if;
  if p_old is null then
    if exists (select 1 from ag_zones where code = v_code) then raise exception '이미 있는 층이에요'; end if;
    insert into ag_zones(code, label, sort) values (v_code, trim(p_label), coalesce((select max(sort) + 1 from ag_zones), 0));
  else
    if v_code <> p_old and exists (select 1 from ag_zones where code = v_code) then raise exception '이미 있는 층이에요'; end if;
    update ag_zones set code = v_code, label = trim(p_label) where code = p_old;
    if v_code <> p_old then
      update ag_assign set zones = array_replace(zones, p_old, v_code) where p_old = any(zones);
      update ag_done set zone = v_code where zone = p_old;
      update ag_issues set zone = v_code where zone = p_old;
      update ag_assign set zone_notes = (zone_notes - p_old) || jsonb_build_object(v_code, zone_notes -> p_old) where zone_notes ? p_old;
    end if;
  end if;
end $$;

create or replace function ag_zone_delete(p_token text, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__admin(p_token);
  delete from ag_zones where code = p_code;
  update ag_assign set zones = array_remove(zones, p_code) where p_code = any(zones);
  delete from ag_done where zone = p_code;
  update ag_issues set zone = null where zone = p_code;
  update ag_assign set zone_notes = zone_notes - p_code where zone_notes ? p_code;
end $$;

create or replace function ag_zone_order(p_token text, p_codes text[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__admin(p_token);
  update ag_zones z set sort = o.i - 1
    from unnest(p_codes) with ordinality as o(code, i) where z.code = o.code;
end $$;

-- ── 4. 현장 이슈 ──
-- 사진은 화면에서 줄여서(긴 변 1600px JPEG) 글자(data URL)로 저장해요. 목록엔 작은 사진(thumb)만 내려가요.
create table if not exists ag_issues(
  id uuid primary key default gen_random_uuid(),
  zone text,
  memo text not null default '',
  created_by uuid references ag_members(id) on delete set null,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references ag_members(id) on delete set null,
  done_note text not null default ''
);
create table if not exists ag_issue_photos(
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references ag_issues(id) on delete cascade,
  kind text not null check (kind in ('before', 'after')),
  thumb text not null,
  full_img text not null,
  created_by uuid references ag_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ag_issue_photos_issue on ag_issue_photos(issue_id, kind, created_at);
create index if not exists ag_issues_created on ag_issues(created_at desc);
alter table ag_issues enable row level security;
alter table ag_issue_photos enable row level security;
revoke all on ag_issues, ag_issue_photos from anon, authenticated;

-- 목록: 진행 중은 전부, 완료는 최근 p_limit 개. 사진은 작은 것만.
create or replace function ag_issue_list(p_token text, p_status text, p_limit int default 60) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__me(p_token);
  return json_build_object(
    'open', (select count(*) from ag_issues where done_at is null),
    'done', (select count(*) from ag_issues where done_at is not null),
    'items', (select coalesce(json_agg(x order by x.sort_at desc), '[]'::json) from (
      select i.id, i.zone, i.memo, i.created_at, i.done_at, i.done_note,
             coalesce(i.done_at, i.created_at) as sort_at,
             i.created_by, (select name from ag_members where id = i.created_by) as created_name,
             i.done_by, (select name from ag_members where id = i.done_by) as done_name,
             (select coalesce(json_agg(json_build_object('id', p.id, 'kind', p.kind, 'thumb', p.thumb, 'by', p.created_by) order by p.created_at), '[]'::json)
                from ag_issue_photos p where p.issue_id = i.id) as photos
        from ag_issues i
       where case when p_status = 'done' then i.done_at is not null else i.done_at is null end
       order by coalesce(i.done_at, i.created_at) desc
       limit case when p_status = 'done' then greatest(1, least(coalesce(p_limit, 60), 200)) else 500 end
    ) x)
  );
end $$;

-- 큰 사진 한 장
create or replace function ag_issue_photo(p_token text, p_id uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__me(p_token);
  return (select full_img from ag_issue_photos where id = p_id);
end $$;

-- 매니저·관리자: 이슈 올리기/고치기 (p_id 가 null 이면 새로)
create or replace function ag_issue_save(p_token text, p_id uuid, p_zone text, p_memo text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid; v_zone text := nullif(trim(coalesce(p_zone, '')), '');
begin
  m := ag__manager(p_token);
  if v_zone is not null and not exists (select 1 from ag_zones where code = v_zone) then v_zone := null; end if;
  if p_id is null then
    insert into ag_issues(zone, memo, created_by) values (v_zone, left(coalesce(trim(p_memo), ''), 1000), m.id) returning id into v_id;
  else
    update ag_issues set zone = v_zone, memo = left(coalesce(trim(p_memo), ''), 1000) where id = p_id returning id into v_id;
    if v_id is null then raise exception '이슈를 찾지 못했어요'; end if;
  end if;
  return v_id;
end $$;

-- 사진 붙이기. 처음 사진(before)은 매니저·관리자, 조치 후 사진(after)은 누구나. 종류마다 4장까지.
create or replace function ag_issue_photo_add(p_token text, p_issue uuid, p_kind text, p_thumb text, p_full text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
begin
  m := ag__me(p_token);
  if p_kind not in ('before', 'after') then raise exception 'BAD_KIND'; end if;
  if p_kind = 'before' and m.role = 'crew' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from ag_issues where id = p_issue) then raise exception '이슈를 찾지 못했어요'; end if;
  if coalesce(p_thumb, '') !~ '^data:image/(jpeg|png|webp);base64,' or coalesce(p_full, '') !~ '^data:image/(jpeg|png|webp);base64,' then
    raise exception '사진 형식이 맞지 않아요';
  end if;
  if length(p_thumb) > 200000 or length(p_full) > 2500000 then raise exception '사진이 너무 커요'; end if;
  if (select count(*) from ag_issue_photos where issue_id = p_issue and kind = p_kind) >= 4 then raise exception '사진은 4장까지 올릴 수 있어요'; end if;
  insert into ag_issue_photos(issue_id, kind, thumb, full_img, created_by) values (p_issue, p_kind, p_thumb, p_full, m.id) returning id into v_id;
  return v_id;
end $$;

-- 사진 지우기: 매니저·관리자 또는 올린 사람
create or replace function ag_issue_photo_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role = 'crew' and not exists (select 1 from ag_issue_photos where id = p_id and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from ag_issue_photos where id = p_id;
end $$;

-- 조치 완료 / 되돌리기. 완료는 누구나(메모 선택). 되돌리기는 매니저·관리자 또는 완료한 사람.
-- 되돌리면 조치 후 사진도 지워져요.
create or replace function ag_issue_done(p_token text, p_id uuid, p_done boolean, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; i ag_issues;
begin
  m := ag__me(p_token);
  select * into i from ag_issues where id = p_id for update;
  if not found then raise exception '이슈를 찾지 못했어요'; end if;
  if p_done then
    update ag_issues set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, m.id), done_note = left(coalesce(trim(p_note), ''), 1000) where id = p_id;
  else
    if m.role = 'crew' and i.done_by is distinct from m.id then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
    update ag_issues set done_at = null, done_by = null, done_note = '' where id = p_id;
    delete from ag_issue_photos where issue_id = p_id and kind = 'after';
  end if;
end $$;

create or replace function ag_issue_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__manager(p_token);
  delete from ag_issues where id = p_id;
end $$;

-- ── 5. 층별 전달 내용 ──
-- 배정마다 {"5A": "창가 화분 물 조금만", ...} 처럼 층마다 상세 내용을 따로 남겨요.
alter table ag_assign add column if not exists zone_notes jsonb not null default '{}'::jsonb;

drop function if exists ag__effective(date);
create function ag__effective(p_day date)
returns table(member_id uuid, day date, zones text[], note text, zone_notes jsonb)
language sql stable security definer set search_path = public as $$
  select distinct on (a.member_id) a.member_id, a.day, a.zones, a.note, a.zone_notes
    from ag_assign a join ag_members m on m.id = a.member_id and m.active
   where a.day <= p_day
   order by a.member_id, a.day desc
$$;
revoke execute on function ag__effective(date) from public, anon, authenticated;

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
    'assign', (select coalesce(json_agg(json_build_object('member', e.member_id, 'day', e.day, 'zones', e.zones, 'note', e.note, 'zone_notes', e.zone_notes)), '[]'::json)
                 from ag__effective(p_day) e),
    'done', (select coalesce(json_agg(json_build_object('zone', zone, 'member', member_id, 'at', done_at)), '[]'::json)
               from ag_done where day = p_day)
  );
end $$;

-- 업무 배정: 층 + 전체 남길 말 + 층별 전달 내용
drop function if exists ag_assign_set(text, date, uuid, text[], text);
create or replace function ag_assign_set(p_token text, p_day date, p_member uuid, p_zones text[], p_note text, p_zone_notes jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_zones text[]; v_notes jsonb;
begin
  m := ag__manager(p_token);
  v_zones := array(select z from unnest(coalesce(p_zones, '{}')) z where z in (select code from ag_zones));
  select coalesce(jsonb_object_agg(k, left(trim(v), 500)), '{}'::jsonb) into v_notes
    from jsonb_each_text(case when jsonb_typeof(p_zone_notes) = 'object' then p_zone_notes else '{}'::jsonb end) as e(k, v)
   where k = any(v_zones) and trim(v) <> '';
  insert into ag_assign(day, member_id, zones, note, zone_notes, updated_at, updated_by)
  values (p_day, p_member, v_zones, left(coalesce(p_note, ''), 500), v_notes, now(), m.id)
  on conflict (day, member_id) do update
    set zones = excluded.zones, note = excluded.note, zone_notes = excluded.zone_notes, updated_at = now(), updated_by = m.id;
end $$;

grant execute on function ag_board(text, date), ag_assign_set(text, date, uuid, text[], text, jsonb) to anon, authenticated;

grant execute on function ag_member_save(text, uuid, text, text, text, int, boolean), ag_member_pin(text, uuid, text),
  ag_member_delete(text, uuid), ag_member_order(text, uuid[]),
  ag_zone_save(text, text, text, text), ag_zone_delete(text, text), ag_zone_order(text, text[]),
  ag_done_set(text, date, text, boolean),
  ag_issue_list(text, text, int), ag_issue_photo(text, uuid), ag_issue_save(text, uuid, text, text),
  ag_issue_photo_add(text, uuid, text, text, text), ag_issue_photo_delete(text, uuid),
  ag_issue_done(text, uuid, boolean, text), ag_issue_delete(text, uuid) to anon, authenticated;
