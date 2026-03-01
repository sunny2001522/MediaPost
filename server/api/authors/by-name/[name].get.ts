import { eq, or } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  if (!name) {
    throw createError({ statusCode: 400, message: 'Missing author name or slug' })
  }

  const db = useDB()
  const decoded = decodeURIComponent(name)

  // 支援用 name 或 slug 查詢
  const [author] = await db
    .select()
    .from(schema.authors)
    .where(or(
      eq(schema.authors.name, decoded),
      eq(schema.authors.slug, decoded)
    ))
    .limit(1)

  if (!author) {
    throw createError({ statusCode: 404, message: `Author "${decoded}" not found` })
  }

  return author
})
