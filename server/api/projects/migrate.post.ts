import { useDB, schema } from '~/server/database/client'
import { eq, or } from 'drizzle-orm'

/**
 * 將現有專案從舊格式遷移到新的四維度格式
 * 舊格式: inputType = 'podcast_to_post'
 * 新格式: inputType = 'podcast', inputPlatform = 'apple_podcast', outputType = 'post'
 */
export default defineEventHandler(async () => {
  const db = useDB()
  const now = new Date()

  const results: Array<{
    projectId: string
    projectName: string
    oldInputType: string
    newFormat: {
      inputType: string
      inputPlatform: string
      outputType: string
    }
  }> = []

  // 查詢所有需要遷移的專案（使用舊格式的 inputType）
  const oldFormatProjects = await db.query.projects.findMany({
    where: or(
      eq(schema.projects.inputType, 'podcast_to_post'),
      eq(schema.projects.inputType, 'social_video_to_short'),
      eq(schema.projects.inputType, 'social_post_to_video'),
      eq(schema.projects.inputType, 'course_to_post')
    ),
  })

  // 遷移映射規則
  const migrationMap: Record<string, { inputType: string; inputPlatform: string; outputType: string }> = {
    'podcast_to_post': {
      inputType: 'podcast',
      inputPlatform: 'apple_podcast',
      outputType: 'post',
    },
    'social_video_to_short': {
      inputType: 'video',
      inputPlatform: 'internal_video',
      outputType: 'video',
    },
    'social_post_to_video': {
      inputType: 'post',
      inputPlatform: 'cmoney_classmate',
      outputType: 'video',
    },
    'course_to_post': {
      inputType: 'post',
      inputPlatform: 'internal_video',
      outputType: 'post',
    },
  }

  for (const project of oldFormatProjects) {
    const mapping = migrationMap[project.inputType]
    if (!mapping) continue

    // 更新專案
    await db.update(schema.projects)
      .set({
        inputType: mapping.inputType,
        inputPlatform: mapping.inputPlatform,
        outputType: mapping.outputType,
        updatedAt: now,
      })
      .where(eq(schema.projects.id, project.id))

    results.push({
      projectId: project.id,
      projectName: project.name,
      oldInputType: project.inputType,
      newFormat: mapping,
    })
  }

  return {
    success: true,
    message: `已遷移 ${results.length} 個專案`,
    migratedProjects: results,
  }
})
