import { nanoid } from 'nanoid'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { constants } from 'fs'

const execAsync = promisify(exec)

// Check if cookies file exists
async function getCookiesArg(): Promise<string> {
  const cookiesPath = join(process.cwd(), 'cookies.txt')
  try {
    await access(cookiesPath, constants.R_OK)
    return `--cookies "${cookiesPath}"`
  } catch {
    return ''
  }
}

/**
 * Download YouTube audio using yt-dlp (local) or Cobalt API (fallback)
 * Returns local file path instead of uploading to Vercel Blob
 */
export async function downloadYouTubeAudio(youtubeUrl: string): Promise<{
  localPath: string
}> {
  console.log('[YouTube] Downloading audio from:', youtubeUrl)

  // Try yt-dlp first (more reliable)
  try {
    return await downloadWithYtDlp(youtubeUrl)
  } catch (error: any) {
    console.warn('[YouTube] yt-dlp failed, trying Cobalt:', error.message)
  }

  // Fallback to Cobalt API
  return await downloadWithCobalt(youtubeUrl)
}

/**
 * Download using yt-dlp (local installation)
 */
async function downloadWithYtDlp(youtubeUrl: string): Promise<{
  localPath: string
}> {
  const tempFile = join(tmpdir(), `yt-${nanoid()}.mp3`)

  try {
    console.log('[YouTube] Using yt-dlp to download...')

    // Download audio using yt-dlp with cookies file if available
    const cookiesArg = await getCookiesArg()
    console.log('[YouTube] Cookies arg:', cookiesArg || '(none)')

    const { stdout, stderr } = await execAsync(
      `yt-dlp -x --audio-format mp3 --audio-quality 0 ${cookiesArg} -o "${tempFile}" "${youtubeUrl}"`,
      { timeout: 300000 } // 5 minutes timeout
    )

    if (stderr && !stderr.includes('Deleting')) {
      console.log('[YouTube] yt-dlp stderr:', stderr)
    }

    console.log('[YouTube] Audio saved to:', tempFile)

    return {
      localPath: tempFile,
    }
  } catch (error) {
    // Cleanup temp file on error
    await unlink(tempFile).catch(() => {})
    throw error
  }
}

/**
 * Download using Cobalt API (fallback)
 */
async function downloadWithCobalt(youtubeUrl: string): Promise<{
  localPath: string
}> {
  // Try multiple Cobalt API instances
  const cobaltInstances = [
    'https://api.cobalt.tools',
    'https://cobalt-api.hyper.lol',
  ]

  let cobaltData: any = null
  let lastError: Error | null = null

  for (const instance of cobaltInstances) {
    try {
      console.log(`[YouTube] Trying Cobalt instance: ${instance}`)

      const cobaltResponse = await fetch(`${instance}/api/json`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: youtubeUrl,
          aFormat: 'mp3',
          isAudioOnly: true,
        }),
      })

      if (!cobaltResponse.ok) {
        throw new Error(`Cobalt API error: ${cobaltResponse.status}`)
      }

      cobaltData = await cobaltResponse.json()

      if (cobaltData.status === 'error') {
        throw new Error(cobaltData.text || 'Failed to process YouTube URL')
      }

      break
    } catch (error: any) {
      console.warn(`[YouTube] Cobalt instance ${instance} failed:`, error.message)
      lastError = error
      continue
    }
  }

  if (!cobaltData || cobaltData.status === 'error') {
    throw lastError || new Error('All Cobalt instances failed')
  }

  const audioUrl = cobaltData.url
  if (!audioUrl) {
    throw new Error('No audio URL in Cobalt response')
  }

  console.log('[YouTube] Got audio URL, downloading...')

  const audioResponse = await fetch(audioUrl)
  if (!audioResponse.ok) {
    throw new Error(`Failed to download audio: ${audioResponse.status}`)
  }

  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer())

  // Save to local temp directory
  const tempFile = join(tmpdir(), `yt-${nanoid()}.mp3`)
  await writeFile(tempFile, audioBuffer)

  console.log('[YouTube] Audio saved to:', tempFile)

  return {
    localPath: tempFile,
  }
}

/**
 * Cleanup YouTube audio file from local temp directory
 */
export async function cleanupYouTubeAudio(localPath: string): Promise<void> {
  await unlink(localPath).catch(() => {})
}
