import { put } from '@vercel/blob'
import { nanoid } from 'nanoid'

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = formData.find(f => f.name === 'file')

  if (!file || !file.data) {
    throw createError({ statusCode: 400, message: 'No file found in request' })
  }

  // 生成唯一檔名
  const ext = file.filename?.split('.').pop() || 'mp3'
  const filename = `audio/${nanoid()}.${ext}`

  // 上傳到 Vercel Blob
  const config = useRuntimeConfig()

  const blob = await put(filename, file.data, {
    access: 'public',
    token: config.blobReadWriteToken,
    contentType: file.type || 'audio/mpeg'
  })

  return {
    url: blob.url,
    pathname: blob.pathname
  }
})
