import { desc, eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const db = useDB()
  const query = getQuery(event)

  // 可選的 authorId 篩選
  const authorId = query.authorId as string | undefined

  let queryBuilder = db
    .select()
    .from(schema.projects)
    .orderBy(desc(schema.projects.createdAt))

  if (authorId) {
    queryBuilder = queryBuilder.where(eq(schema.projects.authorId, authorId)) as typeof queryBuilder
  }

  const result = await queryBuilder

  // 解析 JSON 欄位
  return result.map(project => ({
    ...project,
    inputConfig: project.inputConfig ? JSON.parse(project.inputConfig) : null,
    outputPlatforms: project.outputPlatforms ? JSON.parse(project.outputPlatforms) : [],
    outputConfig: project.outputConfig ? JSON.parse(project.outputConfig) : null,
  }))
})
