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
            <button v-if="searchQuery" @click="searchQuery = ''" class="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 rounded-full bg-gray-400/80 text-white text-xs leading-none hover:bg-gray-500" aria-label="検索クリア">×</button>
          </div>
        </div>

        <!-- 表示モード（セグメント） -->
        <div class="mt-4">
          <label class="text-[13px] font-medium text-gray-500">地図の色分け</label>
          <div class="mt-1.5 grid grid-cols-3 gap-1 p-1 bg-black/[0.04] rounded-xl">
            <button v-for="m in displayModes" :key="m.key" @click="displayMode = m.key"
              class="py-1.5 text-[12.5px] rounded-lg transition-colors"
              :class="displayMode === m.key ? 'bg-white shadow-sm font-semibold text-gray-900' : 'text-gray-500 hover:text-gray-700'">
              {{ m.label }}
            </button>
          </div>
        </div>

        <!-- 指標選択（指標モード時） -->
        <div v-show="displayMode === 'indicator'" class="mt-3">
          <div class="relative">
            <select v-model="selectedIndicator" class="w-full appearance-none px-3.5 py-2.5 pr-9 text-[14px] bg-black/[0.04] rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/60 cursor-pointer">
              <optgroup label="IT・医療DX">
                <option v-for="(label, key) in indicators" :key="key" :value="key">{{ label }}</option>
              </optgroup>
              <optgroup label="診療機能">
                <option v-for="(label, key) in functions" :key="key" :value="key">{{ label }}</option>
              </optgroup>
            </select>
            <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⌄</span>
          </div>

          <!-- 集積リング -->
          <div class="mt-3 flex items-start justify-between gap-3">
            <div>
              <span class="text-[14px] text-gray-800">集積範囲をリング表示</span>
              <p v-if="showRings" class="text-[12px] text-gray-500 mt-0.5 leading-snug">該当が{{ ringMinCount }}件以上集まる範囲を{{ ringCount }}箇所表示中</p>
            </div>
            <label class="shrink-0 cursor-pointer select-none mt-0.5">
              <span class="relative inline-block w-[51px] h-[31px]">
                <input type="checkbox" v-model="showRings" class="sr-only peer" />
                <span class="absolute inset-0 rounded-full bg-black/15 peer-checked:bg-[#34C759] transition-colors duration-200"></span>
                <span class="absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] transition-transform duration-200 peer-checked:translate-x-[20px]"></span>
              </span>
            </label>
          </div>
        </div>

        <!-- 凡例（モード別） -->
        <div class="mt-4 pt-4 border-t border-black/[0.07]">
          <h2 class="text-[13px] font-medium text-gray-500 mb-2.5">凡例</h2>
          <div v-if="displayMode === 'indicator'" class="space-y-2">
            <div class="flex items-center gap-2.5"><span v-html="legendSwatch('yes')"></span><span class="text-[13px] text-gray-700">該当（{{ currentLabel }}の届出あり）</span></div>
            <div class="flex items-center gap-2.5"><span v-html="legendSwatch('no')"></span><span class="text-[13px] text-gray-700">非該当（届出なし）</span></div>
            <div class="flex items-center gap-2.5"><span v-html="legendSwatch('unknown')"></span><span class="text-[13px] text-gray-700">未確認（データなし）</span></div>
          </div>
          <div v-else-if="displayMode === 'score'">
            <div class="flex items-center gap-1">
              <span v-for="s in 7" :key="s" class="flex-1 h-4 first:rounded-l-md last:rounded-r-md" :style="{ background: scoreColor(s - 1) }"></span>
            </div>
            <div class="flex justify-between text-[11px] text-gray-500 mt-1"><span>0（低）</span><span>IT成熟度スコア</span><span>6（高）</span></div>
          </div>
          <div v-else class="grid grid-cols-2 gap-x-2 gap-y-2">
            <div v-for="t in typeOrder" :key="t" class="flex items-center gap-2"><span v-html="typeSwatch(t)"></span><span class="text-[13px] text-gray-700">{{ t }}</span></div>
          </div>
        </div>

        <!-- 統計サマリ -->
        <div class="mt-4 grid grid-cols-3 gap-2 text-center">
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

        <!-- 絞り込み -->
        <div class="mt-4 pt-4 border-t border-black/[0.07]">
          <button @click="showFilters = !showFilters" class="w-full flex items-center justify-between text-[13px] font-medium text-gray-600">
            <span>絞り込み{{ filterActive ? '（適用中）' : '' }}</span>
            <span class="flex items-center gap-2">
              <span v-if="filterActive" @click.stop="resetFilters" class="text-[11px] text-[#0071e3] hover:underline">リセット</span>
              <span class="text-gray-400 text-[10px]">{{ showFilters ? '▲' : '▼' }}</span>
            </span>
          </button>
          <div v-show="showFilters" class="mt-3 space-y-3">
            <div>
              <div class="flex justify-between text-[12px] text-gray-500"><span>最小病床数</span><span class="font-medium text-gray-700">{{ filters.minBeds }}床〜</span></div>
              <input type="range" min="100" max="1000" step="20" v-model.number="filters.minBeds" class="w-full accent-[#0071e3] mt-1" />
            </div>
            <div>
              <div class="text-[12px] text-gray-500 mb-1">病院タイプ</div>
              <div class="flex flex-wrap gap-1.5">
                <button v-for="t in typeOrder" :key="t" @click="toggleType(t)"
                  class="px-2.5 py-1 rounded-full text-[12px] border transition-colors"
                  :class="filters.types.includes(t) ? 'bg-[#0071e3] text-white border-[#0071e3]' : 'bg-white/60 text-gray-600 border-black/10 hover:border-gray-300'">{{ t }}</button>
              </div>
            </div>
            <div>
              <div class="text-[12px] text-gray-500 mb-1">二次医療圏</div>
              <div class="relative">
                <select v-model="filters.region" class="w-full appearance-none px-3 py-2 pr-8 text-[13px] bg-black/[0.04] rounded-lg border-0 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/60 cursor-pointer">
                  <option value="all">すべて</option>
                  <option v-for="r in meta?.regions || []" :key="r" :value="r">{{ r }}</option>
                </select>
                <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⌄</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 分析を開く -->
        <button @click="showAnalytics = !showAnalytics"
          class="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#0071e3] text-white text-[14px] font-medium hover:bg-[#0077ED] transition-colors">
          📊 {{ showAnalytics ? '分析を閉じる' : '詳細分析を開く' }}
        </button>

        <!-- 位置要確認リスト -->
        <div class="mt-4 pt-4 border-t border-black/[0.07]">
          <button @click="showUnlocated = !showUnlocated" class="w-full flex items-center justify-between text-[13px] font-medium" :class="unlocated.length ? 'text-amber-600' : 'text-gray-500'">
            <span>位置未確認の施設</span>
            <span class="flex items-center gap-1.5">
              <span class="px-2 py-0.5 rounded-full text-white text-[11px] font-semibold" :class="unlocated.length ? 'bg-amber-500' : 'bg-gray-300'">{{ unlocated.length }}</span>
              <span class="text-gray-400 text-[10px]">{{ showUnlocated ? '▲' : '▼' }}</span>
            </span>
          </button>
          <div v-if="showUnlocated" class="mt-2">
            <p v-if="!unlocated.length" class="text-[12px] text-gray-500 leading-relaxed">全施設の座標が確認済みです。</p>
            <ul v-else class="space-y-1 max-h-40 overflow-y-auto">
              <li v-for="h in unlocated" :key="h.id" class="text-[12px] text-gray-600"><span class="font-medium">{{ h.name }}</span><span class="text-gray-400"> — {{ h.geo_note || '座標未取得' }}</span></li>
            </ul>
          </div>
        </div>
      </div>
      </div>
    </transition>

    <!-- 右: 施設詳細サイドパネル -->
    <transition name="slide">
      <div v-if="selected" class="absolute top-5 right-5 z-[1000] w-[23rem] max-w-[calc(100vw-2.5rem)] max-h-[calc(100vh-7.5rem)] overflow-y-auto bg-white/75 backdrop-blur-2xl backdrop-saturate-150 rounded-[1.375rem] shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5">
        <div class="p-5">
          <div class="flex items-start justify-between gap-2">
            <h3 class="text-[1.05rem] font-semibold text-gray-900 leading-snug tracking-[-0.01em]">{{ selected.name }}</h3>
            <button @click="selected = null" class="shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-black/5 text-gray-500 text-lg leading-none hover:bg-black/10 transition-colors" aria-label="閉じる">×</button>
          </div>
          <p class="text-[12px] text-gray-500 mt-2 leading-relaxed"><span v-if="selected.postal">〒{{ selected.postal }}　</span>{{ selected.address }}</p>
          <div class="mt-3 flex flex-wrap gap-1.5 text-[12px]">
            <span class="px-2.5 py-1 rounded-full text-white" :style="{ background: typeColor(selected.hospital_type) }">{{ selected.hospital_type }}</span>
            <span class="px-2.5 py-1 rounded-full bg-black/5 text-gray-700">{{ selected.region }}</span>
            <span class="px-2.5 py-1 rounded-full bg-black/5 text-gray-700">🛏 {{ selected.beds_total || selected.beds }}床</span>
          </div>

          <!-- 病床内訳 -->
          <div v-if="bedBreakdown(selected).length > 1" class="mt-3">
            <div class="flex h-2.5 rounded-full overflow-hidden">
              <span v-for="b in bedBreakdown(selected)" :key="b.type" :style="{ width: b.pct + '%', background: typeColor(b.type) }"></span>
            </div>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-gray-500">
              <span v-for="b in bedBreakdown(selected)" :key="b.type"><span class="inline-block w-2 h-2 rounded-sm mr-1 align-middle" :style="{ background: typeColor(b.type) }"></span>{{ b.type }} {{ b.count }}床</span>
            </div>
          </div>

          <!-- ITスコア -->
          <div class="mt-4">
            <div class="flex items-center justify-between">
              <span class="text-[13px] font-medium text-gray-500">IT成熟度スコア</span>
              <span class="text-[13px] font-semibold text-gray-800">{{ selected.it_score }} / 6</span>
            </div>
            <div class="flex gap-1 mt-1.5">
              <span v-for="s in 6" :key="s" class="flex-1 h-2 rounded-full" :style="{ background: s <= selected.it_score ? scoreColor(selected.it_score) : 'rgba(0,0,0,0.08)' }"></span>
            </div>
          </div>

          <!-- IT指標 -->
          <div class="mt-4">
            <h4 class="text-[13px] font-medium text-gray-500 mb-2">IT・医療DX 届出状況</h4>
            <ul class="space-y-2">
              <li v-for="(label, key) in indicators" :key="key" class="flex items-center justify-between gap-2">
                <span class="text-[13.5px]" :class="key === selectedIndicator ? 'text-gray-900 font-semibold' : 'text-gray-700'">{{ label }}</span>
                <span class="flex items-center gap-1.5 shrink-0">
                  <span v-if="selected.adopt?.[key]" class="text-[11px] text-gray-400">{{ fmtYM(selected.adopt[key]) }}</span>
                  <span class="text-[12px] px-2.5 py-0.5 rounded-full font-medium" :class="selected.investments?.[key] ? 'bg-orange-500/15 text-orange-700' : 'bg-sky-500/12 text-sky-700'">{{ selected.investments?.[key] ? '届出あり' : '届出なし' }}</span>
                </span>
              </li>
            </ul>
          </div>

          <!-- 診療機能 -->
          <div class="mt-4">
            <h4 class="text-[13px] font-medium text-gray-500 mb-2">診療機能</h4>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="(label, key) in functions" :key="key"
                class="text-[12px] px-2.5 py-1 rounded-full"
                :class="selected.functions?.[key] ? 'bg-emerald-500/12 text-emerald-700 font-medium' : 'bg-black/5 text-gray-400'">{{ label }}</span>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 分析ドロワー -->
    <transition name="slide-up">
      <div v-if="showAnalytics" class="absolute right-5 z-[999] bg-white/80 backdrop-blur-2xl backdrop-saturate-150 rounded-[1.375rem] shadow-[0_-4px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/5 transition-[left] duration-200"
        :style="{ left: panelOpen ? '23.5rem' : '1.25rem', bottom: '3.25rem', maxHeight: '46vh' }">
        <div class="p-5 overflow-y-auto" style="max-height:46vh">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[1.05rem] font-semibold text-gray-900 tracking-[-0.01em]">詳細分析 <span class="text-[12px] font-normal text-gray-400">（表示中 {{ filteredCount }} 施設・「{{ currentLabel }}」基準）</span></h3>
            <button @click="showAnalytics = false" class="flex items-center justify-center w-7 h-7 rounded-full bg-black/5 text-gray-500 text-lg leading-none hover:bg-black/10" aria-label="閉じる">×</button>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
            <!-- 医療DX 普及曲線 -->
            <div class="bg-white/60 rounded-2xl p-4 ring-1 ring-black/5">
              <h4 class="text-[13px] font-semibold text-gray-700">医療DX加算の普及曲線</h4>
              <p class="text-[11px] text-gray-400 mb-2">届出施設の累積（算定開始年月日ベース）</p>
              <svg :viewBox="`0 0 ${chartW} ${chartH}`" class="w-full">
                <polyline :points="adoptionCurve.line" fill="none" stroke="#0071e3" stroke-width="2.5" stroke-linejoin="round" />
                <polygon :points="adoptionCurve.area" fill="#0071e3" fill-opacity="0.1" />
                <g v-for="t in adoptionCurve.ticks" :key="t.x">
                  <text :x="t.x" :y="chartH - 2" font-size="9" fill="#9ca3af" text-anchor="middle">{{ t.label }}</text>
                </g>
                <text x="2" y="10" font-size="9" fill="#9ca3af">{{ adoptionCurve.max }}施設</text>
              </svg>
            </div>

            <!-- 二次医療圏別 該当率 -->
            <div class="bg-white/60 rounded-2xl p-4 ring-1 ring-black/5">
              <h4 class="text-[13px] font-semibold text-gray-700">二次医療圏別 該当率</h4>
              <p class="text-[11px] text-gray-400 mb-2">「{{ currentLabel }}」の届出あり割合</p>
              <div class="space-y-1">
                <div v-for="r in regionRates" :key="r.region" class="flex items-center gap-2">
                  <span class="text-[11px] text-gray-500 w-16 shrink-0 text-right">{{ r.region }}</span>
                  <div class="flex-1 h-3.5 bg-black/5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" :style="{ width: r.rate + '%', background: '#D55E00' }"></div>
                  </div>
                  <span class="text-[10px] text-gray-400 w-12 shrink-0">{{ r.yes }}/{{ r.total }}</span>
                </div>
              </div>
            </div>

            <!-- 指標別 該当率 + 病床規模別スコア -->
            <div class="bg-white/60 rounded-2xl p-4 ring-1 ring-black/5">
              <h4 class="text-[13px] font-semibold text-gray-700">指標別 該当率</h4>
              <p class="text-[11px] text-gray-400 mb-2">表示中の施設に占める割合</p>
              <div class="space-y-1">
                <div v-for="r in indicatorRates" :key="r.key" class="flex items-center gap-2">
                  <span class="text-[10.5px] text-gray-500 w-24 shrink-0 text-right truncate" :title="r.label">{{ r.short }}</span>
                  <div class="flex-1 h-3.5 bg-black/5 rounded-full overflow-hidden">
                    <div class="h-full rounded-full" :style="{ width: r.rate + '%', background: r.group === 'it' ? '#0071e3' : '#009E73' }"></div>
                  </div>
                  <span class="text-[10px] text-gray-400 w-8 shrink-0">{{ r.rate }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- 出典フッター -->
    <div class="absolute bottom-0 left-0 right-0 z-[1000] bg-white/70 backdrop-blur-2xl backdrop-saturate-150 border-t border-black/[0.08] text-gray-500 text-[11px] px-5 py-2.5">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span class="font-semibold text-gray-700">出典</span>
        <a v-if="meta?.sourceUrl" :href="meta.sourceUrl" target="_blank" rel="noopener" class="text-[#0071e3] hover:underline">{{ meta?.source }}</a>
        <span v-else>{{ meta?.source }}</span>
        <span class="text-gray-300">·</span><span>対象時点: {{ meta?.period }}</span>
        <span class="text-gray-300">·</span><span>対象: {{ meta?.recordCount }}施設</span>
        <span class="text-gray-300">·</span><span>取得日: {{ meta?.fetchedAt }}</span>
        <span class="text-gray-300">·</span><span>座標: {{ meta?.geocoder }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, reactive, computed, watch } from 'vue'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'

interface Hospital {
  id: string; name: string; address: string; postal?: string
  lat: number | null; lng: number | null; beds: number; beds_total?: number
  geo_status?: 'ok' | 'failed'; geo_note?: string
  investments: Record<string, boolean>
  functions?: Record<string, boolean>
  adopt?: Record<string, string>
  beds_detail?: Record<string, number>
  hospital_type?: string; it_score?: number; municipality?: string; region?: string
}
interface Meta { [k: string]: any }

// 配色（色覚バリアフリー: Okabe-Ito）
const COLORS = { yes: '#D55E00', no: '#0072B2', unknown: '#9AA0A6' } as const
type State = keyof typeof COLORS
const SCORE_SCALE = ['#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594']
const TYPE_COLORS: Record<string, string> = { '一般': '#0072B2', '療養': '#E69F00', '精神': '#009E73', '混合': '#CC79A7', '不明': '#9AA0A6', '結核': '#56B4E9', '感染': '#F0E442' }
const typeOrder = ['一般', '療養', '精神', '混合']

const hospitals = ref<Hospital[]>([])
const meta = ref<Meta | null>(null)
const indicators = ref<Record<string, string>>({})
const functions = ref<Record<string, string>>({})
const selectedIndicator = ref('medical_dx')
const displayMode = ref<'indicator' | 'score' | 'type'>('indicator')
const displayModes = [{ key: 'indicator', label: '指標別' }, { key: 'score', label: 'ITスコア' }, { key: 'type', label: '病院タイプ' }]
const searchQuery = ref('')
const selected = ref<Hospital | null>(null)
const panelOpen = ref(true)
const showRings = ref(false)
const showUnlocated = ref(false)
const showFilters = ref(false)
const showAnalytics = ref(false)
const ringCount = ref(0)
const ringMinCount = 4
const filters = reactive<{ minBeds: number; types: string[]; region: string }>({ minBeds: 100, types: [], region: 'all' })

// 短縮ラベル（指標別チャート用）
const SHORT: Record<string, string> = {
  medical_dx: '医療DX', online_medical: 'オンライン診療', electronic_record: '電子情報', outpatient_chemo: '外来化学療法',
  remote_care: '遠隔モニタ', data_submission: 'データ提出',
  emergency: '救急', discharge_support: '入退院支援', infection_control: '感染対策', dialysis: '透析', safety: '医療安全', cancer_rehab: 'がんリハ',
}

const currentLabel = computed(() => indicators.value[selectedIndicator.value] || functions.value[selectedIndicator.value] || selectedIndicator.value)
const indicatorValue = (h: Hospital, key: string): boolean | undefined => {
  if (h.investments && key in h.investments) return h.investments[key]
  if (h.functions && key in h.functions) return h.functions[key]
  return undefined
}
const stateOf = (h: Hospital): State => {
  const v = indicatorValue(h, selectedIndicator.value)
  return v === true ? 'yes' : v === false ? 'no' : 'unknown'
}

const normalize = (s: string) => (s || '').toLowerCase()
const matchesSearch = (h: Hospital) => {
  const q = normalize(searchQuery.value).trim()
  return !q || normalize(h.name).includes(q) || normalize(h.address).includes(q)
}
const matchesFilters = (h: Hospital) => {
  if ((h.beds_total ?? h.beds) < filters.minBeds) return false
  if (filters.types.length && !filters.types.includes(h.hospital_type || '不明')) return false
  if (filters.region !== 'all' && h.region !== filters.region) return false
  return true
}
const filterActive = computed(() => filters.minBeds > 100 || filters.types.length > 0 || filters.region !== 'all')
const resetFilters = () => { filters.minBeds = 100; filters.types = []; filters.region = 'all' }
const toggleType = (t: string) => { const i = filters.types.indexOf(t); i >= 0 ? filters.types.splice(i, 1) : filters.types.push(t) }

const plotted = computed(() => hospitals.value.filter((h) => h.lat != null && h.lng != null && h.geo_status !== 'failed'))
const filtered = computed(() => plotted.value.filter((h) => matchesSearch(h) && matchesFilters(h)))
const filteredCount = computed(() => filtered.value.length)
const unlocated = computed(() => hospitals.value.filter((h) => h.geo_status === 'failed' || h.lat == null || h.lng == null))
const stats = computed(() => {
  let yes = 0, no = 0
  for (const h of filtered.value) { const s = stateOf(h); if (s === 'yes') yes++; else if (s === 'no') no++ }
  return { yes, no }
})

// 色・形状
const scoreColor = (s: number) => SCORE_SCALE[Math.max(0, Math.min(6, s))]
const typeColor = (t?: string) => TYPE_COLORS[t || '不明'] || '#9AA0A6'
function markerHtml(state: State, highlight = false) {
  const c = COLORS[state]
  const sh = highlight ? 'box-shadow:0 0 0 3px rgba(56,189,248,.7),0 2px 4px rgba(0,0,0,.3);' : 'box-shadow:0 2px 4px rgba(0,0,0,.3);'
  if (state === 'yes') return `<div style="background:${c};width:15px;height:15px;border-radius:50%;border:2px solid #fff;${sh}"></div>`
  if (state === 'no') return `<div style="background:#fff;width:15px;height:15px;border-radius:50%;border:4px solid ${c};${sh}"></div>`
  return `<div style="background:${c};width:13px;height:13px;border-radius:3px;border:2px solid #fff;transform:rotate(45deg);${sh}"></div>`
}
function scoreMarkerHtml(h: Hospital) {
  const c = scoreColor(h.it_score ?? 0)
  return `<div style="background:${c};width:15px;height:15px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.3)"></div>`
}
function typeMarkerHtml(h: Hospital) {
  const t = h.hospital_type || '不明'; const c = typeColor(t)
  const base = 'width:14px;height:14px;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.3);'
  if (t === '一般') return `<div style="${base}background:${c};border-radius:50%"></div>`
  if (t === '療養') return `<div style="${base}background:${c};border-radius:2px"></div>`
  if (t === '精神') return `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-bottom:14px solid ${c};filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))"></div>`
  if (t === '混合') return `<div style="${base}background:${c};border-radius:2px;transform:rotate(45deg)"></div>`
  return `<div style="${base}background:${c};border-radius:50%"></div>`
}
function legendSwatch(state: State) { return `<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center">${markerHtml(state)}</span>` }
function typeSwatch(t: string) { return `<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center">${typeMarkerHtml({ hospital_type: t } as Hospital)}</span>` }

// サイドパネル補助
const bedBreakdown = (h: Hospital) => {
  const d = h.beds_detail || {}; const total = Object.values(d).reduce((a, b) => a + b, 0) || 1
  return Object.entries(d).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count, pct: Math.round((count / total) * 100) }))
}
const fmtYM = (iso?: string) => iso ? iso.slice(0, 7).replace('-', '/') : ''

