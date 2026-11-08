// Supabase SIGN 프로젝트 (공개 키 — 표는 RLS 로 막혀 있고 ag_* 함수만 부를 수 있어요)
window.AG_CONFIG = {
  sbUrl: "https://qdwynctnhjndkmykecbu.supabase.co",
  sbKey: "sb_publishable_gv8l9z7imNyR0_lsUmVLxw_cFFclQ6O",
  // 층 배정 기능(내 업무·전체 보기·업무 배정) — 지금은 꺼 두고 현장 이슈만 써요. 열 때 true 로
  assignOn: false,
  // 체감온도 기록 — 아지트 가든 대시보드(garden-dash)와 같은 구글 시트(heatLogs 탭)를 함께 써요 (Apps Script 웹 앱 주소)
  heatApi: "https://script.google.com/macros/s/AKfycbxy7-AVZfzeE6jQpMHPyp1RvdwupBH9Kcm0OmbCVxdcVivHd2eh0D6ObsCTJST9e_mH/exec"
};
