<template>
  <div class="apple-ui relative w-full h-screen bg-[#f5f5f7] overflow-hidden text-gray-900">
    <ClientOnly>
      <div id="map" class="absolute inset-0 z-0"></div>
    </ClientOnly>

    <!-- パネルを開くボタン（パネル非表示時のみ） -->
    <button
      v-show="!panelOpen"
      @click="panelOpen = true"
      class="absolute top-5 left-5 z-[1001] flex items-center gap-2 pl-3 pr-4 py-2 bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-1 ring-black/5 text-sm font-medium text-gray-800 hover:bg-white/90 transition-colors"
    >
      <span class="text-lg leading-none">☰</span> メニュー
    </button>

    <!-- 左上: コントロールパネル -->
    <transition name="slide-left">
      <div v-show="panelOpen" class="absolute top-5 left-5 z-[1000] w-[21rem] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-7.5rem)] overflow-y-auto bg-white/70 backdrop-blur-2xl backdrop-saturate-150 rounded-[1.375rem] shadow-[0_8px_40px_rgba(0,0,0,0.16)] ring-1 ring-black/5">
      <div class="p-5">
        <div class="flex items-center justify-between gap-2 mb-3">
          <span class="text-[11px] font-medium text-gray-400 tracking-wide">DASHBOARD</span>
          <button
            @click="panelOpen = false"
            class="flex items-center gap-1 text-[13px] text-gray-500 hover:text-gray-800 px-2.5 py-1 rounded-full hover:bg-black/5 transition-colors"
            aria-label="パネルを隠す"
            title="地図を広く見る"
          >‹ 隠す</button>
        </div>
        <h1 class="text-[1.6rem] font-semibold text-gray-900 tracking-[-0.02em] leading-tight">
          {{ meta?.title || '東京都 病院IT投資マップ' }}
        </h1>
        <p class="text-[13px] text-gray-500 mt-1">{{ meta?.filter || '100床以上の主要病院' }}</p>

        <!-- 検索 -->
        <div class="mt-5">
          <label class="text-[13px] font-medium text-gray-500">病院名・住所で検索</label>
          <div class="relative mt-1.5">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="リハビリ、青梅市、〇〇病院"
              class="w-full px-3.5 py-2.5 pr-9 text-[14px] bg-black/[0.04] rounded-xl border-0 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/60 transition-shadow"
            />
            <button
              v-if="searchQuery"
              @click="searchQuery = ''"
              class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-gray-400/80 text-white text-xs leading-none hover:bg-gray-500"
              aria-label="検索クリア"
            >×</button>
          </div>
        </div>

        <!-- 指標切替 -->
        <div class="mt-4">
          <label class="text-[13px] font-medium text-gray-500">色分けする指標</label>
          <div class="relative mt-1.5">
            <select
              v-model="selectedIndicator"
              class="w-full appearance-none px-3.5 py-2.5 pr-9 text-[14px] bg-black/[0.04] rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/60 cursor-pointer"
            >
              <option v-for="(label, key) in indicators" :key="key" :value="key">{{ label }}</option>
            </select>
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⌄</span>
          </div>
        </div>

        <!-- 集積範囲リング表示トグル -->
        <div class="mt-4 flex items-start justify-between gap-3">
          <div>
            <span class="text-[14px] text-gray-800">集積範囲をリング表示</span>
            <p v-if="showRings" class="text-[12px] text-gray-500 mt-0.5 leading-snug">
              「{{ indicators[selectedIndicator] }}」が{{ ringMinCount }}件以上集まる範囲を{{ ringCount }}箇所表示中
            </p>
          </div>
          <label class="shrink-0 cursor-pointer select-none mt-0.5">
            <span class="relative inline-block w-[51px] h-[31px]">
              <input type="checkbox" v-model="showRings" class="sr-only peer" />
              <span class="absolute inset-0 rounded-full bg-black/15 peer-checked:bg-[#34C759] transition-colors duration-200"></span>
              <span class="absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] transition-transform duration-200 peer-checked:translate-x-[20px]"></span>
            </span>
          </label>
        </div>

        <!-- 統計サマリ -->
        <div class="mt-5 grid grid-cols-3 gap-2 text-center">
          <div class="rounded-2xl bg-black/[0.04] py-2.5">
            <div class="text-[1.35rem] font-semibold tracking-tight" style="color:#C65300">{{ stats.yes }}</div>
            <div class="text-[11px] text-gray-500 mt-0.5">該当</div>
          </div>
          <div class="rounded-2xl bg-black/[0.04] py-2.5">
            <div class="text-[1.35rem] font-semibold tracking-tight" style="color:#0060A0">{{ stats.no }}</div>
            <div class="text-[11px] text-gray-500 mt-0.5">非該当</div>
          </div>
          <div class="rounded-2xl bg-black/[0.04] py-2.5">
            <div class="text-[1.35rem] font-semibold tracking-tight text-gray-600">{{ filteredCount }}</div>
            <div class="text-[11px] text-gray-500 mt-0.5">表示中</div>
          </div>
        </div>

        <!-- 凡例（3状態を明示・色＋形状で冗長化） -->
        <div class="mt-5 pt-4 border-t border-black/[0.07]">
          <h2 class="text-[13px] font-medium text-gray-500 mb-2.5">凡例</h2>
          <div class="space-y-2">
            <div class="flex items-center gap-2.5">
              <span v-html="legendSwatch('yes')"></span>
              <span class="text-[13px] text-gray-700">該当（{{ indicators[selectedIndicator] }}の届出あり）</span>
            </div>
            <div class="flex items-center gap-2.5">
              <span v-html="legendSwatch('no')"></span>
              <span class="text-[13px] text-gray-700">非該当（届出なし）</span>
            </div>
            <div class="flex items-center gap-2.5">
              <span v-html="legendSwatch('unknown')"></span>
              <span class="text-[13px] text-gray-700">未確認（データなし）</span>
            </div>
          </div>
        </div>

        <!-- 位置要確認リスト -->
        <div class="mt-4 pt-4 border-t border-black/[0.07]">
          <button
            @click="showUnlocated = !showUnlocated"
            class="w-full flex items-center justify-between text-[13px] font-medium"
            :class="unlocated.length ? 'text-amber-600' : 'text-gray-500'"
          >
            <span>位置未確認の施設</span>
            <span class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-full text-white text-[11px] font-semibold" :class="unlocated.length ? 'bg-amber-500' : 'bg-gray-300'">{{ unlocated.length }}</span>
              <span class="text-gray-400 text-[10px]">{{ showUnlocated ? '▲' : '▼' }}</span>
            </span>
          </button>
          <div v-if="showUnlocated" class="mt-2">
            <p v-if="!unlocated.length" class="text-[12px] text-gray-500 leading-relaxed">
              全施設の座標が確認済みです（地図上の点はすべて位置特定済み）。
            </p>
            <ul v-else class="space-y-1 max-h-40 overflow-y-auto">
              <li v-for="h in unlocated" :key="h.id" class="text-[12px] text-gray-600">
                <span class="font-medium">{{ h.name }}</span>
                <span class="text-gray-400"> — {{ h.geo_note || '座標未取得' }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </transition>

    <!-- 右: 施設詳細サイドパネル -->
    <transition name="slide">
      <div
        v-if="selected"
        class="absolute top-5 right-5 z-[1000] w-[22rem] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-7.5rem)] overflow-y-auto bg-white/75 backdrop-blur-2xl backdrop-saturate-150 rounded-[1.375rem] shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5"
      >
        <div class="p-5">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[1.05rem] font-semibold text-gray-900 leading-snug tracking-[-0.01em]">{{ selected.name }}</h3>
            <button @click="selected = null" class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-black/5 text-gray-500 text-lg leading-none hover:bg-black/10 transition-colors" aria-label="閉じる">×</button>
          </div>
          <p class="text-[12px] text-gray-500 mt-2 leading-relaxed">
            <span v-if="selected.postal">〒{{ selected.postal }}　</span>{{ selected.address }}
          </p>
          <div class="mt-3 flex flex-wrap gap-1.5 text-[12px]">
            <span class="px-2.5 py-1 rounded-full bg-black/5 text-gray-700">🛏 {{ selected.beds }}床</span>
            <span class="px-2.5 py-1 rounded-full bg-black/5 text-gray-500">ID: {{ selected.id }}</span>
            <span v-if="selected.geo_status === 'ok'" class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700">📍 位置確認済</span>
            <span v-else class="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700">📍 位置未確認</span>
          </div>

          <div class="mt-5">
            <h4 class="text-[13px] font-medium text-gray-500 mb-2.5">IT・施設基準 届出状況</h4>
            <ul class="space-y-2.5">
              <li v-for="(label, key) in indicators" :key="key" class="flex items-center justify-between">
                <span class="text-[14px]" :class="key === selectedIndicator ? 'text-gray-900 font-semibold' : 'text-gray-700'">{{ label }}</span>
                <span
                  class="text-[12px] px-2.5 py-0.5 rounded-full font-medium"
                  :class="selected.investments?.[key]
                    ? 'bg-orange-500/15 text-orange-700'
                    : 'bg-sky-500/12 text-sky-700'"
                >{{ selected.investments?.[key] ? '届出あり' : '届出なし' }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </transition>

    <!-- 出典フッター（常時表示） -->
    <div class="absolute bottom-0 left-0 right-0 z-[1000] bg-white/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-black/[0.08] text-gray-500 text-[11px] px-5 py-2.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span class="font-semibold text-gray-700">出典</span>
        <a v-if="meta?.sourceUrl" :href="meta.sourceUrl" target="_blank" rel="noopener" class="text-[#0071e3] hover:underline">
          {{ meta?.source }}
        </a>
        <span v-else>{{ meta?.source }}</span>
        <span class="text-gray-300">·</span>
        <span>対象時点: {{ meta?.period }}</span>
        <span class="text-gray-300">·</span>
        <span>対象: {{ meta?.recordCount }}施設</span>
        <span class="text-gray-300">·</span>
        <span>取得日: {{ meta?.fetchedAt }}</span>
        <span class="text-gray-300">·</span>
        <span>座標: {{ meta?.geocoder }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

// --- 型定義 ---
interface Hospital {
  id: string
  name: string
  address: string
  postal?: string
  lat: number | null
  lng: number | null
  beds: number
  geo_status?: 'ok' | 'failed'
  geo_note?: string
  investments: Record<string, boolean>
}
interface Meta {
  title?: string
  source?: string
  sourceUrl?: string
  period?: string
  recordCount?: number
  fetchedAt?: string
  filter?: string
  geocoder?: string
  indicators?: Record<string, string>
}

// --- 色覚バリアフリー配色（Okabe-Ito 由来。赤×青を避け、オレンジ×青×グレー＋形状で冗長化） ---
const COLORS = { yes: '#D55E00', no: '#0072B2', unknown: '#9AA0A6' } as const
type State = keyof typeof COLORS

// --- リアクティブ状態 ---
const hospitals = ref<Hospital[]>([])
const meta = ref<Meta | null>(null)
const indicators = ref<Record<string, string>>({
  medical_dx: '医療DX推進体制整備加算',
  online_medical: 'オンライン資格確認',
  electronic_record: '電子カルテ情報共有',
  outpatient_chemo: '外来化学療法',
  remote_care: '遠隔医療',
  data_submission: 'データ提出加算',
})
const selectedIndicator = ref<string>('medical_dx')
const searchQuery = ref('')
const selected = ref<Hospital | null>(null)
const showUnlocated = ref(false)
const panelOpen = ref(true)
const showRings = ref(false)
const ringCount = ref(0)
const ringMinCount = 4

// --- 派生値 ---
const stateOf = (h: Hospital): State => {
  const v = h.investments?.[selectedIndicator.value]
  if (v === true) return 'yes'
  if (v === false) return 'no'
  return 'unknown'
}
const normalize = (s: string) => (s || '').toLowerCase()
const matchesSearch = (h: Hospital) => {
  const q = normalize(searchQuery.value).trim()
  if (!q) return true
  return normalize(h.name).includes(q) || normalize(h.address).includes(q)
}
const plotted = computed(() => hospitals.value.filter((h) => h.lat != null && h.lng != null && h.geo_status !== 'failed'))
const filtered = computed(() => plotted.value.filter(matchesSearch))
const filteredCount = computed(() => filtered.value.length)
const unlocated = computed(() => hospitals.value.filter((h) => h.geo_status === 'failed' || h.lat == null || h.lng == null))
const stats = computed(() => {
  let yes = 0, no = 0, unknown = 0
  for (const h of filtered.value) {
    const s = stateOf(h)
    if (s === 'yes') yes++; else if (s === 'no') no++; else unknown++
  }
  return { yes, no, unknown }
})

// --- マーカーHTML（状態ごとに色＋形状を変える） ---
function markerHtml(state: State, highlight = false) {
  const c = COLORS[state]
  const ring = highlight ? 'box-shadow:0 0 0 3px rgba(56,189,248,.7),0 2px 4px rgba(0,0,0,.3);' : 'box-shadow:0 2px 4px rgba(0,0,0,.3);'
  if (state === 'yes') {
    // 該当: 塗りつぶし円
    return `<div style="background:${c};width:15px;height:15px;border-radius:50%;border:2px solid #fff;${ring}"></div>`
  }
  if (state === 'no') {
    // 非該当: リング（中空）
    return `<div style="background:#fff;width:15px;height:15px;border-radius:50%;border:4px solid ${c};${ring}"></div>`
  }
  // 未確認: 角丸の四角
  return `<div style="background:${c};width:13px;height:13px;border-radius:3px;border:2px solid #fff;transform:rotate(45deg);${ring}"></div>`
}
function legendSwatch(state: State) {
  return `<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center">${markerHtml(state)}</span>`
}

// --- Leaflet（非リアクティブに保持） ---
let L: any = null
let map: any = null
let clusterGroup: any = null
let ringGroup: any = null

// 該当施設が地理的に集積する範囲を貪欲法でクラスタ化し、リング（円）で表示する
function rebuildRings() {
  if (!ringGroup || !L) return
  ringGroup.clearLayers()
  if (!showRings.value) { ringCount.value = 0; return }

  const pts = filtered.value.filter((h) => stateOf(h) === 'yes')
  const R = 2500 // クラスタ判定半径(m)
  const used = new Array(pts.length).fill(false)
  const color = COLORS.yes
  let rings = 0

  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue
    const anchor = L.latLng(pts[i].lat, pts[i].lng)
    const members: number[] = []
    for (let j = 0; j < pts.length; j++) {
      if (used[j]) continue
      if (anchor.distanceTo(L.latLng(pts[j].lat, pts[j].lng)) <= R) members.push(j)
    }
    if (members.length >= ringMinCount) {
      members.forEach((j) => (used[j] = true))
      let la = 0, ln = 0
      members.forEach((j) => { la += pts[j].lat; ln += pts[j].lng })
      const center = L.latLng(la / members.length, ln / members.length)
      let maxd = 0
      members.forEach((j) => { maxd = Math.max(maxd, center.distanceTo(L.latLng(pts[j].lat, pts[j].lng))) })
      const radius = Math.max(maxd + 350, 800)
      L.circle(center, {
        radius, color, weight: 2, dashArray: '6 5',
        fillColor: color, fillOpacity: 0.08, interactive: false,
      }).addTo(ringGroup)
      const label = L.divIcon({
        className: 'ring-label',
        html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${members.length}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      })
      L.marker(center, { icon: label, interactive: false, zIndexOffset: -1000 }).addTo(ringGroup)
      rings++
    } else {
      used[i] = true
    }
  }
  ringCount.value = rings
}

function rebuildMarkers() {
  if (!clusterGroup || !L) return
  clusterGroup.clearLayers()
  for (const h of filtered.value) {
    const state = stateOf(h)
    const icon = L.divIcon({
      className: 'custom-marker',
      html: markerHtml(state),
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    })
    const marker = L.marker([h.lat, h.lng], { icon })
    marker.on('click', () => { selected.value = h })
    clusterGroup.addLayer(marker)
  }
}

watch([selectedIndicator, searchQuery], () => { rebuildMarkers(); rebuildRings() })
watch(showRings, rebuildRings)

onMounted(async () => {
  L = (await import('leaflet')).default
  await import('leaflet.markercluster')

  map = L.map('map', { zoomControl: false }).setView([35.6894, 139.6917], 11)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>",
    maxZoom: 18,
  }).addTo(map)

  // リングはマーカーより下に置く（先に追加）
  ringGroup = L.layerGroup()
  map.addLayer(ringGroup)

  clusterGroup = L.markerClusterGroup({
    maxClusterRadius: 45,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
  })
  map.addLayer(clusterGroup)

  try {
    const response = await fetch('/tokyo_hospitals_100beds.json')
    if (!response.ok) throw new Error('Failed to fetch data')
    const data = await response.json()
    // 新スキーマ {meta, hospitals} / 旧スキーマ(配列) の両対応
    const list: Hospital[] = Array.isArray(data) ? data : data.hospitals
    hospitals.value = list
    if (!Array.isArray(data) && data.meta) {
      meta.value = data.meta
      if (data.meta.indicators) indicators.value = data.meta.indicators
    }
    rebuildMarkers()
    rebuildRings()
  } catch (error) {
    console.error('データの読み込みに失敗しました:', error)
  }
})
</script>

