import { upload } from '@vercel/blob/client'

interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

interface UploadResult {
  url: string
  pathname: string
}

export function useClientUpload() {
  const isUploading = ref(false)
  const progress = ref<UploadProgress>({ loaded: 0, total: 0, percentage: 0 })
  const error = ref<string | null>(null)

  async function uploadFile(file: File): Promise<UploadResult> {
    if (isUploading.value) {
      throw new Error('已有上傳進行中')
    }

    isUploading.value = true
    error.value = null
    progress.value = { loaded: 0, total: file.size, percentage: 0 }

    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload/token',
        onUploadProgress: (progressEvent) => {
          progress.value = {
            loaded: progressEvent.loaded,
            total: progressEvent.total,
            percentage: Math.round((progressEvent.loaded / progressEvent.total) * 100),
          }
        },
      })

      return {
        url: blob.url,
        pathname: blob.pathname,
      }
    } catch (err: any) {
      error.value = err.message || '上傳失敗'
      throw err
    } finally {
      isUploading.value = false
    }
  }

  function reset() {
    isUploading.value = false
    progress.value = { loaded: 0, total: 0, percentage: 0 }
    error.value = null
  }

  return {
    uploadFile,
    isUploading: readonly(isUploading),
    progress: readonly(progress),
    error: readonly(error),
    reset,
  }
}
