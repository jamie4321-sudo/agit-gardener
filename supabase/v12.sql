-- v12: 일정 공유 › 1+1 휴게 사용 등록
-- 한 사람이 한 달에 한 번(평일 하루, 오전 또는 오후). 같은 날 몇 명이 써도 돼요.
-- 오늘·지난 날도 등록·취소 가능(깜빡하고 못 적었을 때). 크루는 자기 것만, 매니저·관리자는 다른 크루 것도 대신.
-- 같은 달에 다시 등록하면 날짜만 바뀌어요. 모두가 서로의 일정을 볼 수 있어요.

create table if not exists ag_rest(
  member_id uuid not null references ag_members(id) on delete cascade,
  ym text not null,                       -- 'YYYY-MM'
  day date not null,
  slot text not null check (slot in ('am', 'pm')),
  created_by uuid references ag_members(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (member_id, ym)
);
create index if not exists ag_rest_day on ag_rest(day);
alter table ag_rest enable row level security;   -- 정책 없음 → 표 직접 접근 막고 함수로만

-- 한 달 일정 보기 (로그인한 모두)
create or replace function ag_rest_month(p_token text, p_ym text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__me(p_token);
  if coalesce(p_ym, '') !~ '^\d{4}-\d{2}$' then raise exception '달 형식이 맞지 않아요'; end if;
  return json_build_object('ym', p_ym, 'items', coalesce((
    select json_agg(json_build_object('member', r.member_id, 'name', m.name, 'day', r.day, 'slot', r.slot) order by r.day, r.slot, m.sort)
      from ag_rest r join ag_members m on m.id = r.member_id
     where r.ym = p_ym and m.active), '[]'::json));
end $$;

-- 등록하기 / 날짜 바꾸기
create or replace function ag_rest_set(p_token text, p_member uuid, p_day date, p_slot text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me ag_members; v_member uuid;
begin
  me := ag__me(p_token);
  v_member := coalesce(p_member, me.id);
  if v_member <> me.id and me.role = 'crew' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from ag_members where id = v_member and active) then raise exception '크루를 찾지 못했어요'; end if;
  if p_day is null then raise exception '날짜를 골라 주세요'; end if;
  if p_slot not in ('am', 'pm') then raise exception '오전 또는 오후를 골라 주세요'; end if;
  if extract(isodow from p_day) > 5 then raise exception '주말은 고를 수 없어요'; end if;
  insert into ag_rest(member_id, ym, day, slot, created_by, updated_at)
  values (v_member, to_char(p_day, 'YYYY-MM'), p_day, p_slot, me.id, now())
  on conflict (member_id, ym) do update set day = excluded.day, slot = excluded.slot, created_by = excluded.created_by, updated_at = now();
end $$;

-- 취소하기
create or replace function ag_rest_cancel(p_token text, p_member uuid, p_ym text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me ag_members; v_member uuid;
begin
  me := ag__me(p_token);
  v_member := coalesce(p_member, me.id);
  if v_member <> me.id and me.role = 'crew' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  delete from ag_rest where member_id = v_member and ym = p_ym;
end $$;

grant execute on function ag_rest_month(text, text), ag_rest_set(text, uuid, date, text), ag_rest_cancel(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