// 分析: 普及曲線
const chartW = 240, chartH = 90
const adoptionCurve = computed(() => {
  const dates = filtered.value.map((h) => h.adopt?.medical_dx).filter(Boolean).map((d) => d!.slice(0, 7)).sort()
  if (!dates.length) return { line: '', area: '', ticks: [], max: 0 }
  const start = dates[0], end = dates[dates.length - 1]
  const months: string[] = []
  let [y, m] = start.split('-').map(Number)
  const [ey, em] = end.split('-').map(Number)
  while (y < ey || (y === ey && m <= em)) { months.push(`${y}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; y++ } }
  const cum = months.map((ym) => dates.filter((d) => d <= ym).length)
  const max = cum[cum.length - 1] || 1
  const px = (i: number) => (i / Math.max(1, months.length - 1)) * (chartW - 6) + 3
  const py = (v: number) => chartH - 14 - (v / max) * (chartH - 22)
  const line = cum.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
  const area = `${px(0).toFixed(1)},${(chartH - 14).toFixed(1)} ${line} ${px(months.length - 1).toFixed(1)},${(chartH - 14).toFixed(1)}`
  const ticks = months.map((ym, i) => ({ x: px(i), label: ym.slice(2).replace('-', '/'), i })).filter((_, i) => i === 0 || i === months.length - 1 || i === Math.floor(months.length / 2))
  return { line, area, ticks, max }
})
// 分析: 医療圏別該当率
const regionRates = computed(() => {
  const map = new Map<string, { yes: number; total: number }>()
  for (const h of filtered.value) {
    const r = h.region || '不明'
    if (!map.has(r)) map.set(r, { yes: 0, total: 0 })
    const o = map.get(r)!; o.total++; if (indicatorValue(h, selectedIndicator.value) === true) o.yes++
  }
  return [...map.entries()].map(([region, o]) => ({ region, ...o, rate: Math.round((o.yes / o.total) * 100) })).sort((a, b) => b.rate - a.rate)
})
// 分析: 指標別該当率
const indicatorRates = computed(() => {
  const keys = [...Object.keys(indicators.value).map((k) => ({ k, group: 'it' })), ...Object.keys(functions.value).map((k) => ({ k, group: 'fn' }))]
  const n = filtered.value.length || 1
  return keys.map(({ k, group }) => {
    const yes = filtered.value.filter((h) => indicatorValue(h, k) === true).length
    return { key: k, group, label: indicators.value[k] || functions.value[k], short: SHORT[k] || k, rate: Math.round((yes / n) * 100) }
  }).sort((a, b) => b.rate - a.rate)
})

// Leaflet
let L: any = null, map: any = null, clusterGroup: any = null, ringGroup: any = null
function markerHtmlFor(h: Hospital) {
  if (displayMode.value === 'score') return scoreMarkerHtml(h)
  if (displayMode.value === 'type') return typeMarkerHtml(h)
  return markerHtml(stateOf(h))
}
function rebuildMarkers() {
  if (!clusterGroup || !L) return
  clusterGroup.clearLayers()
  for (const h of filtered.value) {
    const icon = L.divIcon({ className: 'custom-marker', html: markerHtmlFor(h), iconSize: [16, 16], iconAnchor: [8, 8] })
    const marker = L.marker([h.lat, h.lng], { icon })
    marker.on('click', () => { selected.value = h })
    clusterGroup.addLayer(marker)
  }
}
function rebuildRings() {
  if (!ringGroup || !L) return
  ringGroup.clearLayers()
  if (!showRings.value || displayMode.value !== 'indicator') { ringCount.value = 0; return }
  const pts = filtered.value.filter((h) => stateOf(h) === 'yes')
  const R = 2500, used = new Array(pts.length).fill(false), color = COLORS.yes
  let rings = 0
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue
    const anchor = L.latLng(pts[i].lat, pts[i].lng); const members: number[] = []
    for (let j = 0; j < pts.length; j++) { if (!used[j] && anchor.distanceTo(L.latLng(pts[j].lat, pts[j].lng)) <= R) members.push(j) }
    if (members.length >= ringMinCount) {
      members.forEach((j) => (used[j] = true))
      let la = 0, ln = 0; members.forEach((j) => { la += pts[j].lat!; ln += pts[j].lng! })
      const center = L.latLng(la / members.length, ln / members.length)
      let maxd = 0; members.forEach((j) => { maxd = Math.max(maxd, center.distanceTo(L.latLng(pts[j].lat, pts[j].lng))) })
      L.circle(center, { radius: Math.max(maxd + 350, 800), color, weight: 2, dashArray: '6 5', fillColor: color, fillOpacity: 0.08, interactive: false }).addTo(ringGroup)
      const label = L.divIcon({ className: 'ring-label', html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${color};color:#fff;font-weight:700;font-size:13px;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)">${members.length}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] })
      L.marker(center, { icon: label, interactive: false, zIndexOffset: -1000 }).addTo(ringGroup)
      rings++
    } else used[i] = true
  }
  ringCount.value = rings
}

watch([selectedIndicator, searchQuery, displayMode, () => filters.minBeds, () => filters.region, () => filters.types.length], () => { rebuildMarkers(); rebuildRings() })
watch(showRings, rebuildRings)

onMounted(async () => {
  L = (await import('leaflet')).default
  await import('leaflet.markercluster')
  map = L.map('map', { zoomControl: false }).setView([35.6894, 139.6917], 11)
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>", maxZoom: 18 }).addTo(map)
  ringGroup = L.layerGroup(); map.addLayer(ringGroup)
  clusterGroup = L.markerClusterGroup({ maxClusterRadius: 45, spiderfyOnMaxZoom: true, showCoverageOnHover: false }); map.addLayer(clusterGroup)
  try {
    const res = await fetch('/tokyo_hospitals_100beds.json')
    if (!res.ok) throw new Error('fetch failed')
    const data = await res.json()
    hospitals.value = Array.isArray(data) ? data : data.hospitals
    if (!Array.isArray(data) && data.meta) {
      meta.value = data.meta
      if (data.meta.indicators) indicators.value = data.meta.indicators
      if (data.meta.functions) functions.value = data.meta.functions
    }
    rebuildMarkers(); rebuildRings()
  } catch (e) { console.error('データの読み込みに失敗しました:', e) }
})
</script>

<style>
.apple-ui {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
    "Helvetica Neue", "Hiragino Kaku Gothic ProN", "Hiragino Sans",
    "Noto Sans JP", Meiryo, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.leaflet-container { background: #f5f5f7; font-family: inherit; }
.custom-marker { background: transparent; border: none; }
.slide-enter-active, .slide-leave-active { transition: all .25s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateX(16px) scale(0.98); }
.slide-left-enter-active, .slide-left-leave-active { transition: all .25s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-left-enter-from, .slide-left-leave-to { opacity: 0; transform: translateX(-16px) scale(0.98); }
.slide-up-enter-active, .slide-up-leave-active { transition: all .28s cubic-bezier(0.32, 0.72, 0, 1); }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(20px); }
.ring-label { background: transparent; border: none; }
.leaflet-control-zoom { border: none !important; border-radius: 14px !important; overflow: hidden; box-shadow: 0 6px 20px rgba(0,0,0,0.15) !important; backdrop-filter: blur(20px) saturate(1.5); }
.leaflet-control-zoom a { background: rgba(255,255,255,0.7) !important; color: #1d1d1f !important; border: none !important; width: 34px; height: 34px; line-height: 34px; font-weight: 500; }
.leaflet-control-zoom a:hover { background: rgba(255,255,255,0.92) !important; }
.leaflet-control-attribution { background: rgba(255,255,255,0.6) !important; backdrop-filter: blur(10px); border-radius: 8px 0 0 0; font-size: 10px; }
.marker-cluster { backdrop-filter: blur(2px); box-shadow: 0 2px 8px rgba(0,0,0,0.18); }
.marker-cluster div { font-weight: 600; }
.marker-cluster-small { background: rgba(0,114,178,.22); }
.marker-cluster-small div { background: rgba(0,114,178,.78); color: #fff; }
.marker-cluster-medium { background: rgba(213,94,0,.22); }
.marker-cluster-medium div { background: rgba(213,94,0,.78); color: #fff; }
.marker-cluster-large { background: rgba(213,94,0,.28); }
.marker-cluster-large div { background: rgba(213,94,0,.88); color: #fff; }
</style>
