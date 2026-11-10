-- v13: 1+1 휴게를 오전/오후 대신 '몇 시부터 몇 시까지'로 등록
-- 4h 크루는 1시간, 8h 크루는 2시간 휴식. 이미 있는 기록(오전/오후)은 그대로 두고 화면에서 오전/오후로 보여요.
-- 다시 실행해도 안전해요.

alter table ag_rest add column if not exists t_from time;
alter table ag_rest add column if not exists t_to time;
alter table ag_rest alter column slot drop not null;

-- 한 달 일정 보기 (로그인한 모두)
create or replace function ag_rest_month(p_token text, p_ym text) returns json
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__me(p_token);
  if coalesce(p_ym, '') !~ '^\d{4}-\d{2}$' then raise exception '달 형식이 맞지 않아요'; end if;
  return json_build_object('ym', p_ym, 'items', coalesce((
    select json_agg(json_build_object('member', r.member_id, 'name', m.name, 'day', r.day, 'slot', r.slot,
             'from', to_char(r.t_from, 'HH24:MI'), 'to', to_char(r.t_to, 'HH24:MI'))
           order by r.day, r.t_from nulls last, r.slot, m.sort)
      from ag_rest r join ag_members m on m.id = r.member_id
     where r.ym = p_ym and m.active), '[]'::json));
end $$;

-- 등록하기 / 날짜·시간 바꾸기 (예전 오전/오후 함수는 지워요)
drop function if exists ag_rest_set(text, uuid, date, text);
create or replace function ag_rest_set(p_token text, p_member uuid, p_day date, p_from text, p_to text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare me ag_members; v_member uuid; v_from time; v_to time;
begin
  me := ag__me(p_token);
  v_member := coalesce(p_member, me.id);
  if v_member <> me.id and me.role = 'crew' then raise exception 'FORBIDDEN' using errcode = '42501'; end if;
  if not exists (select 1 from ag_members where id = v_member and active) then raise exception '크루를 찾지 못했어요'; end if;
  if p_day is null then raise exception '날짜를 골라 주세요'; end if;
  if extract(isodow from p_day) > 5 then raise exception '주말은 고를 수 없어요'; end if;
  if coalesce(p_from, '') !~ '^\d{1,2}:\d{2}$' or coalesce(p_to, '') !~ '^\d{1,2}:\d{2}$' then raise exception '쉬는 시간을 골라 주세요'; end if;
  v_from := p_from::time; v_to := p_to::time;
  if v_to <= v_from then raise exception '끝나는 시간이 시작보다 늦어야 해요'; end if;
  insert into ag_rest(member_id, ym, day, slot, t_from, t_to, created_by, updated_at)
  values (v_member, to_char(p_day, 'YYYY-MM'), p_day, null, v_from, v_to, me.id, now())
  on conflict (member_id, ym) do update set day = excluded.day, slot = null, t_from = excluded.t_from, t_to = excluded.t_to,
    created_by = excluded.created_by, updated_at = now();
end $$;

grant execute on function ag_rest_month(text, text), ag_rest_set(text, uuid, date, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
