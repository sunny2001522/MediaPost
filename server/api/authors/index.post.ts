import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  if (!body.name || typeof body.name !== 'string') {
    throw createError({
      statusCode: 400,
      message: '請提供作者名稱',
    })
  }

  const now = new Date()
  const id = nanoid()

  await db.insert(schema.authors).values({
    id,
    name: body.name.trim(),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  })

  return {
    id,
    name: body.name.trim(),
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
})
