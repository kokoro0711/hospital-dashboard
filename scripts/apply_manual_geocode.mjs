// Node fetch がGSI APIで空レスポンスになった3件に、PowerShell(Invoke-WebRequest)で
// 取得・検証済みの座標を適用する（タイトル完全一致を確認済み）
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const hospitals = JSON.parse(readFileSync(jsonPath, 'utf-8'));

// GSI AddressSearch 2026-06-12 取得。title は復元住所と完全一致
const manual = {
  '1570050': { lat: 35.704121, lng: 139.644073 }, // 清川病院 杉並区阿佐谷南二丁目３１番１２号
  '1570480': { lat: 35.670208, lng: 139.627914 }, // ロイヤル病院 杉並区下高井戸四丁目６番２号
  '5670047': { lat: 35.572659, lng: 139.720901 }, // 蒲田リハビリテーション病院 大田区大森西四丁目１４番５号
};

let applied = 0;
for (const h of hospitals) {
  const m = manual[h.id];
  if (!m) continue;
  if (h.geo_status !== 'failed') { console.warn(`スキップ(状態が failed でない): ${h.id}`); continue; }
  h.lat = m.lat; h.lng = m.lng; h.geo_status = 'ok';
  delete h.geo_note;
  applied++;
  console.log(`✓ ${h.id} ${h.name} (${m.lat}, ${m.lng})`);
}
writeFileSync(jsonPath, JSON.stringify(hospitals, null, 2), 'utf-8');
console.log(`適用: ${applied} 件 / 残り failed=${hospitals.filter((h) => h.geo_status === 'failed').length}`);
