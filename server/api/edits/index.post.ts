import { learningEngine } from '~/server/services/learning/LearningEngine'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

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

  return {
    success: true,
    learning: learningResult
  }
})
