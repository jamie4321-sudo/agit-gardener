-- 관리자 계정 이름 '팀리더' → '관리자' (한 번만 Run)
update ag_members set name = '관리자' where role = 'admin' and name = '팀리더';
