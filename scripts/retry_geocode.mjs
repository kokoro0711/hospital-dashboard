// geo_status=="failed" のレコードのみGSIジオコーディングを再試行する
// 使い方: node scripts/retry_geocode.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const hospitals = JSON.parse(readFileSync(jsonPath, 'utf-8'));

const TOKYO = { latMin: 35.45, latMax: 35.95, lngMin: 138.9, lngMax: 139.95 };
const muniRe = /^(.+?[区市町村郡])/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(address, attempts = 3) {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(address)}`;
  for (let a = 1; a <= attempts; a++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'hospital-dashboard-pipeline (research)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) return null;
      const [lng, lat] = json[0].geometry.coordinates;
      return { lat, lng, title: json[0].properties?.title ?? '' };
    } catch (e) {
      if (a === attempts) throw e;
      await sleep(1500 * a);
    }
  }
}

const targets = hospitals.filter((h) => h.geo_status === 'failed');
console.log(`再試行対象: ${targets.length} 件`);
let fixed = 0;
for (const h of targets) {
  const query = `東京都${h.address}`;
  let geo = null, err = null;
  try { geo = await geocode(query); } catch (e) { err = String(e); }
  const muni = h.address.match(muniRe)?.[1];
  if (geo && geo.lat >= TOKYO.latMin && geo.lat <= TOKYO.latMax &&
      geo.lng >= TOKYO.lngMin && geo.lng <= TOKYO.lngMax &&
      (!muni || geo.title.includes(muni))) {
    h.lat = geo.lat; h.lng = geo.lng; h.geo_status = 'ok';
    delete h.geo_note;
    fixed++;
    console.log(`  ✓ ${h.id} ${h.name.slice(0, 24)} (${geo.lat}, ${geo.lng}) ${geo.title}`);
  } else {
    h.geo_note = err ? `APIエラー: ${err}` : geo ? `検証不通過: ${geo.title}` : '該当なし';
    console.log(`  ✗ ${h.id} ${h.name.slice(0, 24)} ${h.geo_note}`);
  }
  await sleep(500);
}
writeFileSync(jsonPath, JSON.stringify(hospitals, null, 2), 'utf-8');
console.log(`\n回収: ${fixed}/${targets.length} / 残り failed=${hospitals.filter((h) => h.geo_status === 'failed').length}`);
