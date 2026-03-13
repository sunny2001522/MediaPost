import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

interface UpdateProjectBody {
  name?: string
  inputType?: string
  inputPlatform?: string
  inputConfig?: Record<string, unknown>
  outputType?: string
  outputPlatforms?: string[]
  outputConfig?: Record<string, Record<string, unknown>>
  isAutoSync?: boolean
  syncInterval?: number
  isActive?: boolean
}

export default defineEventHandler(async (event) => {
  const db = useDB()
  const id = getRouterParam(event, 'id')
  const body = await readBody<UpdateProjectBody>(event)

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

  // 構建更新物件
  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (body.name !== undefined) updateData.name = body.name
  if (body.inputType !== undefined) updateData.inputType = body.inputType
  if (body.inputPlatform !== undefined) updateData.inputPlatform = body.inputPlatform
  if (body.inputConfig !== undefined) updateData.inputConfig = JSON.stringify(body.inputConfig)
  if (body.outputType !== undefined) updateData.outputType = body.outputType
  if (body.outputPlatforms !== undefined) updateData.outputPlatforms = JSON.stringify(body.outputPlatforms)
  if (body.outputConfig !== undefined) updateData.outputConfig = JSON.stringify(body.outputConfig)
  if (body.isAutoSync !== undefined) updateData.isAutoSync = body.isAutoSync
  if (body.syncInterval !== undefined) updateData.syncInterval = body.syncInterval
  if (body.isActive !== undefined) updateData.isActive = body.isActive

  await db.update(schema.projects)
    .set(updateData)
    .where(eq(schema.projects.id, id))

  return { success: true }
})
