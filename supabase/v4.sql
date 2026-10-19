-- 아지트 가드너 · v4: 현장 이슈 위치 직접 입력 + 날짜별 저장 · 주간 보기
-- v3.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.

alter table ag_issues add column if not exists place text not null default '';
alter table ag_issues add column if not exists day date;
update ag_issues set day = (created_at at time zone 'Asia/Seoul')::date where day is null;
alter table ag_issues alter column day set default ((now() at time zone 'Asia/Seoul')::date);
alter table ag_issues alter column day set not null;
create index if not exists ag_issues_day on ag_issues(day);

-- 이슈 올리기/고치기: 날짜(기본 오늘) · 층 · 위치 직접 입력
drop function if exists ag_issue_save(text, uuid, text, text);
drop function if exists ag_issue_save(text, uuid, text, text, text);
create or replace function ag_issue_save(p_token text, p_id uuid, p_zone text, p_memo text, p_place text default '', p_day date default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
  v_zone text := nullif(trim(coalesce(p_zone, '')), '');
  v_place text := left(trim(coalesce(p_place, '')), 40);
  v_day date := coalesce(p_day, ag__today());
begin
  m := ag__manager(p_token);
  if v_zone is not null and not exists (select 1 from ag_zones where code = v_zone) then v_zone := null; end if;
  if v_day > ag__today() then v_day := ag__today(); end if;
  if p_id is null then
    insert into ag_issues(day, zone, place, memo, created_by) values (v_day, v_zone, v_place, left(coalesce(trim(p_memo), ''), 1000), m.id) returning id into v_id;
  else
    update ag_issues set day = v_day, zone = v_zone, place = v_place, memo = left(coalesce(trim(p_memo), ''), 1000) where id = p_id returning id into v_id;
    if v_id is null then raise exception '이슈를 찾지 못했어요'; end if;
  end if;
  return v_id;
end $$;

-- 주간 보기: p_from(월요일)부터 7일 동안의 이슈 + 그 전부터 아직 진행 중인 이슈(carry)
create or replace function ag_issue_week(p_token text, p_from date) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_to date := p_from + 6;
begin
  perform ag__me(p_token);
  return json_build_object(
    'from', p_from, 'to', v_to,
    'open_all', (select count(*) from ag_issues where done_at is null),
    'places', (select coalesce(json_agg(place order by last desc), '[]'::json) from (
                 select place, max(created_at) as last from ag_issues where place <> '' group by place order by last desc limit 12) q),
    'items', (select coalesce(json_agg(x order by x.day desc, x.created_at desc), '[]'::json) from (
      select i.id, i.day, i.zone, i.place, i.memo, i.created_at, i.done_at, i.done_note,
             i.created_by, (select name from ag_members where id = i.created_by) as created_name,
             i.done_by, (select name from ag_members where id = i.done_by) as done_name,
             (i.day < p_from) as carry,
             (select coalesce(json_agg(json_build_object('id', p.id, 'kind', p.kind, 'thumb', p.thumb, 'by', p.created_by) order by p.created_at), '[]'::json)
                from ag_issue_photos p where p.issue_id = i.id) as photos
        from ag_issues i
       where i.day between p_from and v_to
          or (i.day < p_from and i.done_at is null and p_from <= ag__today() and ag__today() <= v_to)
    ) x)
  );
end $$;

grant execute on function ag_issue_save(text, uuid, text, text, text, date), ag_issue_week(text, date) to anon, authenticated;
