// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],

  // 地図(Leaflet)は完全クライアント描画のため SSR は使わず SPA として書き出す。
  // baseURL を付けた際のプリレンダ・リダイレクト問題も回避できる。
  ssr: false,

  // GitHub Pages 用の静的サイト書き出し設定。
  // プロジェクトページは https://<user>.github.io/<repo>/ で配信されるため、
  // baseURL をサブパスにする。CIで NUXT_APP_BASE_URL=/hospital-dashboard/ を渡す。
  // ローカル開発は未設定なので '/'（従来どおり）。
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
  },
  // .nojekyll 付与・404フォールバック等を自動処理
  nitro: {
    preset: 'github-pages',
  },
})
