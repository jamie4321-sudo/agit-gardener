# 아지트 식물 도감 사진 모으기 — 위키백과 대표 사진(위키미디어 공용, 자유 이용)을 받아 plants/img/<id>.webp 로 줄여 저장
# 출처·저작권은 plants/credits.js 에 기록. 사진을 바꾸려면 OVR 에 위키백과 문서 제목이나 "File:파일이름" 을 적고 다시 실행
# 실행: python -I tools/fetch-plant-photos.py [id ...]
import json, re, sys, io, os, subprocess, urllib.request, urllib.parse
from PIL import Image
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "plants", "img"); os.makedirs(OUT, exist_ok=True)
CRED = os.path.join(ROOT, "plants", "credits.json")
UA = {"User-Agent": "agit-plant-guide/1.0 (educational, non-commercial)"}

# 기본은 학명(품종 이름 뺌) 문서. 더 맞는 사진이 있으면 여기 적어요
OVR = {
  "alii": "File:Ficus maclellandii Alii.jpg",
  "bengal": "File:Ficus benghalensis leaves and fruits at Peravoor (2).jpg",
  "benjamin": "File:Ficus benjamina variegata in pot D130210.jpg",
  "natasja": "File:Ficus benjamina variegata in pot D210507.jpg",
  "cactus": "File:Cactus mix 5.jpg",
  "carex": "File:Carex morrowii 'Variegata' plant 01.jpg",
  "compacta": "File:Dracaena fragrans 'Compacta' - Ботаничка градина Скопје (1).jpg",
  "fragrans": "File:Dracaena fragrans - Jardín Botánico Canario Viera y Clavijo - Gran Canaria.jpg",
  "lemon-lime": "File:Dracaena 'Lemon Lime'.jpg",
  "massangeana": "File:Corn Plant (Dracaena fragrans 'Massangeana').jpg",
  "euonymus-gold": "File:Starr 080117-1922 Euonymus japonica.jpg",
  "euonymus-silver": "File:Euonymus japonicus 'Albomarginatus' 01.JPG",
  "euonymus-var": "File:Starr 080117-1923 Euonymus japonica.jpg",
  "lyrata": "File:Ficus lyrata 98162192.jpg",
  "rubber": "File:Ficus elastica leaves and stem.JPG",
  "melany": "File:Ficus elastica Burgundy 0zz.jpg",
  "money-tree": "File:Radermachera sinica kz1.JPG",
  "selloum": "File:Philodendron bipinnatifidum 7zz.jpg",
  "ternstroemia": "File:Ternstroemia gymnanthera4.jpg",
  "emerald": "File:Thuja occidentalis Smaragd 0zz.jpg",
  "pachira": "File:Starr-110330-3813-Pachira aquatica-leaves-Garden of Eden Keanae-Maui (24450098304).jpg",
  "dogwood": "File:Cornus kousa flowers.jpg",
  "ardisia": "File:Ardisia pusilla turukouji03.jpg",
  "marginata": "File:Dracaena marginata IndoorPlant 0605k.jpg",
  "kentia": "File:Howea forsteriana - Krohn Conservatory - DSC03672.JPG",
  "black-rubber": "File:Ficus elastica burgundy-1-R.M. Nagar-bangalore-India.jpg",
  "umbellata": "File:Ficus umbellata.jpg",
  "hosta-2": "File:Hosta longipes 3.JPG",
  "golden-bamboo": "Dracaena sanderiana",
  "calathea": "Goeppertia",
  "congo": "Philodendron",
  "snow-sapphire": "Aglaonema",
  "silver-queen": "Aglaonema commutatum",
}

import time
def get(url, n=0):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r: return r.read()
    except urllib.error.HTTPError as e:
        if e.code == 429 and n < 5: time.sleep(20 * (n + 1)); return get(url, n + 1)
        raise

def page_file(title):
    q = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "pageimages", "piprop": "name", "redirects": 1, "format": "json"})
    d = json.loads(get("https://en.wikipedia.org/w/api.php?" + q))
    for p in d["query"]["pages"].values():
        if p.get("pageimage"): return "File:" + p["pageimage"]
    return None

def file_info(f):
    q = urllib.parse.urlencode({"action": "query", "titles": f, "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 720, "format": "json"})
    d = json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))
    for p in d["query"]["pages"].values():
        ii = p.get("imageinfo")
        if not ii: return None
        ii = ii[0]; m = ii.get("extmetadata", {})
        strip = lambda x: re.sub(r"<[^>]+>", "", (m.get(x, {}) or {}).get("value", "")).strip()
        return {"thumb": ii.get("thumburl") or ii["url"], "page": ii.get("descriptionurl"), "artist": strip("Artist")[:80], "license": strip("LicenseShortName")}

def main():
    src = open(os.path.join(ROOT, "plants.js"), encoding="utf-8").read()
    js = "global.window={};eval(require('fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(window.AG_PLANTS))"
    plants = json.loads(subprocess.run(["node", "-e", js], input=src.encode("utf-8"), capture_output=True, check=True).stdout)
    cred = json.load(open(CRED, encoding="utf-8")) if os.path.exists(CRED) else {}
    only = set(sys.argv[1:])
    for p in plants:
        pid = p["id"]
        if only and pid not in only: continue
        if not only and os.path.exists(os.path.join(OUT, pid + ".webp")) and pid in cred: continue
        title = OVR.get(pid) or re.sub(r"\s*\(.*?\)|\s*'.*?'", "", p["sci"]).strip()
        try:
            f = title if title.startswith("File:") else page_file(title)
            info = f and file_info(f)
            if not info: print("✗ 사진 없음", pid, title); continue
            im = Image.open(io.BytesIO(get(info["thumb"]))).convert("RGB")
            # 가운데를 4:3 으로 잘라 640×480
            w, h = im.size; tw = min(w, int(h * 4 / 3)); th = int(tw * 3 / 4)
            im = im.crop(((w - tw) // 2, (h - th) // 2, (w + tw) // 2, (h + th) // 2)).resize((640, 480), Image.LANCZOS)
            im.save(os.path.join(OUT, pid + ".webp"), "WEBP", quality=72)
            cred[pid] = {"file": f, "page": info["page"], "artist": info["artist"], "license": info["license"]}
            print("✓", pid, f, info["license"], flush=True)
            time.sleep(4)
        except Exception as e:
            print("✗ 오류", pid, title, e)
    json.dump(cred, open(CRED, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "plants", "credits.js"), "w", encoding="utf-8", newline="\n") as o:
        o.write("// 도감 사진 출처 (위키미디어 공용) — tools/fetch-plant-photos.py 가 만들어요\nwindow.AG_PLANT_CREDITS = " + json.dumps(cred, ensure_ascii=False) + ";\n")

main()
