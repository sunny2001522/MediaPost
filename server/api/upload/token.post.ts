import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'

export default defineEventHandler(async (event) => {
  const body = await readBody<HandleUploadBody>(event)
  const config = useRuntimeConfig()

  try {
    const jsonResponse = await handleUpload({
      body,
      request: event.node.req,
      token: config.blobReadWriteToken,
      onBeforeGenerateToken: async (pathname) => {
        // 驗證檔案類型
        const ext = pathname.split('.').pop()?.toLowerCase()
        const allowedTypes = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'webm', 'mp4']

        if (!ext || !allowedTypes.includes(ext)) {
          throw new Error('不支援的音檔格式')
        }

        return {
          allowedContentTypes: [
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/x-wav',
            'audio/mp4',
            'audio/x-m4a',
            'audio/ogg',
            'audio/flac',
            'audio/webm',
          ],
          maximumSizeInBytes: 200 * 1024 * 1024, // 200MB
          tokenPayload: JSON.stringify({
            uploadedAt: new Date().toISOString(),
          }),
        }
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[Upload] Completed:', blob.url)
      },
    })

    return jsonResponse
  } catch (error: any) {
    console.error('[Upload Token] Error:', error)
    throw createError({
      statusCode: 400,
      message: error.message || '上傳失敗',
    })
  }
})
