import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { useDB, schema } from '~/server/database/client'
import { publishToThreads, publishToFacebook, publishToInstagram } from '~/server/services/publish/meta'
import { getValidToken, publishToForum, extractStockTags, publishToBlog, convertToHtml, formatStockTagsForBlog } from '~/server/services/cmoney'
import { getValidThreadsToken } from '~/server/services/threads/auth'

interface PublishBody {
  editId?: string
  podcastId?: string
  projectId?: string
  content: string
  platforms: string[]
  platformConfigs?: Record<string, {
    accessToken?: string
    userId?: string
    pageId?: string
    imageUrl?: string
    link?: string
    // CMoney 同學會專用
    title?: string // 文章標題
    authorId?: string // 指定作者 ID（如果無法從 podcast/project 推斷）
    articleType?: 'personal' | 'group_v1' | 'group_v2' // 發文類型
    boardId?: string // 社團v2 的 board ID
  }>
}

export default defineEventHandler(async (event) => {
  const body = await readBody<PublishBody>(event)
  const { editId, podcastId, projectId, content, platforms, platformConfigs } = body

  if (!content || !platforms || platforms.length === 0) {
    throw createError({
      statusCode: 400,
      message: 'Missing required fields: content, platforms'
    })
  }

  const db = useDB()
  const results: Array<{ platform: string; status: string; postUrl?: string; postId?: string; error?: string }> = []

  for (const platform of platforms) {
    const config = platformConfigs?.[platform] || {}
    const recordId = nanoid()

    try {
      if (platform === 'clipboard') {
        // 剪貼簿由前端處理，這裡只記錄
        await db.insert(schema.publishRecords).values({
          id: recordId,
          editId: editId || null,
          podcastId: podcastId || null,
          projectId: projectId || null,
          platform: 'clipboard',
          content,
          status: 'success',
          createdAt: new Date()
        })
        results.push({ platform: 'clipboard', status: 'success' })

      } else if (platform === 'threads') {
        // Threads 發布 - 自動從 DB 讀取 token
        let threadsToken: string | undefined = config.accessToken
        let threadsUserId: string | undefined = config.userId

        // 如果前端沒直接傳 token，從 DB 取得（透過 authorId）
        if (!threadsToken || !threadsUserId) {
          let authorId: string | null = null

          if (podcastId) {
            const podcast = await db.query.podcasts.findFirst({
              where: eq(schema.podcasts.id, podcastId),
            })
            authorId = podcast?.authorId || null
          }
          if (!authorId && projectId) {
            const project = await db.query.projects.findFirst({
              where: eq(schema.projects.id, projectId),
            })
            authorId = project?.authorId || null
          }
          if (!authorId && config.authorId) {
            authorId = config.authorId
          }

          if (authorId) {
            try {
              const tokenData = await getValidThreadsToken(authorId)
              threadsToken = tokenData.accessToken
              threadsUserId = tokenData.userId
            } catch (error: any) {
              await db.insert(schema.publishRecords).values({
                id: recordId,
                editId: editId || null,
                podcastId: podcastId || null,
                projectId: projectId || null,
                platform: 'threads',
                content,
                status: 'failed',
                errorMessage: error.message || '請先連結 Threads 帳號',
                createdAt: new Date(),
              })
              results.push({
                platform: 'threads',
                status: 'failed',
                error: error.message || '請先連結 Threads 帳號',
              })
              continue
            }
          }
        }

        if (!threadsToken || !threadsUserId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform: 'threads',
            content,
            status: 'failed',
            errorMessage: '無法取得 Threads 認證，請先連結 Threads 帳號',
            createdAt: new Date()
          })
          results.push({
            platform: 'threads',
            status: 'failed',
            error: '無法取得 Threads 認證，請先連結 Threads 帳號'
          })
          continue
        }

        const result = await publishToThreads(
          threadsUserId,
          content,
          threadsToken,
          config.imageUrl
        )

        await db.insert(schema.publishRecords).values({
          id: recordId,
          editId: editId || null,
          podcastId: podcastId || null,
          projectId: projectId || null,
          platform: 'threads',
          content,
          status: result.success ? 'success' : 'failed',
          platformPostId: result.postId || null,
          postUrl: result.postUrl || null,
          errorMessage: result.error || null,
          createdAt: new Date()
        })

        results.push({
          platform: 'threads',
          status: result.success ? 'success' : 'failed',
          postId: result.postId,
          postUrl: result.postUrl,
          error: result.error
        })

      } else if (platform === 'facebook') {
        // Facebook 發布
        if (!config.accessToken || !config.pageId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform: 'facebook',
            content,
            status: 'failed',
            errorMessage: 'Missing Facebook access token or page ID',
            createdAt: new Date()
          })
          results.push({
            platform: 'facebook',
            status: 'failed',
            error: 'Missing Facebook access token or page ID. Please configure in settings.'
          })
          continue
        }

        const result = await publishToFacebook(
          config.pageId,
          content,
          config.accessToken,
          config.link
        )

        await db.insert(schema.publishRecords).values({
          id: recordId,
          editId: editId || null,
          podcastId: podcastId || null,
          projectId: projectId || null,
          platform: 'facebook',
          content,
          status: result.success ? 'success' : 'failed',
          platformPostId: result.postId || null,
          postUrl: result.postUrl || null,
          errorMessage: result.error || null,
          createdAt: new Date()
        })

        results.push({
          platform: 'facebook',
          status: result.success ? 'success' : 'failed',
          postId: result.postId,
          postUrl: result.postUrl,
          error: result.error
        })

      } else if (platform === 'instagram') {
        // Instagram 發布（需要圖片）
        if (!config.accessToken || !config.userId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform: 'instagram',
            content,
            status: 'failed',
            errorMessage: 'Missing Instagram access token or user ID',
            createdAt: new Date()
          })
          results.push({
            platform: 'instagram',
            status: 'failed',
            error: 'Missing Instagram access token or user ID. Please configure in settings.'
          })
          continue
        }

        if (!config.imageUrl) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform: 'instagram',
            content,
            status: 'failed',
            errorMessage: 'Instagram requires an image URL',
            createdAt: new Date()
          })
          results.push({
            platform: 'instagram',
            status: 'failed',
            error: 'Instagram requires an image URL'
          })
          continue
        }

        const result = await publishToInstagram(
          config.userId,
          config.imageUrl,
          content,
          config.accessToken
        )

        await db.insert(schema.publishRecords).values({
          id: recordId,
          editId: editId || null,
          podcastId: podcastId || null,
          projectId: projectId || null,
          platform: 'instagram',
          content,
          status: result.success ? 'success' : 'failed',
          platformPostId: result.postId || null,
          postUrl: result.postUrl || null,
          errorMessage: result.error || null,
          createdAt: new Date()
        })

        results.push({
          platform: 'instagram',
          status: result.success ? 'success' : 'failed',
          postId: result.postId,
          postUrl: result.postUrl,
          error: result.error
        })

      } else if (platform === 'cmoney_classmate' || platform === 'cmoney') {
        // CMoney 同學會發文
        // 需要先取得作者資訊來獲取認證
        let authorId: string | null = null

        // 嘗試從 podcastId 或 projectId 取得 authorId
        if (podcastId) {
          const podcast = await db.query.podcasts.findFirst({
            where: eq(schema.podcasts.id, podcastId),
          })
          authorId = podcast?.authorId || null
        }
        if (!authorId && projectId) {
          const project = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
          })
          authorId = project?.authorId || null
        }

        // 如果還是沒有 authorId，嘗試從 config 取得
        if (!authorId && config.authorId) {
          authorId = config.authorId
        }

        if (!authorId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: '無法確定作者，請確保有關聯的 podcast 或 project',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: '無法確定作者，請確保有關聯的 podcast 或 project',
          })
          continue
        }

        // 取得作者資訊檢查是否有 CMoney 認證
        const author = await db.query.authors.findFirst({
          where: eq(schema.authors.id, authorId),
        })

        const hasCMoneyAuth = author?.cmoneyClientId && (
          (author?.cmoneyAccount && author?.cmoneyPassword) || author?.cmoneyRefreshToken
        )
        if (!hasCMoneyAuth) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: '作者未設定 CMoney 認證，請先至作者設定頁面設定',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: '作者未設定 CMoney 認證，請先至作者設定頁面設定',
          })
          continue
        }

        try {
          // 取得有效 Token
          const token = await getValidToken(authorId)

          // AI 提取股票標籤
          const stockTags = await extractStockTags(content)

          // 組合標題（使用 config.title 或取內容前 50 字）
          const title = config.title || content.slice(0, 50).replace(/\n/g, ' ')

          // 從 project outputConfig 取得 articleType 和 boardId
          let articleType = config.articleType as 'personal' | 'group_v1' | 'group_v2' | undefined
          let boardId = config.boardId

          // 如果 config 沒有，嘗試從 project outputConfig 取得
          if (!articleType && projectId) {
            const proj = await db.query.projects.findFirst({
              where: eq(schema.projects.id, projectId),
            })
            if (proj?.outputConfig) {
              const outputConfig = typeof proj.outputConfig === 'string'
                ? JSON.parse(proj.outputConfig)
                : proj.outputConfig
              const cmoneyConfig = outputConfig?.cmoney_classmate || outputConfig?.cmoney
              if (cmoneyConfig) {
                articleType = cmoneyConfig.articleType
                boardId = boardId || cmoneyConfig.boardId
              }
            }
          }

          // 發文
          const result = await publishToForum({
            accessToken: token,
            title,
            text: content,
            stockTags,
            imageUrls: config.imageUrl ? [config.imageUrl] : [],
            articleType,
            boardId,
          })

          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: result.success ? 'success' : 'failed',
            platformPostId: result.articleId || null,
            postUrl: result.articleUrl || null,
            errorMessage: result.error || null,
            createdAt: new Date(),
          })

          results.push({
            platform,
            status: result.success ? 'success' : 'failed',
            postId: result.articleId,
            postUrl: result.articleUrl,
            error: result.error,
          })
        } catch (error: any) {
          console.error(`[Publish] CMoney 發文錯誤:`, error)
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: error.message || '發文時發生錯誤',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: error.message || '發文時發生錯誤',
          })
        }

      } else if (platform === 'investment_blog') {
        // 投資網誌發文
        // 需要先取得作者資訊來獲取認證
        let authorId: string | null = null

        // 嘗試從 podcastId 或 projectId 取得 authorId
        if (podcastId) {
          const podcast = await db.query.podcasts.findFirst({
            where: eq(schema.podcasts.id, podcastId),
          })
          authorId = podcast?.authorId || null
        }
        if (!authorId && projectId) {
          const project = await db.query.projects.findFirst({
            where: eq(schema.projects.id, projectId),
          })
          authorId = project?.authorId || null
        }

        // 如果還是沒有 authorId，嘗試從 config 取得
        if (!authorId && config.authorId) {
          authorId = config.authorId
        }

        if (!authorId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: '無法確定作者，請確保有關聯的 podcast 或 project',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: '無法確定作者，請確保有關聯的 podcast 或 project',
          })
          continue
        }

        // 取得作者資訊檢查是否有投資網誌認證
        const author = await db.query.authors.findFirst({
          where: eq(schema.authors.id, authorId),
        })

        if (!author?.blogAuthorSlug || !author?.blogUserId) {
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: '作者未設定投資網誌認證，請先至作者設定頁面設定',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: '作者未設定投資網誌認證，請先至作者設定頁面設定',
          })
          continue
        }

        try {
          // AI 提取股票標籤並轉換為投資網誌格式
          const extractedStocks = await extractStockTags(content)
          const stockTags = formatStockTagsForBlog(extractedStocks)

          // 組合標題（使用 config.title 或取內容前 50 字）
          const title = config.title || content.slice(0, 50).replace(/\n/g, ' ')

          // 將內容轉換為 HTML
          const htmlContent = convertToHtml(content)

          // 發文（使用 Admin API）
          const result = await publishToBlog({
            userId: author.blogUserId,
            authorSlug: author.blogAuthorSlug,
            title,
            content: htmlContent,
            stockTags,
            previewImgUrl: config.imageUrl,
          })

          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: result.success ? 'success' : 'failed',
            platformPostId: result.articleId || null,
            postUrl: result.articleUrl || null,
            errorMessage: result.error || null,
            createdAt: new Date(),
          })

          results.push({
            platform,
            status: result.success ? 'success' : 'failed',
            postId: result.articleId,
            postUrl: result.articleUrl,
            error: result.error,
          })
        } catch (error: any) {
          console.error(`[Publish] 投資網誌發文錯誤:`, error)
          await db.insert(schema.publishRecords).values({
            id: recordId,
            editId: editId || null,
            podcastId: podcastId || null,
            projectId: projectId || null,
            platform,
            content,
            status: 'failed',
            errorMessage: error.message || '發文時發生錯誤',
            createdAt: new Date(),
          })
          results.push({
            platform,
            status: 'failed',
            error: error.message || '發文時發生錯誤',
          })
        }

      } else if (platform === 'line_community') {
        // Line 社群 - 需要 Google Form 整合
        await db.insert(schema.publishRecords).values({
          id: recordId,
          editId: editId || null,
          podcastId: podcastId || null,
          projectId: projectId || null,
          platform,
          content,
          status: 'pending',
          createdAt: new Date()
        })
        results.push({
          platform,
          status: 'pending',
          error: 'Line Community integration pending. Content saved for manual posting.'
        })

      } else {
        // 未知平台
        results.push({
          platform,
          status: 'failed',
          error: `Unknown platform: ${platform}`
        })
      }

    } catch (error: any) {
      console.error(`Publish error for ${platform}:`, error)
      results.push({
        platform,
        status: 'failed',
        error: error.message || 'Unknown error'
      })
    }
  }

  // 更新專案的 publishRecords 計數（如果有 projectId）
  // 這個統計會在 by-author API 中即時計算

  return {
    success: results.some(r => r.status === 'success'),
    results
  }
})
