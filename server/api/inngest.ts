import { serve } from 'inngest/nuxt'
import { inngest, functions } from '~/server/services/inngest'

// Inngest serve 端點
// 這個端點會被 Inngest Cloud 呼叫來執行步驟
export default serve({
  client: inngest,
  functions,
})
