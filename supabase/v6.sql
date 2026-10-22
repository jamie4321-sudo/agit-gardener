-- 아지트 가드너 · v6: 조치 완료한 현장 이슈에 댓글 · 하트
-- v5.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
--   누구나 : 조치 완료한 이슈에 댓글 남기기 · 하트 누르기/빼기
--   댓글 지우기 : 쓴 사람 또는 매니저·관리자

create table if not exists ag_issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references ag_issues(id) on delete cascade,
  body text not null,
  created_by uuid references ag_members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ag_issue_comments_issue on ag_issue_comments(issue_id, created_at);

create table if not exists ag_issue_hearts (
  issue_id uuid not null references ag_issues(id) on delete cascade,
  member_id uuid not null references ag_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (issue_id, member_id)
);

-- 표는 RLS 만 켜고 정책 없음 → ag_* 함수로만 읽고 써요
alter table ag_issue_comments enable row level security;
alter table ag_issue_hearts enable row level security;

create or replace function ag_issue_comment_add(p_token text, p_issue uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid; v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  m := ag__me(p_token);
  if v_body = '' then raise exception '댓글 내용을 적어 주세요'; end if;
  if not exists (select 1 from ag_issues where id = p_issue) then raise exception '이슈를 찾지 못했어요'; end if;
  if not exists (select 1 from ag_issues where id = p_issue and done_at is not null) then raise exception '조치 완료한 이슈에만 댓글을 남길 수 있어요'; end if;
  insert into ag_issue_comments(issue_id, body, created_by) values (p_issue, v_body, m.id) returning id into v_id;
  return v_id;
end $$;

create or replace function ag_issue_comment_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role = 'crew' and not exists (select 1 from ag_issue_comments where id = p_id and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from ag_issue_comments where id = p_id;
end $$;

create or replace function ag_issue_heart(p_token text, p_issue uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if p_on then
    if not exists (select 1 from ag_issues where id = p_issue and done_at is not null) then raise exception '조치 완료한 이슈에만 하트를 누를 수 있어요'; end if;
    insert into ag_issue_hearts(issue_id, member_id) values (p_issue, m.id) on conflict do nothing;
  else
    delete from ag_issue_hearts where issue_id = p_issue and member_id = m.id;
  end if;
end $$;

-- 주간 보기: v4 와 같고 이슈마다 comments · hearts 가 붙어요
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
             (select coalesce(json_agg(json_build_object('by', h.member_id, 'name', (select name from ag_members where id = h.member_id)) order by h.created_at), '[]'::json)
                from ag_issue_hearts h where h.issue_id = i.id) as hearts
        from ag_issues i
       where i.day between p_from and v_to
          or (i.day < p_from and i.done_at is null and p_from <= ag__today() and ag__today() <= v_to)
    ) x)
  );
end $$;

grant execute on function ag_issue_comment_add(text, uuid, text), ag_issue_comment_delete(text, uuid),
  ag_issue_heart(text, uuid, boolean), ag_issue_week(text, date) to anon, authenticated;
