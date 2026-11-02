-- 아지트 가드너 · v9: 진행 중인 현장 이슈에도 댓글
-- v8.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
--   댓글 알림은 올린 사람·조치한 사람 + 앞서 댓글 단 사람에게도 가요
--   댓글은 이제 진행 중·조치 완료 모두 가능 (칭찬 스티커는 그대로 조치 완료한 이슈에만)

create or replace function ag_issue_comment_add(p_token text, p_issue uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid; v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  m := ag__me(p_token);
  if v_body = '' then raise exception '댓글 내용을 적어 주세요'; end if;
  if not exists (select 1 from ag_issues where id = p_issue) then raise exception '이슈를 찾지 못했어요'; end if;
  insert into ag_issue_comments(issue_id, body, created_by) values (p_issue, v_body, m.id) returning id into v_id;
  return v_id;
end $$;

-- 댓글 알림: 앞서 댓글 단 사람에게도 (대화하듯 주고받을 수 있게)
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
  -- 받는 사람: 올린 사람 · 조치한 사람 + (댓글이면) 앞서 댓글 단 사람들
  select array_agg(distinct x) into v_to from (
    select unnest(array[i.created_by, i.done_by]) x
    union select c.created_by from ag_issue_comments c where tg_table_name = 'ag_issue_comments' and c.issue_id = i.id
  ) q where x is not null and x is distinct from v_by;
  if v_to is not null then
    perform ag__push(v_to, jsonb_build_object('title', v_title, 'body', v_body, 'tag', 'issue-' || i.id, 'url', '?issue=' || i.id || '&day=' || coalesce(i.day::text, '')));
  end if;
  return null;
end $$;
revoke execute on function ag__push_talk() from public, anon, authenticated;

grant execute on function ag_issue_comment_add(text, uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
