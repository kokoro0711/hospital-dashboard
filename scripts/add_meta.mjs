// Phase 2 準備: データに出典メタ情報を付与し、スキーマを { meta, hospitals } へ移行する。
// あわせて robot_surgery を指標から除外する（出典「届出受理状況」に手術支援ロボットの
// 施設基準が存在せず、全件 false は実態でなく欠損のため。検証: scripts/check_robot.mjs）。
// 冪等: すでに meta があれば hospitals 配列を対象に再生成する。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'public', 'tokyo_hospitals_100beds.json');
const backupPath = join(root, 'data', 'tokyo_hospitals_pre_meta.backup.json');

const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
const hospitals = Array.isArray(raw) ? raw : raw.hospitals;
if (!Array.isArray(hospitals)) { console.error('hospitals配列が見つかりません'); process.exit(1); }

if (!existsSync(backupPath)) {
  writeFileSync(backupPath, JSON.stringify(raw, null, 2), 'utf-8');
  console.log(`バックアップ: ${backupPath}`);
}

// robot_surgery を除外
let removed = 0;
for (const h of hospitals) {
  if (h.investments && 'robot_surgery' in h.investments) { delete h.investments.robot_surgery; removed++; }
}
console.log(`robot_surgery を ${removed} 件から除外`);

const okCount = hospitals.filter((h) => h.geo_status === 'ok' || (h.lat != null && h.lng != null && h.geo_status !== 'failed')).length;
const failedCount = hospitals.filter((h) => h.geo_status === 'failed').length;

const meta = {
  title: '東京都 病院IT投資マップ',
  source: '厚生労働省 関東信越厚生局「施設基準の届出受理状況（医科）」東京都',
  sourceUrl: 'https://kouseikyoku.mhlw.go.jp/kantoshinetsu/iryo_shido/sisetukijyunntodokede.html',
  sourceFile: '13shisetsu_ika_tokyo_r0804.pdf',
  period: '令和8年3月1日時点',
  periodISO: '2026-03-01',
  filter: '東京都内・一般病床100床以上',
  recordCount: hospitals.length,
  geocodedOk: okCount,
  geocodedFailed: failedCount,
  geocoder: '国土地理院 住所検索API (msearch.gsi.go.jp)',
  generatedBy: 'pdfplumber + Python ETL (Google Colab) / 座標再構築・再ジオコーディング: scripts/fix_data.mjs',
  fetchedAt: '2026-06-12',
  notes: '手術支援ロボット（ロボット手術）は本出典に収載がないため指標から除外。各指標の boolean は当該加算等の「届出受理あり(true)/受理なし(false)」を表す。',
  indicators: {
    medical_dx: '医療DX推進体制整備加算',
    online_medical: 'オンライン資格確認',
    electronic_record: '電子カルテ情報共有',
    outpatient_chemo: '外来化学療法',
    remote_care: '遠隔医療',
    data_submission: 'データ提出加算',
  },
  license: '出典データは公的機関の公表資料に基づく。座標は国土地理院APIによる推定値を含み、番地未確定の施設は丁目・大字レベルの場合がある。',
};

const out = { meta, hospitals };
writeFileSync(jsonPath, JSON.stringify(out, null, 2), 'utf-8');
console.log(`書き込み完了: ${jsonPath}`);
console.log(`  recordCount=${meta.recordCount}, geocodedOk=${okCount}, failed=${failedCount}`);
console.log(`  indicators=${Object.keys(meta.indicators).length}項目`);
