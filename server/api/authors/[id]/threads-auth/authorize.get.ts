/**
 * 發起 Threads OAuth 授權
 * GET /api/authors/:id/threads-auth/authorize
 * 回傳 { url } 讓前端跳轉
 */
export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')
  if (!authorId) {
    throw createError({ statusCode: 400, message: 'Missing author ID' })
  }

  const config = useRuntimeConfig()

  if (!config.threadsClientId || !config.threadsRedirectUri) {
    throw createError({
      statusCode: 500,
      message: 'Threads OAuth 未設定，請在 .env 設定 THREADS_CLIENT_ID 和 THREADS_REDIRECT_URI',
    })
  }

  const params = new URLSearchParams({
    client_id: config.threadsClientId,
    redirect_uri: config.threadsRedirectUri,
    scope: 'threads_basic,threads_content_publish',
    response_type: 'code',
    state: authorId,
  })

  const url = `https://threads.net/oauth/authorize?${params.toString()}`

  return { url }
})
