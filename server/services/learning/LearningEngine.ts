import { nanoid } from 'nanoid'
import { eq, desc } from 'drizzle-orm'
import { diffAnalyzer, type DiffResult } from './DiffAnalyzer'
import { analyzeEdit, generatePreferencePrompt } from '../openai'
import { useDB, schema } from '~/server/database/client'

export interface LearningResult {
  learned: boolean
  reason?: string
  patternsFound?: number
  preferencesUpdated?: number
  promptUpdated?: boolean
  editId?: string
}

export class LearningEngine {
  private db = useDB()

  async processEdit(
    generationId: string,
    originalContent: string,
    editedContent: string
  ): Promise<LearningResult> {
    // Stage 1: Diff 分析
    const diffResult = diffAnalyzer.analyze(originalContent, editedContent)

    // 修改太小，跳過學習
    if (diffResult.statistics.editSeverity < 0.05) {
      return { learned: false, reason: 'edit_too_minor' }
    }

    // 儲存編輯記錄
    const editId = nanoid()
    await this.db.insert(schema.edits).values({
      id: editId,
      generationId,
      originalContent,
      editedContent,
      diffOperations: JSON.stringify(diffResult.operations),
      editSeverity: diffResult.statistics.editSeverity,
      createdAt: new Date()
    })

    // Stage 2: 語義分析（GPT-4）
    const semanticResult = await analyzeEdit(originalContent, editedContent)

    // 更新編輯記錄的分析結果
    await this.db.update(schema.edits)
      .set({ analysisResult: JSON.stringify(semanticResult) })
      .where(eq(schema.edits.id, editId))

    // Stage 3: 模式聚合
    const patternsAdded = await this.aggregatePatterns(semanticResult.patterns)

    // Stage 4: 偏好推導
    const preferencesUpdated = await this.derivePreferences(semanticResult.suggestedPreferences)

    // Stage 5: 檢查是否需要更新 Prompt
    const promptUpdated = await this.checkAndUpdatePrompt()

    // 記錄學習事件
    await this.recordLearningEvents(patternsAdded, preferencesUpdated, promptUpdated)

    return {
      learned: true,
      patternsFound: patternsAdded,
      preferencesUpdated,
      promptUpdated,
      editId
    }
  }

  private async aggregatePatterns(patterns: any[]): Promise<number> {
    let added = 0

    for (const pattern of patterns) {
      // 查找相似的現有模式
      const existing = await this.db
        .select()
        .from(schema.editPatterns)
        .where(eq(schema.editPatterns.patternType, pattern.type))

      const similar = existing.find(e => this.isRuleSimilar(pattern.rule, JSON.parse(e.patternRule)))

      if (similar) {
        // 更新現有模式
        const newCount = similar.occurrenceCount + 1
        const newConfidence = Math.min(95, similar.confidence + Math.floor(20 / newCount))

        await this.db.update(schema.editPatterns)
          .set({
            occurrenceCount: newCount,
            confidence: newConfidence,
            lastSeenAt: new Date()
          })
          .where(eq(schema.editPatterns.id, similar.id))
      } else {
        // 創建新模式
        await this.db.insert(schema.editPatterns).values({
          id: nanoid(),
          patternType: pattern.type,
          patternDescription: pattern.description,
          patternRule: JSON.stringify(pattern.rule),
          occurrenceCount: 1,
          confidence: 30,
          lastSeenAt: new Date(),
          createdAt: new Date()
        })
        added++
      }
    }

    return added
  }

  private isRuleSimilar(rule1: any, rule2: any): boolean {
    if (rule1.from && rule2.from) {
      return rule1.from === rule2.from || rule1.to === rule2.to
    }
    return rule1.action === rule2.action
  }

