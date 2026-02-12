import { eq, and } from 'drizzle-orm'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const db = useDB()

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少作者 ID',
    })
  }

  // 查詢作者的預設人設
  const [persona] = await db
    .select()
    .from(schema.authorPersonas)
    .where(
      and(
        eq(schema.authorPersonas.authorId, id),
        eq(schema.authorPersonas.isDefault, true),
        eq(schema.authorPersonas.isActive, true)
      )
    )
    .limit(1)

  return persona || null
})
