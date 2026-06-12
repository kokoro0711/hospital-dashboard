// Phase 1 修復スクリプト
// 使い方: node scripts/fix_data.mjs "<抽出CSVパス>"
//
// 1. 抽出CSVからずれ込んだ住所ブロック(〒...)をFIFO復元（investigate_csv3.mjs で検証済み:
//    住所空の本体行 11,375 = 孤児+余剰ブロック 11,375 が完全一致、順序対応の最大ズレ8行）
// 2. address=="nan" の64施設に住所を割当て、機関番号プレフィックスの地域整合性を検証
// 3. GSI API (msearch.gsi.go.jp) で再ジオコーディング。結果は東京本土範囲で妥当性確認
// 4. 失敗分は lat/lng=null, geo_status="failed"。成功分は geo_status="ok"
// 5. 元ファイルを data/tokyo_hospitals_100beds.backup.json に保存してから上書き

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const csvPath = process.argv[2];
const jsonPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const backupPath = join(root, 'data', 'tokyo_hospitals_100beds.backup.json');

if (!csvPath) { console.error('CSVパスを指定してください'); process.exit(1); }

// --- CSVパース ---
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
const normId = (s) => (s ?? '').replace(/[,\s]/g, '');
const extractBlocks = (f) => {
  if (!f || f.trim() === '') return [];
  return f.trim().split(/(?=〒)/).map((s) => s.trim()).filter(Boolean);
};

// --- FIFO復元 ---
let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);
const blockItems = [], needItems = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (r.length < 4) continue;
  const id = normId(r[1]);
  const blocks = extractBlocks(r[3]);
  if (id) {
    if (blocks.length === 0) needItems.push({ id, row: i + 1 });
    else for (const b of blocks.slice(1)) blockItems.push({ block: b, row: i + 1 });
  } else {
    for (const b of blocks) blockItems.push({ block: b, row: i + 1 });
  }
}
if (blockItems.length !== needItems.length) {
  console.error(`整合性エラー: ブロック${blockItems.length} != 空行${needItems.length}。中断します。`);
  process.exit(1);
}
const recovered = new Map();
for (let k = 0; k < needItems.length; k++) recovered.set(needItems[k].id, blockItems[k].block);
console.log(`FIFO復元: ${recovered.size} 件（ブロック数=空行数=${blockItems.length} 一致確認済み）`);

// --- 住所ブロックのパース: 〒行 / 住所行 / 電話行 に分解 ---
function parseBlock(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  let postal = null;
  const addrLines = [];
  for (const line of lines) {
    if (line.startsWith('〒')) { postal = line.replace(/^〒/, '').replace(/[－ｰ—–]/g, '-').trim(); continue; }
    if (/^[0-9０-９][0-9０-９\-()（）\s]*$/.test(line)) continue; // 電話番号行
    addrLines.push(line);
  }
  // PDF折返し由来の空白を除去して連結
  const address = addrLines.join('').replace(/\s+/g, '');
  return { postal, address };
}

// --- JSON読込・地域整合性チェック ---
const hospitals = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const muniRe = /^(.+?[区市町村郡])/;
// 機関番号プレフィックス(2桁)→住所取得済み施設の市区町村集合
const prefixMuni = new Map();
for (const h of hospitals) {
  if (h.address === 'nan') continue;
  const m = h.address.match(muniRe);
  if (!m) continue;
  const p = h.id.slice(0, 2);
  if (!prefixMuni.has(p)) prefixMuni.set(p, new Set());
  prefixMuni.get(p).add(m[1]);
}

const failed = hospitals.filter((h) => h.address === 'nan');
console.log(`住所欠損: ${failed.length} 件`);
const targets = [];
let muniWarn = 0;
for (const h of failed) {
  const block = recovered.get(h.id);
  if (!block) { console.error(`  復元なし: ${h.id} ${h.name}`); continue; }
  const { postal, address } = parseBlock(block);
  const m = address.match(muniRe);
  const muni = m ? m[1] : null;
  const known = prefixMuni.get(h.id.slice(0, 2));
  const consistent = !known || !muni ? null : known.has(muni);
  if (consistent === false) {
    muniWarn++;
    console.warn(`  [地域不整合] ${h.id} ${h.name}: 復元住所=${muni} / 同プレフィックス既知=${[...known].join(',')}`);
  }
  targets.push({ h, postal, address, muni, consistent });
}
console.log(`地域整合性: 不整合 ${muniWarn} 件 / 対象 ${targets.length} 件`);

// --- GSIジオコーディング ---
const TOKYO = { latMin: 35.45, latMax: 35.95, lngMin: 138.9, lngMax: 139.95 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address) {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'hospital-dashboard-pipeline (research; contact via repo)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!Array.isArray(json) || json.length === 0) return null;
  const top = json[0];
  const [lng, lat] = top.geometry.coordinates;
  return { lat, lng, title: top.properties?.title ?? '' };
}

console.log('\nGSIジオコーディング開始...');
const results = [];
for (const t of targets) {
  const query = `東京都${t.address}`;
  let geo = null, error = null;
  try {
    geo = await geocode(query);
  } catch (e) {
    error = String(e);
  }
  let status = 'failed', reason = '';
  if (error) reason = `APIエラー: ${error}`;
  else if (!geo) reason = '該当なし';
  else if (geo.lat < TOKYO.latMin || geo.lat > TOKYO.latMax || geo.lng < TOKYO.lngMin || geo.lng > TOKYO.lngMax) {
    reason = `範囲外: (${geo.lat}, ${geo.lng}) ${geo.title}`;
  } else if (t.muni && !geo.title.includes(t.muni)) {
    reason = `市区町村不一致: 結果="${geo.title}" 期待="${t.muni}"`;
  } else {
    status = 'ok';
  }
  results.push({ ...t, geo, status, reason });
  console.log(`  ${status === 'ok' ? '✓' : '✗'} ${t.h.id} ${t.h.name.slice(0, 20)} ${status === 'ok' ? `(${geo.lat}, ${geo.lng}) ${geo.title}` : reason}`);
  await sleep(300);
}
const okCount = results.filter((r) => r.status === 'ok').length;
console.log(`\nジオコーディング成功: ${okCount}/${results.length}`);

// --- 適用 ---
if (!existsSync(backupPath)) {
  writeFileSync(backupPath, readFileSync(jsonPath), 'utf-8');
  console.log(`バックアップ: ${backupPath}`);
}
const byId = new Map(results.map((r) => [r.h.id, r]));
for (const h of hospitals) {
  const r = byId.get(h.id);
  if (!r) { h.geo_status = 'ok'; continue; } // 既存正常レコード
  h.address = r.address;            // "nan" を復元住所で置換（〒・電話は含めない）
  if (r.postal) h.postal = r.postal;
  if (r.status === 'ok') {
    h.lat = r.geo.lat;
    h.lng = r.geo.lng;
    h.geo_status = 'ok';
  } else {
    h.lat = null;
    h.lng = null;
    h.geo_status = 'failed';
    h.geo_note = r.reason;
  }
}
writeFileSync(jsonPath, JSON.stringify(hospitals, null, 2), 'utf-8');
console.log(`書き込み完了: ${jsonPath}（${hospitals.length}件, geo_status failed=${hospitals.filter((h) => h.geo_status === 'failed').length}）`);
