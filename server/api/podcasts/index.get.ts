import { desc, eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const query = getQuery(event)
  const authorId = query.authorId as string | undefined

  // 使用 LEFT JOIN 取得作者資訊
  let result

  // 定義選擇欄位
  const selectFields = {
    id: schema.podcasts.id,
    title: schema.podcasts.title,
    authorId: schema.podcasts.authorId,
    sourceType: schema.podcasts.sourceType,
    sourceUrl: schema.podcasts.sourceUrl,
    audioFileUrl: schema.podcasts.audioFileUrl,
    transcript: schema.podcasts.transcript,
    transcriptSegments: schema.podcasts.transcriptSegments,
    youtubeDescription: schema.podcasts.youtubeDescription,
    duration: schema.podcasts.duration,
    status: schema.podcasts.status,
    errorMessage: schema.podcasts.errorMessage,
    createdAt: schema.podcasts.createdAt,
    updatedAt: schema.podcasts.updatedAt,
    author: {
      id: schema.authors.id,
      name: schema.authors.name,
    },
  }

  if (authorId) {
    result = await db
      .select(selectFields)
      .from(schema.podcasts)
      .leftJoin(schema.authors, eq(schema.podcasts.authorId, schema.authors.id))
      .where(eq(schema.podcasts.authorId, authorId))
      .orderBy(desc(schema.podcasts.createdAt))
  }
  else {
    result = await db
      .select(selectFields)
      .from(schema.podcasts)
      .leftJoin(schema.authors, eq(schema.podcasts.authorId, schema.authors.id))
      .orderBy(desc(schema.podcasts.createdAt))
  }

  return result
})
