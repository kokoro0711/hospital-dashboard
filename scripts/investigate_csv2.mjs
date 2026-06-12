// Phase 1 調査(2): 欠損施設の行の前後・不正行の中身・行数分布を確認
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);
const normId = (s) => (s ?? '').replace(/[,\s]/g, '');

const hospitals = JSON.parse(readFileSync(join(root, 'public', 'tokyo_hospitals_100beds.json'), 'utf-8'));
const failedIds = new Set(hospitals.filter((h) => h.address === 'nan').map((h) => h.id));
const okIds = new Set(hospitals.filter((h) => h.address !== 'nan').map((h) => h.id));

// 行数分布
const counts = new Map();
for (let i = 1; i < rows.length; i++) {
  const id = normId(rows[i][1]);
  if (!id) continue;
  counts.set(id, (counts.get(id) ?? 0) + 1);
}
const dist = new Map();
for (const [, c] of counts) dist.set(c, (dist.get(c) ?? 0) + 1);
console.log('機関番号ごとの行数分布(上位):', [...dist.entries()].sort((a, b) => a[0] - b[0]).slice(0, 8));

// JSON掲載320施設のうち成功施設の行数
let okMulti = 0, okSingle = 0;
for (const id of okIds) (counts.get(id) ?? 0) > 1 ? okMulti++ : okSingle++;
console.log(`成功施設: 1行=${okSingle} / 複数行=${okMulti}`);

// 不正行（機関番号なし or 列不足）の特徴
let noId = 0, shortRow = 0;
const noIdSamples = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < 4) { shortRow++; if (noIdSamples.length < 5) noIdSamples.push({ i: i + 1, r }); continue; }
  if (!normId(r[1])) { noId++; if (noIdSamples.length < 10) noIdSamples.push({ i: i + 1, r: r.map(f => f.length > 40 ? f.slice(0, 40) + '…' : f) }); }
}
console.log(`機関番号なし行: ${noId} / 列不足行: ${shortRow}`);
console.log('サンプル:');
for (const s of noIdSamples) console.log(` row${s.i}:`, JSON.stringify(s.r));

// 欠損施設の行とその前後2行を表示（3施設分）
console.log('\n=== 欠損施設の行と前後の生データ ===');
let shown = 0;
for (let i = 1; i < rows.length && shown < 3; i++) {
  const id = normId(rows[i][1]);
  if (!failedIds.has(id)) continue;
  shown++;
  console.log(`\n--- ${id} (row ${i + 1}) ---`);
  for (let j = Math.max(1, i - 2); j <= Math.min(rows.length - 1, i + 2); j++) {
    const r = rows[j].map((f) => (f.length > 50 ? f.slice(0, 50) + '…' : f));
    console.log(` row${j + 1}${j === i ? ' ◀対象' : ''}:`, JSON.stringify(r));
  }
}

// 欠損施設の行自体の全文（1施設）
const firstFailedRow = rows.findIndex((r, idx) => idx > 0 && failedIds.has(normId(r[1])));
console.log('\n=== 欠損施設1件の行全文 ===');
console.log(JSON.stringify(rows[firstFailedRow], null, 1));
