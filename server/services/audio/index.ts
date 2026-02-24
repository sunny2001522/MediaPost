import { createChunks, cleanupChunks, getMetadata, downloadToTemp } from './chunker'
import { transcribeSingle, transcribeChunks } from './whisper'
import { downloadYouTubeAudio, cleanupYouTubeAudio } from './youtube'
import { promises as fs } from 'fs'
import type { TranscriptionResult, ChunkingOptions } from './types'

// Re-export types
export * from './types'

// Max file size for direct transcription (24MB to leave buffer under 25MB limit)
const MAX_DIRECT_SIZE_MB = 24

/**
 * Transcribe audio from local file path (handles chunking automatically)
 */
export async function transcribeFromPath(
  audioPath: string,
  options?: ChunkingOptions
): Promise<TranscriptionResult> {
  // Get file metadata
  const metadata = await getMetadata(audioPath)
  const sizeMB = metadata.sizeBytes / (1024 * 1024)

  console.log(`[AudioService] Processing audio: ${sizeMB.toFixed(2)}MB`)

  // If small enough, transcribe directly
  if (sizeMB <= MAX_DIRECT_SIZE_MB) {
    console.log('[AudioService] Direct transcription (no chunking needed)')
    return transcribeSingle(audioPath)
  }

  // Need to chunk the audio
  console.log('[AudioService] Chunking required')
  const chunks = await createChunks(audioPath, options)

  try {
    const result = await transcribeChunks(chunks)
    return result
  } finally {
    // Always cleanup chunks
    await cleanupChunks(chunks)
  }
}

/**
 * Transcribe audio from URL (downloads to temp first, then transcribes)
 * This is for backward compatibility with uploaded audio URLs
 */
export async function transcribeFromUrl(
  audioUrl: string,
  options?: ChunkingOptions
): Promise<TranscriptionResult> {
  console.log('[AudioService] Downloading audio from URL:', audioUrl)

  // Download to temp file
  const tempPath = await downloadToTemp(audioUrl)

  try {
    // Transcribe from local path
    return await transcribeFromPath(tempPath, options)
  } finally {
    // Cleanup temp file
    await fs.unlink(tempPath).catch(() => {})
  }
}

/**
 * Process YouTube video: download, chunk if needed, transcribe
 */
export async function transcribeYouTube(youtubeUrl: string): Promise<TranscriptionResult> {
  console.log('[AudioService] Processing YouTube:', youtubeUrl)

  // Download YouTube audio to local temp
  const { localPath } = await downloadYouTubeAudio(youtubeUrl)

  try {
    // Transcribe the downloaded audio
    const result = await transcribeFromPath(localPath)
    return result
  } finally {
    // Cleanup the YouTube audio from local temp
    await cleanupYouTubeAudio(localPath)
  }
}
