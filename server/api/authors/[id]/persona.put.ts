import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { useDB } from '~/server/database/client'
import * as schema from '~/server/database/schema'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)
  const db = useDB()

  if (!id) {
    throw createError({
      statusCode: 400,
      message: '缺少作者 ID',
    })
  }

  // 檢查作者是否存在
  const [author] = await db
    .select()
    .from(schema.authors)
    .where(eq(schema.authors.id, id))
    .limit(1)

  if (!author) {
    throw createError({
      statusCode: 404,
      message: '找不到此作者',
    })
  }

  const now = new Date()

  // 查詢現有的預設人設
  const [existingPersona] = await db
    .select()
    .from(schema.authorPersonas)
    .where(
      and(
        eq(schema.authorPersonas.authorId, id),
        eq(schema.authorPersonas.isDefault, true)
      )
    )
    .limit(1)

  if (existingPersona) {
    // 更新現有人設
    await db
      .update(schema.authorPersonas)
      .set({
        persona: body.persona ?? existingPersona.persona,
        sloganToIgnore: body.sloganToIgnore ?? existingPersona.sloganToIgnore,
        styleGuidelines: body.styleGuidelines ?? existingPersona.styleGuidelines,
        version: existingPersona.version + 1,
        updatedAt: now,
      })
      .where(eq(schema.authorPersonas.id, existingPersona.id))

    // 回傳更新後的人設
    const [updated] = await db
      .select()
      .from(schema.authorPersonas)
      .where(eq(schema.authorPersonas.id, existingPersona.id))

    return updated
  } else {
    // 建立新人設
    const newPersonaId = nanoid()

    await db.insert(schema.authorPersonas).values({
      id: newPersonaId,
      authorId: id,
      name: '預設',
      isDefault: true,
      isActive: true,
      persona: body.persona || null,
      sloganToIgnore: body.sloganToIgnore || null,
      styleGuidelines: body.styleGuidelines || null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })

    // 回傳新建的人設
    const [created] = await db
      .select()
      .from(schema.authorPersonas)
      .where(eq(schema.authorPersonas.id, newPersonaId))

    return created
  }
})
