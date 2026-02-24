import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { nanoid } from 'nanoid'

/**
 * Download CMoney Podcast audio to local temp directory
 * CMoney provides direct audio URLs, so no need for yt-dlp or Cobalt
 */
export async function downloadCMoneyAudio(audioUrl: string): Promise<{
  localPath: string
}> {
  console.log('[CMoney Audio] Downloading from:', audioUrl)

  // Fetch the audio file
  const response = await fetch(audioUrl)

  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  const audioBuffer = Buffer.from(await response.arrayBuffer())

  console.log(`[CMoney Audio] Downloaded ${audioBuffer.length} bytes, content-type: ${contentType}`)

  // Determine file extension from content type
  let extension = 'mp3'
  if (contentType.includes('mp4') || contentType.includes('m4a')) {
    extension = 'm4a'
  } else if (contentType.includes('wav')) {
    extension = 'wav'
  } else if (contentType.includes('ogg')) {
    extension = 'ogg'
  }

  // Save to local temp directory
  const tempPath = join(tmpdir(), `cmoney-${nanoid()}.${extension}`)
  await fs.writeFile(tempPath, audioBuffer)

  console.log(`[CMoney Audio] Saved to local: ${tempPath}`)

  return {
    localPath: tempPath,
  }
}

/**
 * Cleanup CMoney audio file from local temp directory
 */
export async function cleanupCMoneyAudio(localPath: string): Promise<void> {
  await fs.unlink(localPath).catch(() => {})
}
