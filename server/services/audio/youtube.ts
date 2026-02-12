import { put, del } from '@vercel/blob'
import { nanoid } from 'nanoid'

/**
 * Download YouTube audio using cobalt.tools API
 * Cobalt is a free, open-source service for downloading YouTube audio
 */
export async function downloadYouTubeAudio(youtubeUrl: string): Promise<{
  url: string
  pathname: string
}> {
  const config = useRuntimeConfig()

  console.log('[YouTube] Downloading audio from:', youtubeUrl)

  // Use cobalt.tools API for YouTube audio extraction
  const cobaltResponse = await fetch('https://api.cobalt.tools/api/json', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: youtubeUrl,
      vCodec: 'h264',
      vQuality: '720',
      aFormat: 'mp3',
      isAudioOnly: true,
      filenamePattern: 'basic',
    }),
  })

  if (!cobaltResponse.ok) {
    throw new Error(`Cobalt API error: ${cobaltResponse.status}`)
  }

  const cobaltData = await cobaltResponse.json()

  if (cobaltData.status === 'error') {
    throw new Error(cobaltData.text || 'Failed to process YouTube URL')
  }

  // Download the audio file
  const audioUrl = cobaltData.url
  const audioResponse = await fetch(audioUrl)

  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`)
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

  // Upload to Vercel Blob
  const pathname = `youtube/${nanoid()}.mp3`
  const blob = await put(pathname, audioBuffer, {
    access: 'public',
    token: config.blobReadWriteToken,
    contentType: 'audio/mpeg',
  })

  console.log('[YouTube] Audio uploaded to:', blob.url)

  return {
    url: blob.url,
    pathname: blob.pathname,
  }
}

/**
 * Cleanup YouTube audio file from Vercel Blob
 */
export async function cleanupYouTubeAudio(audioUrl: string): Promise<void> {
  const config = useRuntimeConfig()
  await del(audioUrl, { token: config.blobReadWriteToken }).catch(() => {})
}
