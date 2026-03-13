/**
 * Threads OAuth Callback
 * GET /api/auth/threads/callback?code=xxx&state=authorId
 *
 * 1. 用 code 換短期 token
 * 2. 換長期 token
 * 3. 取 user profile
 * 4. Upsert socialAccounts
 * 5. Redirect 回前端
 */
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getThreadsUserProfile,
  upsertThreadsAccount,
} from '~/server/services/threads/auth'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const code = query.code as string
  const authorId = query.state as string

  if (!code || !authorId) {
    return sendRedirect(event, '/?threads=error&message=missing_params')
  }

  try {
    // Step 1: Authorization code → short-lived token
    const shortToken = await exchangeCodeForToken(code)

    // Step 2: Short-lived → long-lived token
    const longToken = await exchangeForLongLivedToken(shortToken.accessToken)

    // Step 3: Get user profile
    const profile = await getThreadsUserProfile(longToken.accessToken)

    // Step 4: Upsert to DB
    await upsertThreadsAccount({
      authorId,
      platformUserId: profile.id,
      platformUsername: profile.username,
      accessToken: longToken.accessToken,
      expiresIn: longToken.expiresIn,
    })

    console.log(`[Threads OAuth] 成功連結 @${profile.username} (作者: ${authorId})`)

    return sendRedirect(event, `/?threads=connected`)
  } catch (error: any) {
    console.error('[Threads OAuth] Callback error:', error)
    const message = encodeURIComponent(error.message || 'unknown_error')
    return sendRedirect(event, `/?threads=error&message=${message}`)
  }
})
