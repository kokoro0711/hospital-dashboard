// Phase 0 データ監査スクリプト
// 使い方: node scripts/audit.mjs
// public/tokyo_hospitals_100beds.json を監査し、data/audit_report.md を生成する。

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const reportPath = join(root, 'data', 'audit_report.md');

const parsed = JSON.parse(readFileSync(dataPath, 'utf-8'));
// 旧スキーマ(配列) / 新スキーマ({meta, hospitals}) の両対応
const hospitals = Array.isArray(parsed) ? parsed : parsed.hospitals;

// --- 監査基準 ---
// 固定座標（仙台市付近・ジオコーディング失敗時のフォールバック疑い）
const FIXED_LAT = 38.25056504;
const FIXED_LNG = 140.83062864;
const EPS = 1e-6;
// 東京都の妥当範囲（本土）。島嶼部は lat 24–35.0 かつ lng 138.9–142.3 を別枠で許容。
const TOKYO = { latMin: 35.5, latMax: 35.9, lngMin: 138.9, lngMax: 139.95 };
const ISLANDS = { latMin: 24.0, latMax: 35.0, lngMin: 138.9, lngMax: 142.3 };

// robot_surgery は出典非収載のため Phase 2 で除外済み（scripts/add_meta.mjs）
const INDICATORS = [
  'online_medical', 'medical_dx', 'electronic_record',
  'outpatient_chemo', 'remote_care', 'data_submission',
];

const isFixed = (h) =>
  Math.abs(h.lat - FIXED_LAT) < EPS && Math.abs(h.lng - FIXED_LNG) < EPS;
const inRange = (h, r) =>
  h.lat >= r.latMin && h.lat <= r.latMax && h.lng >= r.lngMin && h.lng <= r.lngMax;

// --- 集計 ---
const total = hospitals.length;
const nanAddress = hospitals.filter((h) => h.address === 'nan');
const fixedCoord = hospitals.filter(isFixed);
const outOfTokyo = hospitals.filter(
  (h) => h.lat != null && h.lng != null && !inRange(h, TOKYO) && !inRange(h, ISLANDS)
);
const islands = hospitals.filter((h) => h.lat != null && h.lng != null && inRange(h, ISLANDS));
const nullCoord = hospitals.filter((h) => h.lat == null || h.lng == null);

const trueCounts = Object.fromEntries(
  INDICATORS.map((k) => [k, hospitals.filter((h) => h.investments?.[k] === true).length])
);
const nonBoolean = hospitals.filter((h) =>
  INDICATORS.some((k) => typeof h.investments?.[k] !== 'boolean')
);

// nan住所と固定座標の関係
const nanAndFixed = hospitals.filter((h) => h.address === 'nan' && isFixed(h));
const nanNotFixed = nanAddress.filter((h) => !isFixed(h));
const fixedNotNan = fixedCoord.filter((h) => h.address !== 'nan');

// 重複座標（固定座標グループは除外して別掲）
const byCoord = new Map();
for (const h of hospitals) {
  if (h.lat == null || h.lng == null) continue;
  const key = `${h.lat},${h.lng}`;
  if (!byCoord.has(key)) byCoord.set(key, []);
  byCoord.get(key).push(h);
}
const dupGroups = [...byCoord.entries()]
  .filter(([, v]) => v.length > 1)
  .map(([key, v]) => ({ key, hospitals: v, isFixedGroup: isFixed(v[0]) }))
  .sort((a, b) => b.hospitals.length - a.hospitals.length);
const realDupGroups = dupGroups.filter((g) => !g.isFixedGroup);

// ID重複・必須フィールド欠落も念のため
const idCounts = new Map();
for (const h of hospitals) idCounts.set(h.id, (idCounts.get(h.id) ?? 0) + 1);
const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1);
const missingFields = hospitals.filter(
  (h) => !h.id || !h.name || typeof h.beds !== 'number'
);

