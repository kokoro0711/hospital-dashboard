// robot_surgery 出所検証: CSV内の「ロボ」届出を持つ施設を特定する
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
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

let text = readFileSync(csvPath, 'utf-8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
const rows = parseCsv(text);
const normId = (s) => (s ?? '').replace(/[,\s]/g, '');

const hospitals = JSON.parse(readFileSync(join(root, 'public', 'tokyo_hospitals_100beds.json'), 'utf-8'));
const inJson = new Map(hospitals.map((h) => [h.id, h]));

let lastId = '', lastName = '';
for (const r of rows) {
  if (r.length < 6) continue;
  const id = normId(r[1]);
  if (id) { lastId = id; lastName = (r[2] ?? '').replace(/\n/g, ''); }
  const juri = r[5] ?? '';
  for (const m of juri.matchAll(/（[^）]*ロボ[^）]*）第?[^\n]*/g)) {
    const h = inJson.get(lastId);
    console.log(`${lastId} ${lastName} | ${m[0].trim()} | JSON掲載=${h ? `あり(robot_surgery=${h.investments.robot_surgery})` : 'なし'}`);
  }
}
