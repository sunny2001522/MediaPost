import { nanoid } from 'nanoid'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const id = nanoid()
  const now = new Date()

  const podcast = {
    id,
    title: body.title || 'Untitled',
    sourceType: body.sourceType as 'upload' | 'youtube',
    sourceUrl: body.sourceUrl || null,
    audioFileUrl: body.audioFileUrl || null,
    status: 'pending' as const,
    createdAt: now,
    updatedAt: now,
  }

  await db.insert(schema.podcasts).values(podcast)

  return podcast
})
