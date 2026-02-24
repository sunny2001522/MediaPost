// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  devtools: { enabled: true },

  devServer: {
    port: 3004
  },

  colorMode: {
    preference: 'light'
  },

  runtimeConfig: {
    // Turso
    tursoUrl: process.env.TURSO_DATABASE_URL,
    tursoToken: process.env.TURSO_AUTH_TOKEN,

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY,

    // YouTube Data API
    youtubeApiKey: process.env.YOUTUBE_API_KEY,

    // Vercel Blob
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN,

    // Threads
    threadsClientId: process.env.THREADS_CLIENT_ID,
    threadsClientSecret: process.env.THREADS_CLIENT_SECRET,
    threadsRedirectUri: process.env.THREADS_REDIRECT_URI,

    // Inngest
    inngestEventKey: process.env.INNGEST_EVENT_KEY,
    inngestSigningKey: process.env.INNGEST_SIGNING_KEY,

    // Cron
    cronSecret: process.env.CRON_SECRET,

    public: {
      appName: 'MediaPost',
      baseUrl: process.env.NUXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3004'
    }
  },

  compatibilityDate: '2025-02-10'
})
