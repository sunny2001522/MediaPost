import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ========== 核心表 ==========

// 音檔/Podcast 記錄
export const podcasts = sqliteTable('podcasts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  sourceType: text('source_type').notNull(), // 'upload' | 'youtube'
  sourceUrl: text('source_url'),
  audioFileUrl: text('audio_file_url'), // Vercel Blob URL
  transcript: text('transcript'),
  transcriptSegments: text('transcript_segments'), // JSON: 時間戳記
  duration: integer('duration'), // 秒
  status: text('status').notNull().default('pending'),
  // 'pending' | 'downloading' | 'transcribing' | 'generating' | 'completed' | 'error'
  errorMessage: text('error_message'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// AI 生成的貼文
export const generations = sqliteTable('generations', {
  id: text('id').primaryKey(),
  podcastId: text('podcast_id').notNull().references(() => podcasts.id, { onDelete: 'cascade' }),

  // AI 生成內容
  originalContent: text('original_content').notNull(),

  // Prompt 版本追蹤
  promptVersionId: text('prompt_version_id').references(() => promptVersions.id),
  promptSnapshot: text('prompt_snapshot'), // 完整 prompt 快照

  // 生成參數
  model: text('model').default('gpt-4'),
  temperature: real('temperature').default(0.7),
  tokenCount: integer('token_count'),
  generationTimeMs: integer('generation_time_ms'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// 用戶編輯記錄
export const edits = sqliteTable('edits', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }),

  // 編輯內容
  originalContent: text('original_content').notNull(),
  editedContent: text('edited_content').notNull(),

  // 結構化差異
  diffOperations: text('diff_operations').notNull(), // JSON
  editSeverity: real('edit_severity'), // 0-1 修改幅度

  // AI 分析結果
  analysisResult: text('analysis_result'), // JSON: 修改意圖、模式

  // 用戶滿意度
  isSatisfied: integer('is_satisfied', { mode: 'boolean' }),
  editDurationMs: integer('edit_duration_ms'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ========== 學習系統表 ==========

// 修改模式
export const editPatterns = sqliteTable('edit_patterns', {
  id: text('id').primaryKey(),

  patternType: text('pattern_type').notNull(),
  // 'replacement' | 'deletion' | 'addition' | 'restructure' | 'tone_shift'

  patternDescription: text('pattern_description').notNull(),
  patternRule: text('pattern_rule').notNull(), // JSON

  occurrenceCount: integer('occurrence_count').notNull().default(1),
  confidence: integer('confidence').notNull(), // 0-100

  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// 學習到的偏好
export const learnedPreferences = sqliteTable('learned_preferences', {
  id: text('id').primaryKey(),

  category: text('category').notNull(),
  // 'writing_style' | 'tone' | 'length' | 'structure' | 'vocabulary' | 'emoji'

  preferenceKey: text('preference_key').notNull(),
  preferenceValue: text('preference_value').notNull(), // JSON

  confidence: integer('confidence').notNull(), // 0-100
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  userConfirmed: integer('user_confirmed', { mode: 'boolean' }),

  evidencePatternIds: text('evidence_pattern_ids'), // JSON array

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Prompt 版本
export const promptVersions = sqliteTable('prompt_versions', {
  id: text('id').primaryKey(),

  version: integer('version').notNull(),

  basePrompt: text('base_prompt').notNull(),
  userAdditions: text('user_additions'), // 學習到的偏好轉換成的指引
  compiledPrompt: text('compiled_prompt').notNull(),

  // 效能指標
  avgEditSeverity: real('avg_edit_severity'),
  satisfactionRate: real('satisfaction_rate'),
  usageCount: integer('usage_count').default(0),

  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  changelog: text('changelog'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// 學習事件日誌（UI 展示用）
export const learningEvents = sqliteTable('learning_events', {
  id: text('id').primaryKey(),

  eventType: text('event_type').notNull(),
  // 'pattern_discovered' | 'preference_learned' | 'prompt_updated'

  title: text('title').notNull(),
  description: text('description').notNull(),

  relatedEntityType: text('related_entity_type'),
  relatedEntityId: text('related_entity_id'),

  impactLevel: text('impact_level'), // 'low' | 'medium' | 'high'

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ========== 發布系統表 ==========

// 社交帳號連接
export const socialAccounts = sqliteTable('social_accounts', {
  id: text('id').primaryKey(),

  platform: text('platform').notNull(), // 'threads'
  platformUserId: text('platform_user_id'),

  accessToken: text('access_token'), // 加密儲存
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// 發布記錄
export const publishRecords = sqliteTable('publish_records', {
  id: text('id').primaryKey(),
  editId: text('edit_id').references(() => edits.id),

  platform: text('platform').notNull(), // 'threads' | 'cmoney' | 'clipboard'
  content: text('content').notNull(),

  status: text('status').notNull(), // 'pending' | 'success' | 'failed'
  platformPostId: text('platform_post_id'),
  postUrl: text('post_url'),

  errorMessage: text('error_message'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ========== 型別匯出 ==========

export type Podcast = typeof podcasts.$inferSelect
export type NewPodcast = typeof podcasts.$inferInsert

export type Generation = typeof generations.$inferSelect
export type NewGeneration = typeof generations.$inferInsert

export type Edit = typeof edits.$inferSelect
export type NewEdit = typeof edits.$inferInsert

export type EditPattern = typeof editPatterns.$inferSelect
export type NewEditPattern = typeof editPatterns.$inferInsert

export type LearnedPreference = typeof learnedPreferences.$inferSelect
export type NewLearnedPreference = typeof learnedPreferences.$inferInsert

export type PromptVersion = typeof promptVersions.$inferSelect
export type NewPromptVersion = typeof promptVersions.$inferInsert

export type LearningEvent = typeof learningEvents.$inferSelect
export type NewLearningEvent = typeof learningEvents.$inferInsert

export type SocialAccount = typeof socialAccounts.$inferSelect
export type NewSocialAccount = typeof socialAccounts.$inferInsert

export type PublishRecord = typeof publishRecords.$inferSelect
export type NewPublishRecord = typeof publishRecords.$inferInsert
