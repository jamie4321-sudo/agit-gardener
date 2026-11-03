-- v10: 댓글 수정
-- 쓴 사람만 자기 댓글을 고칠 수 있어요 (매니저·관리자도 남의 댓글은 고치지 못하고 지우기만 가능)
-- 알림은 새 댓글에만 가고, 고칠 때는 다시 가지 않아요 (ag_push_comment 트리거는 insert 에만 걸려 있음)

alter table ag_issue_comments add column if not exists edited_at timestamptz;

create or replace function ag_issue_comment_edit(p_token text, p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_body text := left(trim(coalesce(p_body, '')), 500);
begin
  m := ag__me(p_token);
  if v_body = '' then raise exception '댓글 내용을 적어 주세요'; end if;
  if not exists (select 1 from ag_issue_comments where id = p_id) then raise exception '댓글을 찾지 못했어요'; end if;
  if not exists (select 1 from ag_issue_comments where id = p_id and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update ag_issue_comments set body = v_body, edited_at = now() where id = p_id;
end $$;

grant execute on function ag_issue_comment_edit(text, uuid, text) to anon, authenticated;

-- API 가 새 함수를 바로 알아보도록
notify pgrst, 'reload schema';
