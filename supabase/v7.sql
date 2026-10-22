-- 아지트 가드너 · v7: 칭찬 스티커 · 새 소식 알림
-- v6.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
--   칭찬 스티커 : 하트(heart) 옆에 고마워요(thanks) · 최고예요(best) · 깔끔해요(clean)
--   새 소식     : 내가 올리거나 조치한 이슈에 다른 사람이 남긴 스티커·댓글. '확인했어요' 누른 뒤 것만 세요.

-- 1. 하트 표에 스티커 종류 추가 (기존 하트는 heart)
alter table ag_issue_hearts add column if not exists kind text not null default 'heart';
do $$ begin
  if (select count(*) from information_schema.key_column_usage
       where table_schema = 'public' and table_name = 'ag_issue_hearts' and constraint_name = 'ag_issue_hearts_pkey') = 2 then
    alter table ag_issue_hearts drop constraint ag_issue_hearts_pkey;
    alter table ag_issue_hearts add primary key (issue_id, member_id, kind);
  end if;
end $$;

-- 2. 새 소식 확인 시각 (사람마다 한 줄)
create table if not exists ag_news_seen (
  member_id uuid primary key references ag_members(id) on delete cascade,
  seen_at timestamptz not null default now()
);
alter table ag_news_seen enable row level security;

-- 3. 스티커 누르기/빼기 — 조치 완료한 이슈에만
create or replace function ag_issue_react(p_token text, p_issue uuid, p_kind text, p_on boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if p_kind not in ('heart', 'thanks', 'best', 'clean') then raise exception 'BAD_KIND'; end if;
  if p_on then
    if not exists (select 1 from ag_issues where id = p_issue and done_at is not null) then raise exception '조치 완료한 이슈에만 칭찬을 남길 수 있어요'; end if;
    insert into ag_issue_hearts(issue_id, member_id, kind) values (p_issue, m.id, p_kind) on conflict do nothing;
  else
    delete from ag_issue_hearts where issue_id = p_issue and member_id = m.id and kind = p_kind;
  end if;
end $$;

-- v6 하트 함수도 그대로 쓸 수 있게 (하트만)
create or replace function ag_issue_heart(p_token text, p_issue uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag_issue_react(p_token, p_issue, 'heart', p_on);
end $$;

-- 4. 새 소식: 처음 부르면 지금부터 세기 시작해요
create or replace function ag_issue_news(p_token text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_since timestamptz;
begin
  m := ag__me(p_token);
  select seen_at into v_since from ag_news_seen where member_id = m.id;
  if v_since is null then
    insert into ag_news_seen(member_id) values (m.id) on conflict do nothing;
    v_since := now();
  end if;
  return (
    with n as (
      select 'react'::text as type, h.kind, null::text as body, h.member_id as by, h.created_at as at, i.id as issue, i.day, i.zone, i.place, i.memo
        from ag_issue_hearts h join ag_issues i on i.id = h.issue_id
       where (i.created_by = m.id or i.done_by = m.id) and h.member_id <> m.id and h.created_at > v_since
      union all
      select 'comment', null, c.body, c.created_by, c.created_at, i.id, i.day, i.zone, i.place, i.memo
        from ag_issue_comments c join ag_issues i on i.id = c.issue_id
       where (i.created_by = m.id or i.done_by = m.id) and c.created_by is distinct from m.id and c.created_at > v_since
    )
    select json_build_object(
      'count', (select count(*) from n),
      'items', coalesce((select json_agg(json_build_object('type', y.type, 'kind', y.kind, 'body', left(y.body, 80),
                   'name', (select name from ag_members where id = y.by), 'at', y.at, 'issue', y.issue, 'day', y.day,
                   'zone', y.zone, 'place', y.place, 'memo', left(y.memo, 40)) order by y.at desc)
                 from (select * from n order by at desc limit 20) y), '[]'::json))
  );
end $$;

create or replace function ag_issue_news_seen(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  insert into ag_news_seen(member_id, seen_at) values (m.id, now())
    on conflict (member_id) do update set seen_at = excluded.seen_at;
end $$;

-- 5. 주간 보기: hearts 에 kind 가 붙어요 (나머지는 v6 과 같음)
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
                from ag_issue_photos p where p.issue_id = i.id) as photos,
             (select coalesce(json_agg(json_build_object('id', c.id, 'body', c.body, 'by', c.created_by, 'name', (select name from ag_members where id = c.created_by), 'at', c.created_at) order by c.created_at), '[]'::json)
                from ag_issue_comments c where c.issue_id = i.id) as comments,
             (select coalesce(json_agg(json_build_object('by', h.member_id, 'kind', h.kind, 'name', (select name from ag_members where id = h.member_id)) order by h.created_at), '[]'::json)
                from ag_issue_hearts h where h.issue_id = i.id) as hearts
        from ag_issues i
       where i.day between p_from and v_to
          or (i.day < p_from and i.done_at is null and p_from <= ag__today() and ag__today() <= v_to)
    ) x)
  );
end $$;

grant execute on function ag_issue_react(text, uuid, text, boolean), ag_issue_heart(text, uuid, boolean),
  ag_issue_news(text), ag_issue_news_seen(text), ag_issue_week(text, date) to anon, authenticated;

-- API 가 새 함수를 바로 알아보도록
notify pgrst, 'reload schema';
