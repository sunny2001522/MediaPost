export interface AudioChunk {
  index: number
  localPath: string     // 本地暫存檔案路徑
  startTime: number     // seconds
  endTime: number       // seconds
  duration: number      // seconds
}

export interface ChunkingOptions {
  maxChunkSizeMB?: number    // Default: 20MB (under 25MB limit)
  maxChunkDurationS?: number // Default: 600s (10 minutes)
  overlapSeconds?: number    // Default: 5s
}

export interface TranscriptionResult {
  transcript: string
  duration?: number
}

export interface AudioMetadata {
  duration: number
  format: string
  sizeBytes: number
  bitrate?: number
}
