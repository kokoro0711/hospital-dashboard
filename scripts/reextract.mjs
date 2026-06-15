// Phase 3 調査(ドライラン): 抽出CSVから追加情報を取り出せるか検証する。
// - 6指標を元パイプラインと同じ部分一致で再現し、現行JSONの true 件数と一致するか検証
// - 各指標の算定開始年月日を抽出（受理番号と算定開始年月日の行を対応付け）
// - 病床数の内訳(一般/療養/精神/結核/感染)を解析
// - 全施設基準略称（…）の出現頻度を集計 → 追加指標の選定材料
// JSONは書き換えない。使い方: node scripts/reextract.mjs "<csv>"
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2] || 'C:\\Users\\riria\\Downloads\\extracted_tokyo_hospitals (1).csv';

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

// 元パイプラインの指標定義（部分一致）
const FLAGS = {
  online_medical: '情報通信',
  medical_dx: '医療ＤＸ',
  electronic_record: '電情',
  outpatient_chemo: '外化１',
  remote_care: '遠隔',
  data_submission: 'データ提',
};

// 和暦→西暦年
function warekiToYear(era, n) {
  if (era === '令和') return 2018 + n; // 令和元=2019
  if (era === '平成') return 1988 + n; // 平成元=1989
  if (era === '昭和') return 1925 + n;
  return null;
}
function parseJpDate(s) {
  if (!s) return null;
  const m = s.match(/(令和|平成|昭和)\s*(元|\d+)年\s*(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const n = m[2] === '元' ? 1 : parseInt(m[2], 10);
  const y = warekiToYear(m[1], n);
  if (!y) return null;
  const mo = String(parseInt(m[3], 10)).padStart(2, '0');
  const d = String(parseInt(m[4], 10)).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// 病床内訳: "一般 74", "一般\n一般 160", "精神 104", "療養 91" など
function parseBeds(s) {
  const detail = { 一般: 0, 療養: 0, 精神: 0, 結核: 0, 感染: 0 };
  if (!s) return detail;
  for (const m of s.matchAll(/(一般|療養|精神|結核|感染)\s*(\d+)/g)) {
    detail[m[1]] += parseInt(m[2], 10);
  }
  return detail;
}

let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);

// 病院単位に集約（元パイプライン準拠: 名称あり&項番ありで新規、その他は継続行としてマージ）
const hospitals = [];
let cur = null;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const name = (r[2] ?? '').replace(/\n/g, '').trim();
  const hasKoban = (r[0] ?? '').trim() !== '';
  if (name && name !== 'nan' && hasKoban) {
    if (cur) hospitals.push(cur);
    cur = {
      id: normId(r[1]),
      name,
      bedsRaw: (r[4] ?? ''),
      codes: (r[5] ?? ''),
      dates: (r[6] ?? ''),
    };
  } else if (cur) {
    if ((r[5] ?? '').trim()) cur.codes += '\n' + r[5];
    if ((r[6] ?? '').trim()) cur.dates += '\n' + r[6];
  }
}
if (cur) hospitals.push(cur);

// 100床以上に絞る（元パイプラインは病床数の最初の数値で判定）
const big = hospitals.filter((h) => {
  const m = h.bedsRaw.replace(/\n/g, '').match(/\d+/);
  return m && parseInt(m[0], 10) >= 100;
});

// 現行JSONと突き合わせ
const cur_json = JSON.parse(readFileSync(join(root, 'public', 'tokyo_hospitals_100beds.json'), 'utf-8'));
const jsonHospitals = cur_json.hospitals;
const jsonIds = new Set(jsonHospitals.map((h) => h.id));

// 指標再現＋日付抽出＋病床内訳
const tally = Object.fromEntries(Object.keys(FLAGS).map((k) => [k, 0]));
const abbrevPresence = new Map(); // 略称 -> 施設数
const enriched = new Map();
for (const h of big) {
  // code/date ペア
  const codeLines = h.codes.split('\n').map((s) => s.trim()).filter(Boolean);
  const dateLines = h.dates.split('\n').map((s) => s.trim()).filter(Boolean);
  const flags = {}; const adopt = {};
  for (const [en, jp] of Object.entries(FLAGS)) {
    const idx = codeLines.findIndex((l) => l.includes(jp));
    flags[en] = idx >= 0;
    if (flags[en]) { tally[en]++; adopt[en] = parseJpDate(dateLines[idx]) || null; }
  }
  // 略称集計（施設ごとにユニーク）
  const seen = new Set();
  for (const l of codeLines) {
    const m = l.match(/（([^）]+)）/);
    if (m && !seen.has(m[1])) { seen.add(m[1]); abbrevPresence.set(m[1], (abbrevPresence.get(m[1]) ?? 0) + 1); }
  }
  enriched.set(h.id, { flags, adopt, beds: parseBeds(h.bedsRaw) });
}

console.log(`CSV病院総数: ${hospitals.length} / 100床以上: ${big.length} / 現行JSON: ${jsonHospitals.length}`);
const bigIds = new Set(big.map((h) => h.id));
const missingInBig = jsonHospitals.filter((h) => !bigIds.has(h.id)).map((h) => h.id);
console.log(`現行JSONにあるがCSV100床抽出に無いID: ${missingInBig.length} ${missingInBig.slice(0, 5).join(',')}`);

console.log('\n=== 指標 true件数: 再抽出 vs 現行JSON ===');
for (const k of Object.keys(FLAGS)) {
  const jc = jsonHospitals.filter((h) => h.investments?.[k] === true).length;
  const mark = tally[k] === jc ? '✓' : '✗ 不一致';
  console.log(`  ${k}: 再抽出=${tally[k]} / JSON=${jc} ${mark}`);
}

// 日付サンプル
console.log('\n=== 医療DX 算定開始年月日サンプル(先頭8件) ===');
let n = 0;
for (const h of jsonHospitals) {
  const e = enriched.get(h.id);
  if (e?.adopt?.medical_dx && n < 8) { console.log(`  ${h.name.slice(0, 18)}: ${e.adopt.medical_dx}`); n++; }
}
const dxDates = jsonHospitals.map((h) => enriched.get(h.id)?.adopt?.medical_dx).filter(Boolean).sort();
console.log(`  医療DX 日付取得: ${dxDates.length}/${tally.medical_dx} 件, 最古=${dxDates[0]}, 最新=${dxDates[dxDates.length - 1]}`);

// 病床内訳サンプル
console.log('\n=== 病床内訳サンプル(先頭5件) ===');
let m2 = 0;
for (const h of jsonHospitals) {
  if (m2 >= 5) break;
  const e = enriched.get(h.id);
  if (e) { console.log(`  ${h.name.slice(0, 16)} beds=${h.beds} 内訳=${JSON.stringify(e.beds)}`); m2++; }
}

// 略称頻度トップ
const sorted = [...abbrevPresence.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n=== 施設基準略称 出現頻度トップ80（略称: 施設数 / ${big.length}） ===`);
console.log(sorted.slice(0, 80).map(([k, v]) => `${k}:${v}`).join('  '));

writeFileSync(join(root, 'data', 'abbrev_frequency.txt'),
  sorted.map(([k, v]) => `${v}\t${k}`).join('\n'), 'utf-8');
console.log(`\n全${sorted.length}略称の頻度を data/abbrev_frequency.txt に保存`);
