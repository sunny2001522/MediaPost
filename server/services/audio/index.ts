import { createChunks, cleanupChunks, getAudioMetadata } from './chunker'
import { transcribeSingle, transcribeChunks } from './whisper'
import { downloadYouTubeAudio, cleanupYouTubeAudio } from './youtube'
import type { TranscriptionResult, ChunkingOptions } from './types'

// Re-export types
export * from './types'

// Max file size for direct transcription (24MB to leave buffer under 25MB limit)
const MAX_DIRECT_SIZE_MB = 24

/**
 * Transcribe audio from URL (handles chunking automatically)
 */
export async function transcribeFromUrl(
  audioUrl: string,
  options?: ChunkingOptions
): Promise<TranscriptionResult> {
  // Check file size first
  const headResponse = await fetch(audioUrl, { method: 'HEAD' })
  const contentLength = parseInt(headResponse.headers.get('content-length') || '0')
  const sizeMB = contentLength / (1024 * 1024)

  console.log(`[AudioService] Processing audio: ${sizeMB.toFixed(2)}MB`)

  // If small enough, transcribe directly
  if (sizeMB <= MAX_DIRECT_SIZE_MB) {
    console.log('[AudioService] Direct transcription (no chunking needed)')
    return transcribeSingle(audioUrl)
  }

  // Need to chunk the audio
  console.log('[AudioService] Chunking required')
  const chunks = await createChunks(audioUrl, options)

  try {
    const result = await transcribeChunks(chunks)
    return result
  } finally {
    // Always cleanup chunks
    await cleanupChunks(chunks)
  }
}

/**
 * Process YouTube video: download, chunk if needed, transcribe
 */
export async function transcribeYouTube(youtubeUrl: string): Promise<TranscriptionResult> {
  console.log('[AudioService] Processing YouTube:', youtubeUrl)

  // Download YouTube audio to Blob
  const { url: audioUrl } = await downloadYouTubeAudio(youtubeUrl)

  try {
    // Transcribe the downloaded audio
    const result = await transcribeFromUrl(audioUrl)
    return result
  } finally {
    // Cleanup the YouTube audio from Blob
    await cleanupYouTubeAudio(audioUrl)
  }
}
