-- v14: 운영 대시보드(linkagelab-ops) '가든 › 아지트 가드너' 화면용 읽기 전용 요약
-- SIGN 프로젝트 SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- 비밀값은 새로 만들지 않아요 — 채용 키트 요약(fk_ops_feed)과 같은 비밀값(fk_ops_cfg, 운영 대시보드 Apps Script 의 HIRING_FEED_SECRET)으로 확인해요.
-- 보내는 것: 크루 이름·역할, 현장 이슈 요약(날짜·층·위치·내용 앞부분·올린/조치한 사람), 이번 달·지난달 1+1 휴게, 층 개수.
-- 보내지 않는 것: 비밀번호 · 사진 · 댓글 · 로그인 기록.

create or replace function ag_ops_feed(p_secret text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v_today date := (now() at time zone 'Asia/Seoul')::date;
        v_mon date := v_today - (extract(isodow from v_today)::int - 1);
begin
  if not exists (select 1 from fk_ops_cfg o where o.id = 1 and o.secret_hash = crypt(coalesce(p_secret, ''), o.secret_hash)) then
    return json_build_object('ok', false, 'error', 'unauthorized');
  end if;
  return json_build_object(
    'ok', true, 'at', now(), 'today', v_today, 'week_from', v_mon,
    'members', (select coalesce(json_agg(json_build_object('id', m.id, 'name', m.name, 'role', m.role) order by m.sort, m.created_at), '[]'::json)
                  from ag_members m where m.active),
    'zones', (select count(*) from ag_zones where coalesce(active, true)),
    'issues', (select coalesce(json_agg(json_build_object(
        'id', i.id, 'day', i.day, 'zone', i.zone, 'place', i.place, 'memo', left(i.memo, 120),
        'by', cm.name, 'at', i.created_at, 'done_at', i.done_at, 'done_by', dm.name, 'done_note', left(i.done_note, 80),
        'photos', (select count(*) from ag_issue_photos p where p.issue_id = i.id))
        order by i.day desc, i.created_at desc), '[]'::json)
      from ag_issues i left join ag_members cm on cm.id = i.created_by left join ag_members dm on dm.id = i.done_by
      where i.done_at is null or i.day >= v_today - 45),
    'rest', (select coalesce(json_agg(json_build_object('member', r.member_id, 'name', m.name, 'day', r.day, 'slot', r.slot,
                'from', to_char(r.t_from, 'HH24:MI'), 'to', to_char(r.t_to, 'HH24:MI')) order by r.day, r.t_from nulls last), '[]'::json)
      from ag_rest r join ag_members m on m.id = r.member_id
      where m.active and r.ym >= to_char(v_today - 31, 'YYYY-MM'))
  );
end $$;

revoke all on function ag_ops_feed(text) from public;
grant execute on function ag_ops_feed(text) to anon, authenticated;

notify pgrst, 'reload schema';
