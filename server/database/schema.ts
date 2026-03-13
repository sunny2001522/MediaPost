import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

// ========== 常量定義 ==========

// 媒材類型（輸入/輸出）
export const MEDIA_TYPES = {
  PODCAST: 'podcast',   // Podcast 音訊
  VIDEO: 'video',       // 影片
  POST: 'post',         // 貼文
} as const

// 平台（輸入/輸出）
export const PLATFORMS = {
  CMONEY_CLASSMATE: 'cmoney_classmate',   // 同學會
  LINE_COMMUNITY: 'line_community',       // Line 社群
  THREADS: 'threads',                      // Threads
  FACEBOOK: 'facebook',                    // FB
  INSTAGRAM: 'instagram',                  // IG
  INVESTMENT_BLOG: 'investment_blog',     // 投資網誌
  INTERNAL_VIDEO: 'internal_video',       // 內部影音
  YOUTUBE: 'youtube',                      // YouTube（僅輸出）
  APPLE_PODCAST: 'apple_podcast',         // Apple Podcast（輸入）
} as const

// 舊版相容
export const INPUT_TYPES = {
  SOCIAL_POST_TO_VIDEO: 'social_post_to_video',
  SOCIAL_VIDEO_TO_SHORT: 'social_video_to_short',
  PODCAST_TO_POST: 'podcast_to_post',
  COURSE_TO_POST: 'course_to_post',
} as const

export const OUTPUT_PLATFORMS = PLATFORMS

export type MediaType = typeof MEDIA_TYPES[keyof typeof MEDIA_TYPES]
export type Platform = typeof PLATFORMS[keyof typeof PLATFORMS]
export type InputType = typeof INPUT_TYPES[keyof typeof INPUT_TYPES]
export type OutputPlatform = typeof OUTPUT_PLATFORMS[keyof typeof OUTPUT_PLATFORMS]

// ========== 核心表 ==========

// 作者表
export const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').unique(), // 英文音譯，用於 URL（如 gushi-yinzhe）
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  // CMoney 整合 - 內容抓取
  cmoneyPodcastTrackId: text('cmoney_podcast_track_id'), // CMoney Podcast TrackId
  cmoneyYoutubeChannelId: text('cmoney_youtube_channel_id'), // CMoney YouTube 頻道 ID
  // CMoney 整合 - 同學會發文認證
  cmoneyClientId: text('cmoney_client_id'), // OAuth Client ID
  cmoneyAccount: text('cmoney_account'), // 登入 email
  cmoneyPassword: text('cmoney_password'), // 密碼
  cmoneyAccessToken: text('cmoney_access_token'), // 快取的 Token
  cmoneyTokenExpiresAt: integer('cmoney_token_expires_at', { mode: 'timestamp' }), // Token 到期時間
  cmoneyRefreshToken: text('cmoney_refresh_token'), // Refresh Token（用於 grant_type=refresh_token）
  // CMoney 整合 - 投資網誌發文認證（使用 outpost.cmoney.tw 測試機）
  blogClientId: text('blog_client_id'), // 投資網誌 OAuth Client ID
  blogAccount: text('blog_account'), // 投資網誌登入 email
  blogPassword: text('blog_password'), // 投資網誌密碼
  blogAccessToken: text('blog_access_token'), // 投資網誌快取的 Token
  blogTokenExpiresAt: integer('blog_token_expires_at', { mode: 'timestamp' }), // 投資網誌 Token 到期時間
  blogAuthorSlug: text('blog_author_slug'), // 投資網誌作者 slug（如 "cmoney"）
  blogUserId: text('blog_user_id'), // 投資網誌 Admin API userId（如 "6870918203145058"）
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// 專案表
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  authorId: text('author_id').notNull()
    .references(() => authors.id, { onDelete: 'cascade' }),

  // 輸入配置
  inputType: text('input_type').notNull(), // MEDIA_TYPES: podcast / video / post
  inputPlatform: text('input_platform'), // PLATFORMS: 來源平台
  inputConfig: text('input_config'), // JSON: 輸入源特定配置

  // 輸出配置
  outputType: text('output_type'), // MEDIA_TYPES: podcast / video / post
  outputPlatforms: text('output_platforms').notNull(), // JSON array: PLATFORMS
  outputConfig: text('output_config'), // JSON: 各平台特定配置

  // 排程配置
  isAutoSync: integer('is_auto_sync', { mode: 'boolean' }).default(true),
  syncInterval: integer('sync_interval').default(4), // 小時
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),

  // 狀態
  isActive: integer('is_active', { mode: 'boolean' }).default(true),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// 作者人設表
