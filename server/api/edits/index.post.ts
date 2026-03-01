import { nanoid } from 'nanoid'
import { eq, and } from 'drizzle-orm'
import { learningEngine } from '~/server/services/learning/LearningEngine'
import { useDB, schema } from '~/server/database/client'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const db = useDB()

  const { generationId, originalContent, editedContent } = body

  if (!generationId || !originalContent || !editedContent) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: generationId, originalContent, editedContent'
    })
  }

  // 如果內容相同，不做任何處理
  if (originalContent === editedContent) {
    return {
      success: true,
      learning: { learned: false, reason: 'no_changes' }
    }
  }

  // 觸發學習流程
  const learningResult = await learningEngine.processEdit(
    generationId,
    originalContent,
    editedContent
  )

  // 如果有學習到偏好指引，同步到作者人設
  if (learningResult.learned && learningResult.preferenceGuidelines) {
    try {
      // 1. 取得 generation 對應的 podcast
      const [generation] = await db.select()
        .from(schema.generations)
        .where(eq(schema.generations.id, generationId))

      if (generation) {
        // 2. 取得 podcast 對應的 authorId
        const [podcast] = await db.select()
          .from(schema.podcasts)
          .where(eq(schema.podcasts.id, generation.podcastId))

        if (podcast?.authorId) {
          // 3. 取得作者的預設人設
          const [persona] = await db.select()
            .from(schema.authorPersonas)
            .where(and(
              eq(schema.authorPersonas.authorId, podcast.authorId),
              eq(schema.authorPersonas.isDefault, true)
            ))

          if (persona) {
            // 將偏好指引附加到現有 persona 後面
            const newPersona = persona.persona
              ? `${persona.persona}\n\n${learningResult.preferenceGuidelines}`
              : learningResult.preferenceGuidelines

            await db.update(schema.authorPersonas)
              .set({ persona: newPersona, updatedAt: new Date() })
              .where(eq(schema.authorPersonas.id, persona.id))
          } else {
            // 如果沒有人設，創建一個新的
            await db.insert(schema.authorPersonas).values({
              id: nanoid(),
              authorId: podcast.authorId,
              name: '預設',
              isDefault: true,
              isActive: true,
              persona: learningResult.preferenceGuidelines,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date()
            })
          }
        }
      }
    } catch (error) {
      // 同步人設失敗不影響主流程，只記錄錯誤
      console.error('Failed to sync preference to author persona:', error)
    }
  }

  return {
    success: true,
    learning: learningResult
  }
})
