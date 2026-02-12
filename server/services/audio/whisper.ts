import OpenAI from 'openai'
import { toFile } from 'openai/uploads'
import * as OpenCC from 'opencc-js'
import type { AudioChunk, TranscriptionResult } from './types'

// Simplified to Traditional Chinese converter (Taiwan)
const convertToTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' })

let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    const config = useRuntimeConfig()
    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
    })
  }
  return openaiClient
}

/**
 * Transcribe a single audio file (must be under 25MB)
 */
export async function transcribeSingle(audioUrl: string): Promise<TranscriptionResult> {
  const openai = getOpenAI()

  // Download audio
  const response = await fetch(audioUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`)
  }

  const audioBuffer = Buffer.from(await response.arrayBuffer())

  // Create file object for OpenAI
  const file = await toFile(audioBuffer, 'audio.mp3', {
    type: 'audio/mpeg',
  })

  // Call Whisper API
  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'zh',
    response_format: 'verbose_json',
  })

  return {
    transcript: transcription.text,
    duration: transcription.duration,
  }
}

/**
 * Transcribe multiple chunks and merge results
 */
export async function transcribeChunks(chunks: AudioChunk[]): Promise<TranscriptionResult> {
  const results: Array<{
    chunk: AudioChunk
    result: TranscriptionResult
  }> = []

  // Process chunks sequentially to maintain order
  for (const chunk of chunks) {
    console.log(`[Whisper] Transcribing chunk ${chunk.index + 1}/${chunks.length}`)

    const result = await transcribeSingle(chunk.url)
    results.push({ chunk, result })
  }

  // Merge transcripts
  return mergeTranscripts(results)
}

/**
 * Merge multiple transcription results
 */
function mergeTranscripts(
  results: Array<{ chunk: AudioChunk; result: TranscriptionResult }>
): TranscriptionResult {
  if (results.length === 1) {
    return formatTranscript(results[0].result)
  }

  // Simple concatenation - the overlap ensures no words are cut
  // We take full transcripts from each chunk since OpenAI handles word boundaries well
  const mergedText = results.map(r => r.result.transcript).join(' ')

  // Calculate total duration from the last chunk's end time
  const lastChunk = results[results.length - 1].chunk
  const totalDuration = lastChunk.endTime

  return formatTranscript({
    transcript: mergedText,
    duration: totalDuration,
  })
}

/**
 * Format transcript (convert to Traditional Chinese, add line breaks)
 */
function formatTranscript(result: TranscriptionResult): TranscriptionResult {
  let text = convertToTraditional(result.transcript)

  // Replace spaces with newlines (Chinese doesn't need word spacing)
  text = text.replace(/ +/g, '\n')
  // Add newlines after sentence-ending punctuation
  text = text.replace(/([。？！])\s*/g, '$1\n')
  // Collapse multiple newlines
  text = text.replace(/\n+/g, '\n')

  return {
    ...result,
    transcript: text.trim(),
  }
}