export const authorPersonas = sqliteTable('author_personas', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),

  // 基本設定
  name: text('name').notNull(), // 人設名稱（如「預設」「活潑版」）
  isDefault: integer('is_default', { mode: 'boolean' }).default(true),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),

  // 人設內容
  persona: text('persona'), // 主要人設描述（自由文字）
  sloganToIgnore: text('slogan_to_ignore'), // 要忽略的 slogan
  styleGuidelines: text('style_guidelines'), // 風格指引

  // 版本控制
  version: integer('version').notNull().default(1),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// 音檔/Podcast 記錄
export const podcasts = sqliteTable('podcasts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  authorId: text('author_id').references(() => authors.id, { onDelete: 'set null' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }), // 關聯專案
  sourceType: text('source_type').notNull(), // 'upload' | 'youtube' | 'cmoney'
  sourceUrl: text('source_url'),
  audioFileUrl: text('audio_file_url'), // Vercel Blob URL
  transcript: text('transcript'),
  transcriptSegments: text('transcript_segments'), // JSON: 時間戳記
  youtubeDescription: text('youtube_description'), // YouTube 影片描述（行銷摘要）
  duration: integer('duration'), // 秒
  status: text('status').notNull().default('pending'),
  // 'pending' | 'downloading' | 'transcribing' | 'generating' | 'completed' | 'error'
  publishStatus: text('publish_status').default('pending'), // 'pending' | 'partial' | 'completed'
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

  // 批次資訊（多切角生成）
  batchIndex: integer('batch_index').notNull().default(0),
  angleCategory: text('angle_category'), // 使用的切角類別

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

// ========== CMoney Podcast 監控表 ==========

// CMoney Podcast 集數記錄（用於去重）
export const cmoneyPodcastEpisodes = sqliteTable('cmoney_podcast_episodes', {
  id: text('id').primaryKey(),

  // CMoney 原始資料
  audioUrl: text('audio_url').notNull().unique(), // 去重關鍵
  pubDate: text('pub_date').notNull(), // ISO 格式日期字串，用於分頁
  trackId: text('track_id').notNull(), // 所屬的 TrackId
  title: text('title'), // 標題（如果 API 有提供）

  // 處理狀態
  processStatus: text('process_status').notNull().default('pending'),
  // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  podcastId: text('podcast_id').references(() => podcasts.id, { onDelete: 'set null' }),

  // 發現來源
  discoverySource: text('discovery_source').notNull(),
  // 'cron' | 'manual'

  // 錯誤追蹤
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),

  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
})

// ========== YouTube 頻道監控表 ==========