// --- レポート生成 ---
const now = new Date().toISOString();
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`;
const lines = [];
lines.push(`# データ監査レポート: tokyo_hospitals_100beds.json`);
lines.push(``);
lines.push(`- 実行日時: ${now}`);
lines.push(`- 対象ファイル: \`public/tokyo_hospitals_100beds.json\``);
lines.push(`- 監査スクリプト: \`scripts/audit.mjs\``);
lines.push(``);
lines.push(`## サマリー`);
lines.push(``);
lines.push(`| 項目 | 件数 | 割合 |`);
lines.push(`|---|---|---|`);
lines.push(`| 総件数 | ${total} | 100% |`);
lines.push(`| address == "nan" | ${nanAddress.length} | ${pct(nanAddress.length)} |`);
lines.push(`| 固定座標 (${FIXED_LAT}, ${FIXED_LNG}) | ${fixedCoord.length} | ${pct(fixedCoord.length)} |`);
lines.push(`| 東京妥当範囲外（固定座標含む） | ${outOfTokyo.length} | ${pct(outOfTokyo.length)} |`);
lines.push(`| うち固定座標以外の範囲外 | ${outOfTokyo.filter((h) => !isFixed(h)).length} | ${pct(outOfTokyo.filter((h) => !isFixed(h)).length)} |`);
lines.push(`| 島嶼部範囲内 | ${islands.length} | ${pct(islands.length)} |`);
lines.push(`| lat/lng が null | ${nullCoord.length} | ${pct(nullCoord.length)} |`);
lines.push(`| ID重複 | ${dupIds.length} 組 | - |`);
lines.push(`| 必須フィールド欠落 (id/name/beds) | ${missingFields.length} | ${pct(missingFields.length)} |`);
lines.push(`| investments に非boolean値 | ${nonBoolean.length} | ${pct(nonBoolean.length)} |`);
lines.push(``);
lines.push(`## 住所欠損と固定座標の関係`);
lines.push(``);
lines.push(`- address=="nan" かつ 固定座標: ${nanAndFixed.length} 件`);
lines.push(`- address=="nan" だが固定座標でない: ${nanNotFixed.length} 件`);
lines.push(`- 固定座標だが address!="nan": ${fixedNotNan.length} 件`);
if (nanNotFixed.length) {
  lines.push(``);
  for (const h of nanNotFixed) lines.push(`  - [nan住所・非固定座標] ${h.id} ${h.name} (${h.lat}, ${h.lng})`);
}
if (fixedNotNan.length) {
  lines.push(``);
  for (const h of fixedNotNan) lines.push(`  - [固定座標・住所あり] ${h.id} ${h.name} 「${h.address}」`);
}
lines.push(``);
lines.push(`## 各指標の true 件数`);
lines.push(``);
lines.push(`| 指標 | true件数 | 割合 |`);
lines.push(`|---|---|---|`);
for (const k of INDICATORS) {
  lines.push(`| ${k} | ${trueCounts[k]} | ${pct(trueCounts[k])} |`);
}
lines.push(``);
lines.push(`- robot_surgery: 出典「届出受理状況」に手術支援ロボットの施設基準が存在しないため Phase 2 で指標から除外済み（scripts/check_robot.mjs で検証）。`);
lines.push(``);
lines.push(`## 東京妥当範囲外の施設（固定座標を除く）`);
lines.push(``);
const outNonFixed = outOfTokyo.filter((h) => !isFixed(h));
if (outNonFixed.length === 0) {
  lines.push(`なし（範囲外はすべて固定座標 ${fixedCoord.length} 件）`);
} else {
  for (const h of outNonFixed) {
    lines.push(`- ${h.id} ${h.name} (${h.lat}, ${h.lng}) 「${h.address}」`);
  }
}
lines.push(``);
lines.push(`## 重複座標の組（固定座標グループを除く）`);
lines.push(``);
if (realDupGroups.length === 0) {
  lines.push(`なし`);
} else {
  lines.push(`${realDupGroups.length} 組:`);
  lines.push(``);
  for (const g of realDupGroups) {
    lines.push(`- (${g.key}) ${g.hospitals.length} 件:`);
    for (const h of g.hospitals) lines.push(`  - ${h.id} ${h.name} 「${h.address}」`);
  }
}
lines.push(``);
lines.push(`## 固定座標の該当施設一覧`);
lines.push(``);
for (const h of fixedCoord) lines.push(`- ${h.id} ${h.name} (beds: ${h.beds})`);
lines.push(``);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join('\n'), 'utf-8');

console.log(`総件数: ${total}`);
console.log(`address=="nan": ${nanAddress.length}`);
console.log(`固定座標: ${fixedCoord.length}`);
console.log(`東京範囲外(固定座標除く): ${outNonFixed.length}`);
console.log(`重複座標(固定除く): ${realDupGroups.length} 組`);
console.log(`指標(${INDICATORS.length}項目)true件数: ${INDICATORS.map((k) => `${k}=${trueCounts[k]}`).join(', ')}`);
console.log(`レポート出力: ${reportPath}`);
