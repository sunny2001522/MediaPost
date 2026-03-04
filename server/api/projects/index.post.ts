import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

interface CreateProjectBody {
  name: string
  authorId: string
  inputType: string
  inputConfig?: Record<string, unknown>
  outputPlatforms: string[]
  outputConfig?: Record<string, Record<string, unknown>>
  isAutoSync?: boolean
  syncInterval?: number
}

export default defineEventHandler(async (event) => {
  const db = useDB()
  const body = await readBody<CreateProjectBody>(event)

  // 驗證必填欄位
  if (!body.name || !body.authorId || !body.inputType || !body.outputPlatforms?.length) {
    throw createError({
      statusCode: 400,
      message: '缺少必填欄位：name, authorId, inputType, outputPlatforms',
    })
  }

  const now = new Date()
  const id = nanoid()

  await db.insert(schema.projects).values({
    id,
    name: body.name,
    authorId: body.authorId,
    inputType: body.inputType,
    inputConfig: body.inputConfig ? JSON.stringify(body.inputConfig) : null,
    outputPlatforms: JSON.stringify(body.outputPlatforms),
    outputConfig: body.outputConfig ? JSON.stringify(body.outputConfig) : null,
    isAutoSync: body.isAutoSync ?? true,
    syncInterval: body.syncInterval ?? 4,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  return { id, success: true }
})
