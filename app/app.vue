<template>
  <div class="relative w-full h-screen bg-gray-50">
    <ClientOnly>
      <div id="map" class="absolute inset-0 z-0"></div>
    </ClientOnly>

    <div class="absolute top-6 left-6 z-10 w-80 bg-white/90 backdrop-blur-md p-5 rounded-xl shadow-lg border border-gray-100">
      <h1 class="text-xl font-bold text-gray-800 tracking-tight">
        東京都 病院IT投資マップ
      </h1>
      <p class="text-sm text-gray-500 mt-1">100床以上の主要病院ベンチマーク</p>
      
      <div class="mt-4 pt-4 border-t border-gray-200">
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">医療DX推進体制 導入状況</h2>
        <div class="flex items-center gap-2 mb-2">
          <span class="w-3 h-3 rounded-full bg-red-500 shadow-sm"></span>
          <span class="text-sm text-gray-700">導入済</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></span>
          <span class="text-sm text-gray-700">未導入</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import 'leaflet/dist/leaflet.css' // Leafletの必須CSS

// 病院データの型定義
interface Hospital {
  id: string;
  name: string;
  address: string;
  postal?: string;
  lat: number | null;
  lng: number | null;
  beds: number;
  geo_status?: 'ok' | 'failed';
  geo_note?: string;
  investments: {
    online_medical: boolean;
    medical_dx: boolean;
    electronic_record: boolean;
    robot_surgery: boolean;
    outpatient_chemo: boolean;
    remote_care: boolean;
    data_submission: boolean;
  };
}

onMounted(async () => {
  // Leafletはブラウザ環境(window)に依存するため、動的インポートで読み込みます
  const L = (await import('leaflet')).default;

  // マップの初期化（東京都庁を中心に設定）
  // ※注意：Mapboxは [lng, lat] でしたが、Leafletは [lat, lng]（緯度、経度）の順です！
  const map = L.map('map', {
    zoomControl: false // デフォルトのズームボタンを消して右下に再配置するため
  }).setView([35.6894, 139.6917], 11);

  // ズームコントロールを右下に配置
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // 国土地理院の標準地図タイル（白地図風の「淡色地図」を使用）APIキー不要！
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: "<a href='https://maps.gsi.go.jp/development/ichiran.html' target='_blank'>国土地理院</a>",
    maxZoom: 18,
  }).addTo(map);

  try {
    // publicディレクトリからJSONをフェッチ
    const response = await fetch('/tokyo_hospitals_100beds.json');
    if (!response.ok) throw new Error('Failed to fetch data');
    const hospitals: Hospital[] = await response.json();

    hospitals.forEach(hospital => {
      // 位置情報が確認できた施設のみプロットする（geo_status未付与の旧データは座標有無で判定）
      if (hospital.geo_status === 'failed') return;
      if (hospital.lat == null || hospital.lng == null) return;

      const hasDX = hospital.investments.medical_dx;
      
      // Tailwindのカラーコード（赤と青）
      const markerColor = hasDX ? '#ef4444' : '#3b82f6';

      // HTMLとCSSを使ってオリジナルの丸いピン（マーカー）を作成
      const customIcon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${markerColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -10]
      });

      // ポップアップのHTML
      const popupHTML = `
        <div class="p-1 min-w-[200px]">
          <h3 class="font-bold text-gray-800 text-sm border-b pb-1 mb-2">${hospital.name}</h3>
          <p class="text-xs text-gray-600 mb-1">🛏 病床数: ${hospital.beds}床</p>
          <div class="mt-2 flex gap-1 flex-wrap">
            <span class="text-[10px] px-1.5 py-0.5 rounded ${hospital.investments.robot_surgery ? 'bg-red-100 text-red-700 font-semibold' : 'bg-gray-100 text-gray-400'}">
              ロボット手術
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${hospital.investments.medical_dx ? 'bg-indigo-100 text-indigo-700 font-semibold' : 'bg-gray-100 text-gray-400'}">
              医療DX
            </span>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${hospital.investments.online_medical ? 'bg-teal-100 text-teal-700 font-semibold' : 'bg-gray-100 text-gray-400'}">
              オンライン診療
            </span>
          </div>
        </div>
      `;

      // マーカーを地図に追加（Leafletは [lat, lng]）
      L.marker([hospital.lat, hospital.lng], { icon: customIcon })
        .bindPopup(popupHTML, { autoPanPadding: [50, 50] })
        .addTo(map);
    });

  } catch (error) {
    console.error("データの読み込みに失敗しました:", error);
  }
});
</script>

<style>
/* Leafletのポップアップ標準デザインをTailwindに馴染むように上書き */
.leaflet-popup-content-wrapper {
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  padding: 0;
}
.leaflet-popup-content {
  margin: 12px;
}
/* Leafletの背景(タイル読み込み前)の色をTailwindのgray-50に合わせる */
.leaflet-container {
  background: #f9fafb;
  font-family: inherit;
}
</style>