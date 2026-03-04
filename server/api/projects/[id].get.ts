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

  const result = await db.query.projects.findFirst({
    where: eq(schema.projects.id, id),
  })

  if (!result) {
    throw createError({
      statusCode: 404,
      message: '專案不存在',
    })
  }

  // 解析 JSON 欄位
  return {
    ...result,
    inputConfig: result.inputConfig ? JSON.parse(result.inputConfig) : null,
    outputPlatforms: result.outputPlatforms ? JSON.parse(result.outputPlatforms) : [],
    outputConfig: result.outputConfig ? JSON.parse(result.outputConfig) : null,
  }
})
