import { eq, sql, and } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

interface ProjectWithStats {
  id: string
  name: string
  authorId: string
  inputType: string
  inputConfig: Record<string, unknown> | null
  outputPlatforms: string[]
  outputConfig: Record<string, Record<string, unknown>> | null
  isAutoSync: boolean | null
  syncInterval: number | null
  lastSyncAt: Date | null
  isActive: boolean | null
  createdAt: Date
  updatedAt: Date
  stats: {
    fetched: number      // 已抓取（所有 podcasts）
    converted: number    // 已轉換（status = completed）
    published: number    // 已發表（publishRecords status = success）
  }
}

interface AuthorWithProjects {
  id: string
  name: string
  slug: string | null
  projects: ProjectWithStats[]
}

export default defineEventHandler(async () => {
  const db = useDB()

  // 1. 取得所有作者
  const authors = await db.query.authors.findMany({
    where: eq(schema.authors.isActive, true),
    orderBy: schema.authors.name,
  })

  // 2. 取得所有專案
  const projects = await db
    .select()
    .from(schema.projects)
    .orderBy(schema.projects.name)

  // 3. 計算統計：每個專案的 fetched 數量（所有 podcasts）
  const fetchedStats = await db
    .select({
      projectId: schema.podcasts.projectId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.podcasts)
    .where(sql`${schema.podcasts.projectId} IS NOT NULL`)
    .groupBy(schema.podcasts.projectId)

  // 4. 計算統計：每個專案的 converted 數量（status = completed）
  const convertedStats = await db
    .select({
      projectId: schema.podcasts.projectId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.podcasts)
    .where(
      and(
        sql`${schema.podcasts.projectId} IS NOT NULL`,
        eq(schema.podcasts.status, 'completed')
      )
    )
    .groupBy(schema.podcasts.projectId)

  // 5. 計算統計：每個專案的 published 數量（publishRecords status = success）
  const publishedStats = await db
    .select({
      projectId: schema.publishRecords.projectId,
      count: sql<number>`count(*)`.as('count'),
    })
    .from(schema.publishRecords)
    .where(
      and(
        sql`${schema.publishRecords.projectId} IS NOT NULL`,
        eq(schema.publishRecords.status, 'success')
      )
    )
    .groupBy(schema.publishRecords.projectId)

  // 建立統計映射
  const fetchedMap = new Map(fetchedStats.map(s => [s.projectId, s.count]))
  const convertedMap = new Map(convertedStats.map(s => [s.projectId, s.count]))
  const publishedMap = new Map(publishedStats.map(s => [s.projectId, s.count]))

  // 5. 組合結果
  const result: AuthorWithProjects[] = authors
    .map(author => {
      const authorProjects = projects
        .filter(p => p.authorId === author.id)
        .map(project => ({
          ...project,
          inputConfig: project.inputConfig ? JSON.parse(project.inputConfig) : null,
          outputPlatforms: project.outputPlatforms ? JSON.parse(project.outputPlatforms) : [],
          outputConfig: project.outputConfig ? JSON.parse(project.outputConfig) : null,
          stats: {
            fetched: fetchedMap.get(project.id) || 0,
            converted: convertedMap.get(project.id) || 0,
            published: publishedMap.get(project.id) || 0,
          },
        }))
        // 專案依更新時間排序（最新的在前）
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

      return {
        id: author.id,
        name: author.name,
        slug: author.slug,
        projects: authorProjects,
      }
    })
    // 只返回有專案的作者
    .filter(author => author.projects.length > 0)
    // 作者依最新專案更新時間排序
    .sort((a, b) => {
      const aLatest = a.projects[0]?.updatedAt ? new Date(a.projects[0].updatedAt).getTime() : 0
      const bLatest = b.projects[0]?.updatedAt ? new Date(b.projects[0].updatedAt).getTime() : 0
      return bLatest - aLatest
    })

  return result
})