<style>
/* Apple風システムフォント（日本語は Hiragino → Noto/メイリオ にフォールバック） */
.apple-ui {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
    "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Hiragino Sans",
    "Noto Sans JP", Meiryo, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.leaflet-container {
  background: #f5f5f7;
  font-family: inherit;
}
.custom-marker { background: transparent; border: none; }
.slide-enter-active, .slide-leave-active { transition: all .25s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateX(16px) scale(0.98); }
.slide-left-enter-active, .slide-left-leave-active { transition: all .25s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-left-enter-from, .slide-left-leave-to { opacity: 0; transform: translateX(-16px) scale(0.98); }
.ring-label { background: transparent; border: none; }

/* Leaflet コントロールを Apple 風（すりガラス・丸み）に */
.leaflet-control-zoom {
  border: none !important;
  border-radius: 14px !important;
  overflow: hidden;
  box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important;
  backdrop-filter: blur(20px) saturate(1.5);
}
.leaflet-control-zoom a {
  background: rgba(255,255,255,0.7) !important;
  color: #1d1d1f !important;
  border: none !important;
  width: 34px; height: 34px; line-height: 34px;
  font-weight: 500;
}
.leaflet-control-zoom a:hover { background: rgba(255,255,255,0.92) !important; }
.leaflet-control-attribution {
  background: rgba(255,255,255,0.6) !important;
  backdrop-filter: blur(10px);
  border-radius: 8px 0 0 0;
  font-size: 10px;
}

/* マーカークラスタを配色トーン＋すりガラス調に */
.marker-cluster {
  backdrop-filter: blur(2px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.marker-cluster div { font-weight: 600; }
.marker-cluster-small { background: rgba(0,114,178,.22); }
.marker-cluster-small div { background: rgba(0,114,178,.78); color: #fff; }
.marker-cluster-medium { background: rgba(213,94,0,.22); }
.marker-cluster-medium div { background: rgba(213,94,0,.78); color: #fff; }
.marker-cluster-large { background: rgba(213,94,0,.28); }
.marker-cluster-large div { background: rgba(213,94,0,.88); color: #fff; }
</style>
