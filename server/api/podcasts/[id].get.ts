import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Missing podcast ID' })
  }

  const db = useDB()

  // 使用 LEFT JOIN 取得作者和專案資訊
  const [result] = await db
    .select({
      podcast: schema.podcasts,
      author: schema.authors,
      project: schema.projects,
    })
    .from(schema.podcasts)
    .leftJoin(schema.authors, eq(schema.podcasts.authorId, schema.authors.id))
    .leftJoin(schema.projects, eq(schema.podcasts.projectId, schema.projects.id))
    .where(eq(schema.podcasts.id, id))

  if (!result) {
    throw createError({ statusCode: 404, message: 'Podcast not found' })
  }

  // 解析 project 的 JSON 欄位
  const project = result.project ? {
    ...result.project,
    outputPlatforms: JSON.parse(result.project.outputPlatforms || '[]'),
    inputConfig: result.project.inputConfig ? JSON.parse(result.project.inputConfig) : null,
    outputConfig: result.project.outputConfig ? JSON.parse(result.project.outputConfig) : null,
  } : null

  return {
    ...result.podcast,
    author: result.author,
    project,
  }
})
