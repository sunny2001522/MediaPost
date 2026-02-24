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

  // 查詢作者資訊（包含 CMoney IDs）
  const [author] = await db
    .select({
      cmoneyPodcastTrackId: schema.authors.cmoneyPodcastTrackId,
      cmoneyYoutubeChannelId: schema.authors.cmoneyYoutubeChannelId,
    })
    .from(schema.authors)
    .where(eq(schema.authors.id, id))
    .limit(1)

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

  // 合併人設和 CMoney IDs
  return {
    ...(persona || {}),
    cmoneyPodcastTrackId: author?.cmoneyPodcastTrackId || null,
    cmoneyYoutubeChannelId: author?.cmoneyYoutubeChannelId || null,
  }
})
