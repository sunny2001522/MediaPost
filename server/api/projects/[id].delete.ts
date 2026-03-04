import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少專案 ID',
    })
  }

  // 檢查專案是否存在
  const existing = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  })

  if (!existing) {
    throw createError({
      statusCode: 404,
      message: '專案不存在',
    })
  }

  // 刪除專案（cascades 會處理關聯的 podcasts）
  await db.delete(schema.projects)
    .where(eq(schema.projects.id, id))

  return { success: true }
})
