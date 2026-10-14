-- 아지트 가드너 · 관리자 설정 추가 (크루 삭제·순서, 층 추가/수정/삭제/순서)
-- schema.sql 다음에 SQL Editor 에서 Run. 여러 번 실행해도 안전해요.

-- 크루 완전 삭제 (배정은 함께 지워지고, 완료 기록은 이름 없이 남아요)
create or replace function ag_member_delete(p_token text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare m ag_members;
begin
  m := ag__manager(p_token);
  if p_id = m.id then raise exception '내 계정은 삭제할 수 없어요'; end if;
  delete from ag_members where id = p_id;
end $$;

-- 크루 순서 한 번에 저장 (목록 순서대로 0,1,2…)
create or replace function ag_member_order(p_token text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__manager(p_token);
  update ag_members a set sort = o.i - 1
    from unnest(p_ids) with ordinality as o(id, i) where a.id = o.id;
end $$;

-- 층 추가/수정. p_old 가 null 이면 추가, 있으면 그 층을 고쳐요(코드가 바뀌면 배정·완료 기록도 같이 바뀜).
create or replace function ag_zone_save(p_token text, p_old text, p_code text, p_label text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text := upper(trim(coalesce(p_code, '')));
begin
  perform ag__manager(p_token);
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
    end if;
  end if;
end $$;

-- 층 삭제 (배정에서도 빠지고, 그 층 완료 기록도 지워져요)
create or replace function ag_zone_delete(p_token text, p_code text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__manager(p_token);
  delete from ag_zones where code = p_code;
  update ag_assign set zones = array_remove(zones, p_code) where p_code = any(zones);
  delete from ag_done where zone = p_code;
end $$;

create or replace function ag_zone_order(p_token text, p_codes text[]) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform ag__manager(p_token);
  update ag_zones z set sort = o.i - 1
    from unnest(p_codes) with ordinality as o(code, i) where z.code = o.code;
end $$;

grant execute on function ag_member_delete(text, uuid), ag_member_order(text, uuid[]),
  ag_zone_save(text, text, text, text), ag_zone_delete(text, text), ag_zone_order(text, text[]) to anon, authenticated;
