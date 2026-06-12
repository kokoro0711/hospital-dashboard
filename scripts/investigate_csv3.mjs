// Phase 1 調査(3): ずれ込んだ住所ブロック(〒...)の復元可能性を検証
// 仮説: 継続行(機関番号なし)に紛れた「孤児住所ブロック」を出現順に、
//        住所欄が空の本体行へ先入先出で割り当てれば復元できる
import { readFileSync, writeFileSync } from 'node:fs';
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

// 住所欄から〒ブロックを切り出す（〒で始まる塊ごと）
function extractBlocks(addrField) {
  if (!addrField) return [];
  const t = addrField.trim();
  if (t === '') return [];
  const parts = t.split(/(?=〒)/).map((s) => s.trim()).filter(Boolean);
  return parts;
}

// 走査
const events = []; // { type: 'orphan'|'mainEmpty'|'mainFilled'|'mainExtra', row, id, blocks }
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < 4) continue;
  const id = normId(r[1]);
  const blocks = extractBlocks(r[3]);
  if (id) {
    if (blocks.length === 0) events.push({ type: 'mainEmpty', row: i + 1, id, name: r[2]?.replace(/\n/g, '') });
    else {
      events.push({ type: 'mainFilled', row: i + 1, id, name: r[2]?.replace(/\n/g, ''), blocks });
      if (blocks.length > 1) events.push({ type: 'mainExtra', row: i + 1, id, blocks: blocks.slice(1) });
    }
  } else if (blocks.length > 0) {
    events.push({ type: 'orphan', row: i + 1, blocks });
  }
}

const mainEmpty = events.filter((e) => e.type === 'mainEmpty');
const mainFilled = events.filter((e) => e.type === 'mainFilled');
const mainMulti = mainFilled.filter((e) => e.blocks.length > 1);
const orphans = events.filter((e) => e.type === 'orphan');
const orphanBlockCount = orphans.reduce((s, e) => s + e.blocks.length, 0);
const extraBlockCount = mainMulti.reduce((s, e) => s + e.blocks.length - 1, 0);

console.log(`本体行: ${mainEmpty.length + mainFilled.length}`);
console.log(`  住所あり: ${mainFilled.length}（うち複数〒ブロック: ${mainMulti.length}, 余剰ブロック計: ${extraBlockCount}）`);
console.log(`  住所空: ${mainEmpty.length}`);
console.log(`孤児行: ${orphans.length} 行 / 孤児〒ブロック: ${orphanBlockCount} 個`);
console.log(`→ 孤児+余剰 (${orphanBlockCount + extraBlockCount}) vs 住所空 (${mainEmpty.length})`);

// FIFO割当シミュレーション: 出現順に walk し、孤児ブロックと本体行余剰ブロックをキューへ、
// 住所空の本体行が来たらキュー先頭を割当て。キューが空なら「後続の孤児」を先読み。
const queue = []; // { block, srcRow }
const assignments = new Map(); // id -> { block, srcRow, dist, direction }
const unresolved = [];
let qi = 0;
const flat = [];
for (const e of events) {
  if (e.type === 'orphan') for (const b of e.blocks) flat.push({ kind: 'block', block: b, row: e.row });
  else if (e.type === 'mainExtra') for (const b of e.blocks) flat.push({ kind: 'block', block: b, row: e.row });
  else if (e.type === 'mainEmpty') flat.push({ kind: 'need', id: e.id, name: e.name, row: e.row });
}
// 前方優先 + 必要なら後読み
const blockItems = flat.filter((f) => f.kind === 'block');
const needItems = flat.filter((f) => f.kind === 'need');
console.log(`\nflat: blocks=${blockItems.length}, needs=${needItems.length}`);

// 単純な順序対応（両者を出現順に1対1対応）
const n = Math.min(blockItems.length, needItems.length);
let distSum = 0, distMax = 0, farCount = 0;
for (let k = 0; k < n; k++) {
  const b = blockItems[k], m = needItems[k];
  const dist = Math.abs(b.row - m.row);
  distSum += dist; distMax = Math.max(distMax, dist);
  if (dist > 10) farCount++;
  assignments.set(m.id, { block: b.block, srcRow: b.srcRow ?? b.row, dist, name: m.name, row: m.row });
}
console.log(`1対1順序対応: 平均距離=${(distSum / n).toFixed(1)}行, 最大=${distMax}行, 距離>10行=${farCount}件`);

// JSON側の欠損64件がどう割当てられたか
const hospitals = JSON.parse(readFileSync(join(root, 'public', 'tokyo_hospitals_100beds.json'), 'utf-8'));
const failed = hospitals.filter((h) => h.address === 'nan');
console.log(`\n=== 欠損64施設への割当結果 ===`);
let assigned = 0;
const out = [];
for (const h of failed) {
  const a = assignments.get(h.id);
  if (!a) { out.push(`- ${h.id} ${h.name}: 割当なし`); continue; }
  assigned++;
  const oneLine = a.block.replace(/\n/g, ' ');
  out.push(`- ${h.id} ${h.name} [dist=${a.dist}] ${oneLine}`);
}
console.log(`割当成功: ${assigned}/${failed.length}`);
for (const line of out) console.log(line);

// 割当全体を JSON で保存（後段のジオコーディング検証用）
const dump = [...assignments.entries()].map(([id, a]) => ({ id, name: a.name, row: a.row, dist: a.dist, block: a.block }));
writeFileSync(join(root, 'data', 'recovered_addresses_draft.json'), JSON.stringify(dump, null, 2), 'utf-8');
console.log(`\n全${dump.length}件の割当ドラフトを data/recovered_addresses_draft.json に保存`);
