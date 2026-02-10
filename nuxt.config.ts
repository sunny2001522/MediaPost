// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],

  devtools: { enabled: true },

  colorMode: {
    preference: 'light'
  },

  runtimeConfig: {
    // Turso
    tursoUrl: process.env.TURSO_DATABASE_URL,
    tursoToken: process.env.TURSO_AUTH_TOKEN,

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY,

    // Replicate
    replicateApiToken: process.env.REPLICATE_API_TOKEN,

    // Vercel Blob
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN,

    // Threads
    threadsClientId: process.env.THREADS_CLIENT_ID,
    threadsClientSecret: process.env.THREADS_CLIENT_SECRET,
    threadsRedirectUri: process.env.THREADS_REDIRECT_URI,

    public: {
      appName: 'MediaPost'
    }
  },

  compatibilityDate: '2025-02-10'
})
