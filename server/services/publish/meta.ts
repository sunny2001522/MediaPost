/**
 * Meta Graph API 發布服務
 * 支援 Threads、Facebook、Instagram
 */

const THREADS_GRAPH_BASE = 'https://graph.threads.net/v1.0'
const META_GRAPH_BASE = 'https://graph.facebook.com/v19.0'

export interface MetaPublishResult {
  success: boolean
  postId?: string
  postUrl?: string
  error?: string
}

// ========== Threads ==========

/**
 * 發布到 Threads（兩步驟流程）
 * Step 1: 創建媒體容器
 * Step 2: 發布容器
 */
export async function publishToThreads(
  userId: string,
  content: string,
  accessToken: string,
  imageUrl?: string
): Promise<MetaPublishResult> {
  try {
    // Step 1: 創建媒體容器
    const createBody: Record<string, string> = {
      text: content,
      media_type: imageUrl ? 'IMAGE' : 'TEXT',
      access_token: accessToken,
    }

    if (imageUrl) {
      createBody.image_url = imageUrl
    }

    const createResponse = await fetch(`${THREADS_GRAPH_BASE}/${userId}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(error.error?.message || 'Failed to create Threads container')
    }

    const { id: creationId } = await createResponse.json()

    // Step 2: 發布
    const publishResponse = await fetch(`${THREADS_GRAPH_BASE}/${userId}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    })

    if (!publishResponse.ok) {
      const error = await publishResponse.json()
      throw new Error(error.error?.message || 'Failed to publish Threads')
    }

    const { id: postId } = await publishResponse.json()

    return {
      success: true,
      postId,
      postUrl: `https://www.threads.net/@${userId}/post/${postId}`,
    }
  } catch (error: any) {
    console.error('Threads publish error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

// ========== Facebook ==========

/**
 * 發布到 Facebook Page
 */
export async function publishToFacebook(
  pageId: string,
  content: string,
  accessToken: string,
  link?: string
): Promise<MetaPublishResult> {
  try {
    const body: Record<string, string> = {
      message: content,
      access_token: accessToken,
    }

    if (link) {
      body.link = link
    }

    const response = await fetch(`${META_GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Failed to publish to Facebook')
    }

    const { id: postId } = await response.json()

    return {
      success: true,
      postId,
      postUrl: `https://www.facebook.com/${postId}`,
    }
  } catch (error: any) {
    console.error('Facebook publish error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

// ========== Instagram ==========

/**
 * 發布到 Instagram（需要圖片，兩步驟流程）
 * Step 1: 創建媒體容器
 * Step 2: 發布容器
 */
export async function publishToInstagram(
  igUserId: string,
  imageUrl: string,
  caption: string,
  accessToken: string
): Promise<MetaPublishResult> {
  try {
    // Step 1: 創建媒體容器
    const createResponse = await fetch(`${META_GRAPH_BASE}/${igUserId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }),
    })

    if (!createResponse.ok) {
      const error = await createResponse.json()
      throw new Error(error.error?.message || 'Failed to create Instagram container')
    }

    const { id: creationId } = await createResponse.json()

    // Step 2: 發布
    const publishResponse = await fetch(`${META_GRAPH_BASE}/${igUserId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: creationId,
        access_token: accessToken,
      }),
    })

    if (!publishResponse.ok) {
      const error = await publishResponse.json()
      throw new Error(error.error?.message || 'Failed to publish to Instagram')
    }

    const { id: postId } = await publishResponse.json()

    return {
      success: true,
      postId,
      postUrl: `https://www.instagram.com/p/${postId}`,
    }
  } catch (error: any) {
    console.error('Instagram publish error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

// ========== 輔助函數 ==========

/**
 * 檢查 Token 是否有效
 */
export async function validateMetaToken(accessToken: string): Promise<{
  valid: boolean
  userId?: string
  expiresAt?: Date
  error?: string
}> {
  try {
    const response = await fetch(
      `${META_GRAPH_BASE}/debug_token?input_token=${accessToken}&access_token=${accessToken}`
    )

    if (!response.ok) {
      return { valid: false, error: 'Token validation failed' }
    }

    const { data } = await response.json()

    return {
      valid: data.is_valid,
      userId: data.user_id,
      expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
    }
  } catch (error: any) {
    return { valid: false, error: error.message }
  }
}
