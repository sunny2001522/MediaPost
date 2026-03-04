import { nanoid } from 'nanoid'
import { eq, isNotNull, and, or } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

/**
 * 為現有作者建立預設專案，並將現有 podcasts 關聯到專案
 */
export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()
  const results: Array<{ authorName: string; projectName: string; podcastsLinked: number }> = []

  // 1. 取得有 CMoney 配置或有 podcasts 的作者
  const authors = await db.query.authors.findMany({
    where: eq(schema.authors.isActive, true),
  })

  for (const author of authors) {
    // 檢查作者是否已有專案
    const existingProjects = await db.query.projects.findMany({
      where: eq(schema.projects.authorId, author.id),
    })

    if (existingProjects.length > 0) {
      // 已有專案，只需將未關聯的 podcasts 關聯到第一個專案
      const projectId = existingProjects[0].id
      const updateResult = await db.update(schema.podcasts)
        .set({ projectId })
        .where(
          and(
            eq(schema.podcasts.authorId, author.id),
            or(
              eq(schema.podcasts.projectId, ''),
              // @ts-ignore
              eq(schema.podcasts.projectId, null)
            )
          )
        )

      continue
    }

    // 2. 檢查作者是否有 CMoney Podcast TrackId
    if (author.cmoneyPodcastTrackId) {
      const projectId = nanoid()

      // 建立專案
      await db.insert(schema.projects).values({
        id: projectId,
        name: `${author.name} Podcast`,
        authorId: author.id,
        inputType: 'podcast_to_post',
        inputConfig: JSON.stringify({
          trackId: author.cmoneyPodcastTrackId,
        }),
        outputPlatforms: JSON.stringify(['cmoney_classmate']),
        outputConfig: JSON.stringify({
          cmoney_classmate: {},
        }),
        isAutoSync: true,
        syncInterval: 4,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })

      // 將該作者的所有 podcasts 關聯到此專案
      const updateResult = await db.update(schema.podcasts)
        .set({ projectId })
        .where(eq(schema.podcasts.authorId, author.id))

      // 計算關聯了多少 podcasts
      const linkedPodcasts = await db.query.podcasts.findMany({
        where: eq(schema.podcasts.projectId, projectId),
      })

      results.push({
        authorName: author.name,
        projectName: `${author.name} Podcast`,
        podcastsLinked: linkedPodcasts.length,
      })
    } else {
      // 沒有 CMoney 配置，但可能有 podcasts，建立通用專案
      const authorPodcasts = await db.query.podcasts.findMany({
        where: eq(schema.podcasts.authorId, author.id),
      })

      if (authorPodcasts.length > 0) {
        const projectId = nanoid()

        await db.insert(schema.projects).values({
          id: projectId,
          name: `${author.name} 內容`,
          authorId: author.id,
          inputType: 'podcast_to_post',
          inputConfig: JSON.stringify({}),
          outputPlatforms: JSON.stringify(['cmoney_classmate']),
          outputConfig: JSON.stringify({}),
          isAutoSync: false,
          syncInterval: 4,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        })

        // 關聯 podcasts
        await db.update(schema.podcasts)
          .set({ projectId })
          .where(eq(schema.podcasts.authorId, author.id))

        results.push({
          authorName: author.name,
          projectName: `${author.name} 內容`,
          podcastsLinked: authorPodcasts.length,
        })
      }
    }
  }

  return {
    success: true,
    message: `已為 ${results.length} 個作者建立預設專案`,
    details: results,
  }
})
