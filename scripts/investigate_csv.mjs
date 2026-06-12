// Phase 1 調査: 抽出CSVで住所欠損64施設がどうなっているかを確認する
// 使い方: node scripts/investigate_csv.mjs "<csvパス>"

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('CSVパスを指定してください');
  process.exit(1);
}

// --- RFC4180 簡易CSVパーサ（複数行クォートフィールド対応） ---
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field.replace(/\r$/, '')); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}

let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);
const header = rows[0];
console.log(`ヘッダ: ${JSON.stringify(header)}`);
console.log(`データ行数: ${rows.length - 1}`);

// 列インデックス
const COL = { no: 0, kikanNo: 1, name: 2, addr: 3, beds: 4, juri: 5, date: 6, biko: 7 };

// 医療機関番号 "01,1004,9" → "0110049"
const normId = (s) => (s ?? '').replace(/[,\s]/g, '');

// 機関番号ごとに集約
const byId = new Map();
let badRows = 0;
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < 4) { badRows++; continue; }
  const id = normId(r[COL.kikanNo]);
  if (!id) { badRows++; continue; }
  if (!byId.has(id)) byId.set(id, []);
  byId.get(id).push({ line: i + 1, name: r[COL.name], addr: r[COL.addr], beds: r[COL.beds], juri: r[COL.juri] });
}
console.log(`ユニーク機関番号: ${byId.size} / 不正行: ${badRows}`);

// JSON側の住所欠損64施設
const hospitals = JSON.parse(readFileSync(join(root, 'public', 'tokyo_hospitals_100beds.json'), 'utf-8'));
const failed = hospitals.filter((h) => h.address === 'nan');
const ok = hospitals.filter((h) => h.address !== 'nan');
console.log(`\nJSON側: 総${hospitals.length} / 住所欠損${failed.length}`);

// 住所フィールドから郵便番号・住所部分を取り出すユーティリティ
const summarizeAddr = (addr) => {
  if (addr == null) return '(null)';
  const t = addr.trim();
  if (t === '') return '(空文字)';
  return JSON.stringify(t.length > 60 ? t.slice(0, 60) + '…' : t);
};

console.log('\n=== 住所欠損64施設のCSV上の状態 ===');
let notInCsv = 0, emptyAddr = 0, hasAddr = 0;
const samples = [];
for (const h of failed) {
  const recs = byId.get(h.id);
  if (!recs) { notInCsv++; samples.push(`- ${h.id} ${h.name}: CSVに機関番号が存在しない`); continue; }
  // 機関の代表住所: 最初に空でない addr
  const withAddr = recs.filter((r) => (r.addr ?? '').trim() !== '');
  if (withAddr.length === 0) {
    emptyAddr++;
    samples.push(`- ${h.id} ${h.name}: 全${recs.length}行で住所欄が空`);
  } else {
    hasAddr++;
    samples.push(`- ${h.id} ${h.name}: 住所あり(${withAddr.length}/${recs.length}行) 例[line ${withAddr[0].line}] ${summarizeAddr(withAddr[0].addr)}`);
  }
}
console.log(`CSVに機関番号なし: ${notInCsv} / 全行で住所欄が空: ${emptyAddr} / CSVには住所あり: ${hasAddr}`);
console.log('\n--- 明細（最初の40件） ---');
for (const s of samples.slice(0, 40)) console.log(s);

// 比較: 成功施設のCSV住所形式サンプル
console.log('\n=== (参考) 住所取得成功施設のCSV住所例 3件 ===');
for (const h of ok.slice(0, 3)) {
  const recs = byId.get(h.id) ?? [];
  const withAddr = recs.filter((r) => (r.addr ?? '').trim() !== '');
  console.log(`- ${h.id} ${h.name}: ${withAddr.length ? summarizeAddr(withAddr[0].addr) : '(CSVに住所なし)'}`);
}