  private async derivePreferences(suggestions: any[]): Promise<number> {
    let updated = 0

    for (const suggestion of suggestions) {
      // 查找現有偏好
      const [existing] = await this.db
        .select()
        .from(schema.learnedPreferences)
        .where(eq(schema.learnedPreferences.preferenceKey, suggestion.key))

      if (existing) {
        // 更新現有偏好（如果信心度更高）
        const newConfidence = Math.min(95, existing.confidence + 10)
        await this.db.update(schema.learnedPreferences)
          .set({
            preferenceValue: JSON.stringify(suggestion.value),
            confidence: newConfidence,
            updatedAt: new Date()
          })
          .where(eq(schema.learnedPreferences.id, existing.id))
      } else {
        // 創建新偏好
        await this.db.insert(schema.learnedPreferences).values({
          id: nanoid(),
          category: this.categorizePreference(suggestion.key),
          preferenceKey: suggestion.key,
          preferenceValue: JSON.stringify(suggestion.value),
          confidence: 40,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        updated++
      }
    }

    return updated
  }

  private categorizePreference(key: string): string {
    if (key.includes('tone') || key.includes('formality')) return 'tone'
    if (key.includes('length') || key.includes('sentence')) return 'length'
    if (key.includes('emoji')) return 'emoji'
    if (key.includes('structure') || key.includes('paragraph')) return 'structure'
    if (key.includes('vocab') || key.includes('word')) return 'vocabulary'
    return 'writing_style'
  }

  private async checkAndUpdatePrompt(): Promise<boolean> {
    // 獲取高信心度的偏好
    const preferences = await this.db
      .select()
      .from(schema.learnedPreferences)
      .where(eq(schema.learnedPreferences.isActive, true))

    const highConfidence = preferences.filter(p => p.confidence >= 60)

    if (highConfidence.length < 2) {
      return false
    }

    // 獲取當前活躍的 prompt 版本
    const [currentVersion] = await this.db
      .select()
      .from(schema.promptVersions)
      .where(eq(schema.promptVersions.isActive, true))
      .orderBy(desc(schema.promptVersions.version))
      .limit(1)

    // 生成新的用戶偏好指引
    const prefsForPrompt = highConfidence.map(p => ({
      key: p.preferenceKey,
      value: JSON.parse(p.preferenceValue),
      confidence: p.confidence
    }))

    const userAdditions = await generatePreferencePrompt(prefsForPrompt)

    // 創建新版本
    const basePrompt = currentVersion?.basePrompt || this.getDefaultBasePrompt()
    const newVersion = (currentVersion?.version || 0) + 1

    // 先將舊版本設為非活躍
    if (currentVersion) {
      await this.db.update(schema.promptVersions)
        .set({ isActive: false })
        .where(eq(schema.promptVersions.id, currentVersion.id))
    }

    // 創建新版本
    await this.db.insert(schema.promptVersions).values({
      id: nanoid(),
      version: newVersion,
      basePrompt,
      userAdditions,
      compiledPrompt: basePrompt + '\n\n## 用戶偏好風格\n' + userAdditions,
      isActive: true,
      changelog: `學習了 ${highConfidence.length} 個偏好`,
      createdAt: new Date()
    })

    return true
  }

  private getDefaultBasePrompt(): string {
    return `你是專業的 Podcast 內容轉貼文專家。請將 Podcast 逐字稿轉換為社群貼文。

## 要求
- 提取核心觀點和精華
- 使用吸引人的開頭
- 控制在 300-500 字
- 加入 3-5 個相關 hashtag`
  }

  private async recordLearningEvents(
    patternsAdded: number,
    preferencesUpdated: number,
    promptUpdated: boolean
  ) {
    const events = []

    if (patternsAdded > 0) {
      events.push({
        id: nanoid(),
        eventType: 'pattern_discovered',
        title: `發現 ${patternsAdded} 個寫作模式`,
        description: '從你的修改中學習到新的寫作偏好',
        impactLevel: 'medium',
        createdAt: new Date()
      })
    }

    if (preferencesUpdated > 0) {
      events.push({
        id: nanoid(),
        eventType: 'preference_learned',
        title: `更新 ${preferencesUpdated} 個偏好`,
        description: '你的寫作風格偏好已更新',
        impactLevel: 'medium',
        createdAt: new Date()
      })
    }

    if (promptUpdated) {
      events.push({
        id: nanoid(),
        eventType: 'prompt_updated',
        title: 'AI Prompt 已優化',
        description: '根據學習到的偏好自動調整生成風格',
        impactLevel: 'high',
        createdAt: new Date()
      })
    }

    if (events.length > 0) {
      await this.db.insert(schema.learningEvents).values(events)
    }
  }

  // 獲取當前活躍的用戶偏好指引
  async getActiveUserPreferences(): Promise<string | null> {
    const [version] = await this.db
      .select()
      .from(schema.promptVersions)
      .where(eq(schema.promptVersions.isActive, true))
      .orderBy(desc(schema.promptVersions.version))
      .limit(1)

    return version?.userAdditions || null
  }
}

export const learningEngine = new LearningEngine()
