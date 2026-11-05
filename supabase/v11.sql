-- v11: 현장 이슈 올리기에서 없는 층 바로 추가
-- 로그인한 누구나(크루 포함) 새 층을 '추가'만 할 수 있어요. 수정·삭제·순서는 그대로 관리자 설정에서만.
-- 이미 있는 층이면 오류 없이 그 층을 돌려줘요.

create or replace function ag_zone_add(p_token text, p_code text, p_label text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := upper(replace(replace(trim(coalesce(p_code, '')), '층', ''), ' ', ''));
        v_label text := trim(coalesce(p_label, ''));
begin
  perform ag__me(p_token);
  if v_code !~ '^[A-Z0-9]{1,6}$' then raise exception '층 이름은 영어·숫자 6자 이내예요 (예: 7B, B1)'; end if;
  if exists (select 1 from ag_zones where code = v_code) then
    update ag_zones set active = true where code = v_code and not active;
    return v_code;
  end if;
  if v_label = '' then v_label := v_code || '층'; end if;
  insert into ag_zones(code, label, sort) values (v_code, left(v_label, 30), coalesce((select max(sort) + 1 from ag_zones), 0));
  return v_code;
end $$;

grant execute on function ag_zone_add(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
