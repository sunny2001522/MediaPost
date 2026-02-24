import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { nanoid } from 'nanoid'
import type { AudioChunk, ChunkingOptions, AudioMetadata } from './types'

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  maxChunkSizeMB: 20,
  maxChunkDurationS: 600, // 10 minutes
  overlapSeconds: 5,
}

/**
 * Get audio metadata using ffprobe
 */
export async function getMetadata(audioPath: string): Promise<AudioMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err)

      const audioStream = metadata.streams.find(s => s.codec_type === 'audio')
      resolve({
        duration: metadata.format.duration || 0,
        format: metadata.format.format_name || 'unknown',
        sizeBytes: metadata.format.size || 0,
        bitrate: audioStream?.bit_rate ? parseInt(audioStream.bit_rate as string) : undefined,
      })
    })
  })
}

/**
 * Download audio from URL to temporary file
 */
export async function downloadToTemp(audioUrl: string): Promise<string> {
  const tempPath = join(tmpdir(), `audio-${nanoid()}.mp3`)
  const response = await fetch(audioUrl)

  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.status}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await fs.writeFile(tempPath, buffer)

  return tempPath
}

/**
 * Calculate chunk boundaries based on duration
 */
export function calculateChunks(
  metadata: AudioMetadata,
  options: ChunkingOptions = {}
): Array<{ startTime: number; endTime: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { duration } = metadata

  // If small enough, no chunking needed
  const estimatedSizeMB = metadata.sizeBytes / (1024 * 1024)
  if (estimatedSizeMB <= opts.maxChunkSizeMB && duration <= opts.maxChunkDurationS) {
    return [{ startTime: 0, endTime: duration }]
  }

  const chunks: Array<{ startTime: number; endTime: number }> = []
  let currentStart = 0

  while (currentStart < duration) {
    const chunkEnd = Math.min(currentStart + opts.maxChunkDurationS, duration)
    chunks.push({
      startTime: currentStart,
      endTime: chunkEnd,
    })

    // Next chunk starts with overlap (unless this is the last chunk)
    if (chunkEnd < duration) {
      currentStart = chunkEnd - opts.overlapSeconds
    } else {
      break
    }
  }

  return chunks
}

/**
 * Extract a single audio chunk using ffmpeg
 */
export async function extractChunk(
  inputPath: string,
  startTime: number,
  endTime: number,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(endTime - startTime)
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioChannels(1)       // Mono reduces size
      .audioFrequency(16000)  // Whisper optimal frequency
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

/**
 * Process audio file and create chunks
 * Chunks are stored locally in temp directory
 */
export async function createChunks(
  audioPath: string,
  options: ChunkingOptions = {}
): Promise<AudioChunk[]> {
  const metadata = await getMetadata(audioPath)
  const chunkBoundaries = calculateChunks(metadata, options)

  console.log(`[AudioChunker] Creating ${chunkBoundaries.length} chunks for ${metadata.duration}s audio`)

  const chunks: AudioChunk[] = []

  for (let i = 0; i < chunkBoundaries.length; i++) {
    const { startTime, endTime } = chunkBoundaries[i]
    const tempChunkPath = join(tmpdir(), `chunk-${nanoid()}.mp3`)

    // Extract chunk
    await extractChunk(audioPath, startTime, endTime, tempChunkPath)

    chunks.push({
      index: i,
      localPath: tempChunkPath,
      startTime,
      endTime,
      duration: endTime - startTime,
    })

    console.log(`[AudioChunker] Created chunk ${i + 1}/${chunkBoundaries.length}: ${tempChunkPath}`)
  }

  return chunks
}

/**
 * Cleanup chunk files from local temp directory
 */
export async function cleanupChunks(chunks: AudioChunk[]): Promise<void> {
  await Promise.all(
    chunks.map(chunk =>
      fs.unlink(chunk.localPath).catch(() => {})
    )
  )
}

/**
 * Get audio metadata from URL (downloads to temp first)
 */
export async function getAudioMetadata(audioUrl: string): Promise<AudioMetadata> {
  const tempPath = await downloadToTemp(audioUrl)
  try {
    return await getMetadata(tempPath)
  } finally {
    await fs.unlink(tempPath).catch(() => {})
  }
}
