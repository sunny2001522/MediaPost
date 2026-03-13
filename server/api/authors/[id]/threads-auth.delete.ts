/**
 * 斷開 Threads 連結
 * DELETE /api/authors/:id/threads-auth
 */
import { eq, and } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const authorId = getRouterParam(event, 'id')
  if (!authorId) {
    throw createError({ statusCode: 400, message: 'Missing author ID' })
  }

  const db = useDB()

  await db
    .delete(schema.socialAccounts)
    .where(
      and(
        eq(schema.socialAccounts.authorId, authorId),
        eq(schema.socialAccounts.platform, 'threads'),
      )
    )

  return { success: true }
})
