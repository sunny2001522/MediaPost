/**
 * 取得 Threads 認證狀態
 * GET /api/authors/:id/threads-auth
 */
import { eq, and } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')
  if (!authorId) {
    throw createError({ statusCode: 400, message: 'Missing author ID' })
  }

  const db = useDB()

  const account = await db.query.socialAccounts.findFirst({
    where: and(
      eq(schema.socialAccounts.authorId, authorId),
      eq(schema.socialAccounts.platform, 'threads'),
    ),
  })

  if (!account) {
    return {
      hasAuth: false,
      username: null,
      tokenExpiresAt: null,
      isTokenValid: false,
    }
  }

  const isTokenValid = account.tokenExpiresAt
    ? Date.now() < account.tokenExpiresAt.getTime()
    : false

  return {
    hasAuth: true,
    username: account.platformUsername,
    tokenExpiresAt: account.tokenExpiresAt?.toISOString() || null,
    isTokenValid,
  }
})
