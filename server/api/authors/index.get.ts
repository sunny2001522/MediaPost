import { asc, count, desc, eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async () => {
  const db = useDB()

  const result = await db
    .select({
      id: schema.authors.id,
      name: schema.authors.name,
      isActive: schema.authors.isActive,
      cmoneyPodcastTrackId: schema.authors.cmoneyPodcastTrackId,
      cmoneyYoutubeChannelId: schema.authors.cmoneyYoutubeChannelId,
      createdAt: schema.authors.createdAt,
      updatedAt: schema.authors.updatedAt,
    })
    .from(schema.authors)
    .leftJoin(schema.podcasts, eq(schema.authors.id, schema.podcasts.authorId))
    .groupBy(schema.authors.id)
    .orderBy(desc(count(schema.podcasts.id)), asc(schema.authors.name))

  return result
})