// YouTube 頻道訂閱
export const youtubeChannels = sqliteTable('youtube_channels', {
  id: text('id').primaryKey(),
  channelId: text('channel_id').notNull().unique(), // YouTube Channel ID (UC...)
  channelTitle: text('channel_title'),
  channelUrl: text('channel_url'),

  // 關聯作者（自動處理時使用）
  authorId: text('author_id').references(() => authors.id, { onDelete: 'set null' }),

  // 訂閱狀態
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  webhookSecret: text('webhook_secret').notNull(), // 驗證用密鑰
  subscriptionStatus: text('subscription_status').notNull().default('pending'),
  // 'pending' | 'subscribed' | 'expired' | 'failed'
  subscriptionExpiresAt: integer('subscription_expires_at', { mode: 'timestamp' }),
  subscriptionError: text('subscription_error'),

  // 輪詢備份機制
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
  lastVideoPublishedAt: integer('last_video_published_at', { mode: 'timestamp' }),

  // 統計
  totalVideosProcessed: integer('total_videos_processed').default(0),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// YouTube 影片記錄（用於去重）
export const youtubeVideos = sqliteTable('youtube_videos', {
  id: text('id').primaryKey(),
  videoId: text('video_id').notNull().unique(), // YouTube Video ID（去重關鍵）
  channelId: text('channel_id').notNull(), // YouTube Channel ID

  // 影片元資料
  title: text('title'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),

  // 處理狀態
  processStatus: text('process_status').notNull().default('pending'),
  // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  podcastId: text('podcast_id').references(() => podcasts.id, { onDelete: 'set null' }),

  // 發現來源（用於診斷）
  discoverySource: text('discovery_source').notNull(),
  // 'pubsub' | 'cron' | 'manual'

  // 錯誤追蹤
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').default(0),

  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
})

// ========== 投資網誌文章表 ==========

// 投資網誌文章記錄（用於去重 + 追蹤處理狀態）
export const blogArticles = sqliteTable('blog_articles', {
  id: text('id').primaryKey(),

  // 投資網誌原始資料
  articleId: text('article_id').notNull().unique(), // 去重關鍵
  authorId: text('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),
  blogAuthorSlug: text('blog_author_slug').notNull(), // 投資網誌作者 slug
  title: text('title').notNull(),
  content: text('content').notNull(), // 純文字版
  tags: text('tags'), // JSON array
  articleCreatedAt: integer('article_created_at'), // 原始發布時間 (Unix ms)
  pricingModel: text('pricing_model'), // 'free' | 'paid'

  // 處理狀態
  processStatus: text('process_status').notNull().default('pending'),
  // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  publishRecordId: text('publish_record_id').references(() => publishRecords.id, { onDelete: 'set null' }),

  // 錯誤追蹤
  errorMessage: text('error_message'),

  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
})

// ========== 同學會文章表 ==========

// 同學會文章記錄（用於去重 + 追蹤處理狀態）
export const groupArticles = sqliteTable('group_articles', {
  id: text('id').primaryKey(),

  // 同學會原始資料
  articleId: text('article_id').notNull().unique(), // 去重關鍵（CMoney articleId）
  authorId: text('author_id').notNull().references(() => authors.id, { onDelete: 'cascade' }),
  boardId: text('board_id').notNull(), // 社團 Board ID
  creatorId: integer('creator_id'), // CMoney 會員 ID
  creatorName: text('creator_name'), // 發文者名稱
  title: text('title'), // 文章標題
  content: text('content').notNull(), // 文章內容
  articleCreatedAt: integer('article_created_at'), // 原始發布時間 (Unix ms)

  // 處理狀態
  processStatus: text('process_status').notNull().default('pending'),
  // 'pending' | 'processing' | 'completed' | 'failed' | 'skipped'
  publishRecordId: text('publish_record_id').references(() => publishRecords.id, { onDelete: 'set null' }),

  // 錯誤追蹤
  errorMessage: text('error_message'),

  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).notNull(),
  processedAt: integer('processed_at', { mode: 'timestamp' }),
})

// ========== 發布系統表 ==========

// 社交帳號連接
export const socialAccounts = sqliteTable('social_accounts', {
  id: text('id').primaryKey(),

  authorId: text('author_id').notNull()
    .references(() => authors.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(), // 'threads'
  platformUserId: text('platform_user_id'),
  platformUsername: text('platform_username'), // e.g. Threads @username

  accessToken: text('access_token'), // 加密儲存
  tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// 發布記錄
export const publishRecords = sqliteTable('publish_records', {
  id: text('id').primaryKey(),
  editId: text('edit_id').references(() => edits.id),
  podcastId: text('podcast_id').references(() => podcasts.id, { onDelete: 'cascade' }), // 關聯 podcast
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }), // 關聯專案

  platform: text('platform').notNull(), // 'threads' | 'cmoney' | 'clipboard' | OUTPUT_PLATFORMS
  content: text('content').notNull(),

  status: text('status').notNull(), // 'pending' | 'success' | 'failed'
  platformPostId: text('platform_post_id'),
  postUrl: text('post_url'),

  errorMessage: text('error_message'),

  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ========== 型別匯出 ==========

export type Author = typeof authors.$inferSelect
export type NewAuthor = typeof authors.$inferInsert

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

export type AuthorPersona = typeof authorPersonas.$inferSelect
export type NewAuthorPersona = typeof authorPersonas.$inferInsert

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

export type YoutubeChannel = typeof youtubeChannels.$inferSelect
export type NewYoutubeChannel = typeof youtubeChannels.$inferInsert

export type YoutubeVideo = typeof youtubeVideos.$inferSelect
export type NewYoutubeVideo = typeof youtubeVideos.$inferInsert

export type CmoneyPodcastEpisode = typeof cmoneyPodcastEpisodes.$inferSelect
export type NewCmoneyPodcastEpisode = typeof cmoneyPodcastEpisodes.$inferInsert

export type BlogArticle = typeof blogArticles.$inferSelect
export type NewBlogArticle = typeof blogArticles.$inferInsert

export type GroupArticle = typeof groupArticles.$inferSelect
export type NewGroupArticle = typeof groupArticles.$inferInsert
