-- v15: 운영 대시보드 '가든 › 아지트 가드너' 요약에 현장 사진(작은 그림) 추가
-- v14 의 ag_ops_feed 를 바꿔요. 진행 중 이슈 → 최근 이슈 순으로 12건만, 조치 전·후 첫 사진의 작은 그림(thumb)을 함께 보내요. 큰 사진은 안 보내요.
-- SIGN 프로젝트 SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요. (비밀값은 v14 와 같아요)

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
        'photos', (select count(*) from ag_issue_photos p where p.issue_id = i.id),
        'tb', case when i.rn <= 12 then (select p.thumb from ag_issue_photos p where p.issue_id = i.id and p.kind = 'before' order by p.created_at limit 1) end,
        'ta', case when i.rn <= 12 then (select p.thumb from ag_issue_photos p where p.issue_id = i.id and p.kind = 'after' order by p.created_at limit 1) end)
        order by i.day desc, i.created_at desc), '[]'::json)
      from (select x.*, row_number() over (order by (x.done_at is null) desc, x.day desc, x.created_at desc) as rn
              from ag_issues x where x.done_at is null or x.day >= v_today - 45) i
      left join ag_members cm on cm.id = i.created_by left join ag_members dm on dm.id = i.done_by),
    'rest', (select coalesce(json_agg(json_build_object('member', r.member_id, 'name', m.name, 'day', r.day, 'slot', r.slot,
                'from', to_char(r.t_from, 'HH24:MI'), 'to', to_char(r.t_to, 'HH24:MI')) order by r.day, r.t_from nulls last), '[]'::json)
      from ag_rest r join ag_members m on m.id = r.member_id
      where m.active and r.ym >= to_char(v_today - 31, 'YYYY-MM'))
  );
end $$;

revoke all on function ag_ops_feed(text) from public;
grant execute on function ag_ops_feed(text) to anon, authenticated;

notify pgrst, 'reload schema';
