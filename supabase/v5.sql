-- 아지트 가드너 · v5: 크루(가드너)도 현장 이슈 올리기
-- v4.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.
--   누구나   : 이슈 올리기 + 현장 사진(before)
--   크루     : 자기가 올린 이슈만 고치기·지우기
--   매니저·관리자 : 모든 이슈 고치기·지우기 (전과 같음)

-- 이슈 올리기/고치기
create or replace function ag_issue_save(p_token text, p_id uuid, p_zone text, p_memo text, p_place text default '', p_day date default null) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
  v_zone text := nullif(trim(coalesce(p_zone, '')), '');
  v_place text := left(trim(coalesce(p_place, '')), 40);
  v_day date := coalesce(p_day, ag__today());
begin
  m := ag__me(p_token);
  if p_id is not null and m.role = 'crew' and not exists (select 1 from ag_issues where id = p_id and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
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

-- 사진 붙이기. 현장 사진(before)은 매니저·관리자 또는 이슈를 올린 사람, 조치 후 사진(after)은 누구나. 종류마다 4장까지.
create or replace function ag_issue_photo_add(p_token text, p_issue uuid, p_kind text, p_thumb text, p_full text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members; v_id uuid;
begin
  m := ag__me(p_token);
  if p_kind not in ('before', 'after') then raise exception 'BAD_KIND'; end if;
  if not exists (select 1 from ag_issues where id = p_issue) then raise exception '이슈를 찾지 못했어요'; end if;
  if p_kind = 'before' and m.role = 'crew' and not exists (select 1 from ag_issues where id = p_issue and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if coalesce(p_thumb, '') !~ '^data:image/(jpeg|png|webp);base64,' or coalesce(p_full, '') !~ '^data:image/(jpeg|png|webp);base64,' then
    raise exception '사진 형식이 맞지 않아요';
  end if;
  if length(p_thumb) > 200000 or length(p_full) > 2500000 then raise exception '사진이 너무 커요'; end if;
  if (select count(*) from ag_issue_photos where issue_id = p_issue and kind = p_kind) >= 4 then raise exception '사진은 4장까지 올릴 수 있어요'; end if;
  insert into ag_issue_photos(issue_id, kind, thumb, full_img, created_by) values (p_issue, p_kind, p_thumb, p_full, m.id) returning id into v_id;
  return v_id;
end $$;

-- 이슈 지우기: 매니저·관리자 또는 올린 사람
create or replace function ag_issue_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__me(p_token);
  if m.role = 'crew' and not exists (select 1 from ag_issues where id = p_id and created_by = m.id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  delete from ag_issues where id = p_id;
end $$;

grant execute on function ag_issue_save(text, uuid, text, text, text, date),
  ag_issue_photo_add(text, uuid, text, text, text), ag_issue_delete(text, uuid) to anon, authenticated;
