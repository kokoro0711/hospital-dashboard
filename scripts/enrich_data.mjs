// Phase 3: 既存JSONを、元CSVの再抽出情報で拡張する（新規データは使わない）。
// 追加: 病床内訳/総数/病院タイプ, ITスコア, 6指標の算定開始年月日, 二次医療圏/区市町村,
//       診療機能指標(略称の完全一致で判定), meta のラベル修正と略称明記。
// 使い方: node scripts/enrich_data.mjs "<csv>"
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2] || 'C:\\Users\\riria\\Downloads\\extracted_tokyo_hospitals (1).csv';
const jsonPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const backupPath = join(root, 'data', 'tokyo_hospitals_pre_enrich.backup.json');

// ---------- CSV ----------
function parseCsv(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const normId = (s) => (s ?? '').replace(/[,\s]/g, '');

// 元パイプライン準拠のIT6指標（部分一致）。検証済みで現行 true 件数と一致。
const IT_FLAGS = {
  online_medical: '情報通信',
  medical_dx: '医療ＤＸ',
  electronic_record: '電情',
  outpatient_chemo: '外化１',
  remote_care: '遠隔',
  data_submission: 'データ提',
};
// 追加の診療機能指標（略称の完全一致で判定 = 誤検出を避ける）
const FUNC_FLAGS = {
  emergency: '救急医療',       // 救急医療管理加算
  discharge_support: '入退支', // 入退院支援加算
  infection_control: '感染対策１', // 感染対策向上加算1
  dialysis: '人工腎臓',        // 人工腎臓（血液透析）
  safety: '医療安全１',        // 医療安全対策加算1
  cancer_rehab: 'がんリハ',    // がん患者リハビリテーション料
};

function warekiYear(era, n) {
  if (era === '令和') return 2018 + n;
  if (era === '平成') return 1988 + n;
  if (era === '昭和') return 1925 + n;
  return null;
}
function parseJpDate(s) {
  if (!s) return null;
  const m = s.match(/(令和|平成|昭和)\s*(元|\d+)年\s*(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const n = m[2] === '元' ? 1 : parseInt(m[2], 10);
  const y = warekiYear(m[1], n); if (!y) return null;
  return `${y}-${String(+m[3]).padStart(2, '0')}-${String(+m[4]).padStart(2, '0')}`;
}
function parseBeds(s) {
  const d = { 一般: 0, 療養: 0, 精神: 0, 結核: 0, 感染: 0 };
  if (s) for (const m of s.matchAll(/(一般|療養|精神|結核|感染)\s*(\d+)/g)) d[m[1]] += +m[2];
  return d;
}

// ---------- 東京都 二次保健医療圏（区市町村→圏域の静的分類。外部DL不要の公知情報） ----------
const REGION_OF = {};
const REGIONS = {
  '区中央部': ['千代田区', '中央区', '港区', '文京区', '台東区'],
  '区南部': ['品川区', '大田区'],
  '区西南部': ['目黒区', '世田谷区', '渋谷区'],
  '区西部': ['新宿区', '中野区', '杉並区'],
  '区西北部': ['豊島区', '北区', '板橋区', '練馬区'],
  '区東北部': ['荒川区', '足立区', '葛飾区'],
  '区東部': ['墨田区', '江東区', '江戸川区'],
  '西多摩': ['青梅市', '福生市', '羽村市', 'あきる野市', '瑞穂町', '日の出町', '檜原村', '奥多摩町'],
  '南多摩': ['八王子市', '町田市', '日野市', '多摩市', '稲城市'],
  '北多摩西部': ['立川市', '昭島市', '国分寺市', '国立市', '東大和市', '武蔵村山市'],
  '北多摩南部': ['武蔵野市', '三鷹市', '府中市', '調布市', '小金井市', '狛江市'],
  '北多摩北部': ['小平市', '東村山市', '清瀬市', '東久留米市', '西東京市'],
  '島しょ': ['大島町', '八丈町', '三宅村', '新島村', '神津島村', '御蔵島村', '利島村', '青ヶ島村', '小笠原村'],
};
for (const [region, munis] of Object.entries(REGIONS)) for (const m of munis) REGION_OF[m] = region;
// 既知の市区町村名（長い順）で前方一致。「○○郡」接頭辞は除去。非貪欲正規表現の誤抽出を避ける。
const MUNI_LIST = Object.keys(REGION_OF).sort((a, b) => b.length - a.length);
function muniOf(address) {
  if (!address) return null;
  const addr = address.replace(/^.+?郡/, ''); // 西多摩郡日の出町 → 日の出町
  for (const m of MUNI_LIST) if (addr.startsWith(m)) return m;
  return null;
}

// ---------- 集約 ----------
let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);
const byId = new Map();
let cur = null;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const name = (r[2] ?? '').replace(/\n/g, '').trim();
  const hasKoban = (r[0] ?? '').trim() !== '';
  if (name && name !== 'nan' && hasKoban) {
    if (cur) byId.set(cur.id, cur);
    cur = { id: normId(r[1]), bedsRaw: r[4] ?? '', codes: r[5] ?? '', dates: r[6] ?? '' };
  } else if (cur) {
    if ((r[5] ?? '').trim()) cur.codes += '\n' + r[5];
    if ((r[6] ?? '').trim()) cur.dates += '\n' + r[6];
  }
}
if (cur) byId.set(cur.id, cur);

// ---------- 適用 ----------
const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const hospitals = data.hospitals;
if (!existsSync(backupPath)) { writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8'); console.log(`バックアップ: ${backupPath}`); }

let dateCount = 0;
const funcTally = Object.fromEntries(Object.keys(FUNC_FLAGS).map((k) => [k, 0]));
for (const h of hospitals) {
  const src = byId.get(h.id);
  if (!src) { console.warn(`CSVに無い: ${h.id} ${h.name}`); continue; }
  const codeLines = src.codes.split('\n').map((s) => s.trim()).filter(Boolean);
  const dateLines = src.dates.split('\n').map((s) => s.trim()).filter(Boolean);
  const tokens = new Set();
  for (const l of codeLines) { const m = l.match(/（([^）]+)）/); if (m) tokens.add(m[1]); }

  // IT指標の算定開始年月日
  const adopt = {};
  for (const [en, jp] of Object.entries(IT_FLAGS)) {
    if (h.investments?.[en] === true) {
      const idx = codeLines.findIndex((l) => l.includes(jp));
      const d = idx >= 0 ? parseJpDate(dateLines[idx]) : null;
      if (d) { adopt[en] = d; if (en === 'medical_dx') dateCount++; }
    }
  }
  h.adopt = adopt;

  // 診療機能指標（完全一致）
  const functions = {};
  for (const [en, jp] of Object.entries(FUNC_FLAGS)) {
    functions[en] = tokens.has(jp);
    if (functions[en]) funcTally[en]++;
  }
  h.functions = functions;

  // 病床内訳・総数・タイプ
  const detail = parseBeds(src.bedsRaw);
  const total = Object.values(detail).reduce((a, b) => a + b, 0);
  h.beds_detail = detail;
  h.beds_total = total || h.beds;
  const present = Object.entries(detail).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  h.hospital_type = present.length === 0 ? '不明'
    : present.length === 1 ? present[0][0]
    : (present[0][1] / total >= 0.8 ? present[0][0] : '混合');

  // ITスコア（IT6指標の該当数 0-6）
  h.it_score = Object.keys(IT_FLAGS).reduce((a, k) => a + (h.investments?.[k] ? 1 : 0), 0);

  // 地域
  h.municipality = muniOf(h.address);
  h.region = REGION_OF[h.municipality] ?? '不明';
}

// ---------- meta 更新 ----------
data.meta.indicators = {
  medical_dx: '医療DX推進体制整備加算',
  online_medical: 'オンライン診療（情報通信機器を用いた診療）',
  electronic_record: '電子的診療情報の活用（電情）',
  outpatient_chemo: '外来化学療法（外化1）',
  remote_care: '遠隔モニタリング等（遠隔ペースメーカー指導管理ほか）',
  data_submission: 'データ提出加算',
};
data.meta.indicatorAbbrev = {
  medical_dx: '医療ＤＸ', online_medical: '情報通信', electronic_record: '電情',
  outpatient_chemo: '外化１', remote_care: '遠隔', data_submission: 'データ提',
};
data.meta.functions = {
  emergency: '救急医療管理加算',
  discharge_support: '入退院支援加算',
  infection_control: '感染対策向上加算（1）',
  dialysis: '人工透析（人工腎臓）',
  safety: '医療安全対策加算（1）',
  cancer_rehab: 'がん患者リハビリテーション料',
};
data.meta.functionAbbrev = { ...FUNC_FLAGS };
data.meta.regions = Object.keys(REGIONS).filter((r) => r !== '島しょ');
data.meta.derived = {
  it_score: 'IT6指標の該当数(0-6)',
  hospital_type: '病床数最大の種別。複数種別で最大が8割未満なら「混合」',
  adopt: '各IT指標の算定開始年月日（届出受理の算定開始日）',
  region: '東京都 二次保健医療圏（区市町村からの静的分類）',
};
data.meta.notes = (data.meta.notes || '') +
  ' / ラベル修正: online_medical は「情報通信機器を用いた診療(オンライン診療)」を測定。' +
  '各指標が照合する施設基準略称は meta.indicatorAbbrev / functionAbbrev に明記。' +
  'remote_care は「遠隔」を含む施設基準（多くは遠隔ペースメーカー指導管理）を測定。';

writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
console.log(`書き込み完了: ${jsonPath}`);
console.log(`医療DX 算定日: ${dateCount}件付与`);
console.log(`診療機能 true件数:`, funcTally);
const regionTally = {};
for (const h of hospitals) regionTally[h.region] = (regionTally[h.region] ?? 0) + 1;
console.log(`二次医療圏分布:`, regionTally);
const typeTally = {};
for (const h of hospitals) typeTally[h.hospital_type] = (typeTally[h.hospital_type] ?? 0) + 1;
console.log(`病院タイプ分布:`, typeTally);
