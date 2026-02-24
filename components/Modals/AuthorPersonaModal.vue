<script setup lang="ts">
import type { AuthorPersona } from '~/server/database/schema'

// 擴展 AuthorPersona 類型，包含從 authors 表取得的 CMoney 欄位
interface AuthorPersonaWithCMoney extends Partial<AuthorPersona> {
  cmoneyPodcastTrackId?: string | null
  cmoneyYoutubeChannelId?: string | null
}

interface YoutubeChannel {
  id: string
  channelId: string
  channelTitle: string | null
  channelUrl: string | null
  isActive: boolean
  subscriptionStatus: string
  totalVideosProcessed: number | null
  createdAt: Date
}

interface Props {
  authorId: string
  authorName: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  saved: []
}>()

const isOpen = defineModel<boolean>({ default: false })

// Tab 狀態
const activeTab = ref(0)
const tabs = [
  { label: '人設設定', icon: 'i-heroicons-user-circle' },
  { label: 'YouTube 頻道', icon: 'i-heroicons-video-camera' },
  { label: 'CMoney', icon: 'i-heroicons-signal' },
]

// ========== 人設相關 ==========
const persona = ref('')
const sloganToIgnore = ref('')
const styleGuidelines = ref('')
const isLoading = ref(false)
const isSaving = ref(false)

// ========== CMoney 相關 ==========
const cmoneyPodcastTrackId = ref('')
const cmoneyYoutubeChannelId = ref('')
const isSyncingPodcast = ref(false)
const isSyncingYoutube = ref(false)

// 集數列表
interface PodcastEpisode {
  id: number
  title: string
  description: string
  pubDate: number
  audioUrl: string
  duration: number
  syncStatus: 'not_synced' | 'pending' | 'processing' | 'completed' | 'failed'
  errorMessage: string | null
  retryCount: number
  podcastId: string | null
}

interface EpisodeSummary {
  total: number
  synced: number
  processing: number
  failed: number
  notSynced: number
  episodeRange: { min: number; max: number } | null
}

const episodes = ref<PodcastEpisode[]>([])
const episodeSummary = ref<EpisodeSummary | null>(null)
const isLoadingEpisodes = ref(false)
const selectedEpisodes = ref<Set<string>>(new Set())
const isRetrying = ref(false)

// 同步範圍選擇
const syncRange = ref({
  from: '',
  to: '',
})
const isSyncingRange = ref(false)

// 進階同步 Modal（已改用集數列表方式，保留以便相容）
const isAdvancedSyncModalOpen = ref(false)
const isAdvancedSyncing = ref(false)
const advancedSyncForm = ref({
  titlePattern: '',
  maxEpisodes: 60,
  forceResync: false,
})

// 集數列表 Modal
const isEpisodeListModalOpen = ref(false)

// ========== YouTube 頻道相關 ==========
const channels = ref<YoutubeChannel[]>([])
const isLoadingChannels = ref(false)
const newChannelUrl = ref('')
const isAddingChannel = ref(false)

// 批次爬取 Modal
const isBatchModalOpen = ref(false)
const selectedChannel = ref<YoutubeChannel | null>(null)
const batchForm = ref({
  mode: 'past' as 'past' | 'future',
  pastDays: 30,
  maxVideos: 10,
})
const isBatchProcessing = ref(false)

// 開啟時載入現有人設和頻道
watch(isOpen, async (open) => {
  if (open && props.authorId) {
    activeTab.value = 0
    await Promise.all([loadPersona(), loadChannels()])
  }
})

// 當 authorId 變更時也重新載入
watch(() => props.authorId, async (newId) => {
  if (isOpen.value && newId) {
    await Promise.all([loadPersona(), loadChannels()])
  }
})

async function loadPersona() {
  isLoading.value = true
  try {
    const data = await $fetch<AuthorPersonaWithCMoney | null>(`/api/authors/${props.authorId}/persona`)
    if (data) {
      persona.value = data.persona || ''
      sloganToIgnore.value = data.sloganToIgnore || ''
      styleGuidelines.value = data.styleGuidelines || ''
      cmoneyPodcastTrackId.value = data.cmoneyPodcastTrackId || ''
      cmoneyYoutubeChannelId.value = data.cmoneyYoutubeChannelId || ''
    } else {
      persona.value = ''
      sloganToIgnore.value = ''
      styleGuidelines.value = ''
      cmoneyPodcastTrackId.value = ''
      cmoneyYoutubeChannelId.value = ''
    }
  } catch (error) {
    console.error('Failed to load persona:', error)
  } finally {
    isLoading.value = false
  }
}

async function loadChannels() {
  isLoadingChannels.value = true
  try {
    channels.value = await $fetch<YoutubeChannel[]>(`/api/authors/${props.authorId}/channels`)
  } catch (error) {
    console.error('Failed to load channels:', error)
    channels.value = []
  } finally {
    isLoadingChannels.value = false
  }
}

async function savePersona() {
  isSaving.value = true
  try {
    await $fetch(`/api/authors/${props.authorId}/persona`, {
      method: 'PUT',
      body: {
        persona: persona.value || null,
        sloganToIgnore: sloganToIgnore.value || null,
        styleGuidelines: styleGuidelines.value || null,
        cmoneyPodcastTrackId: cmoneyPodcastTrackId.value || null,
        cmoneyYoutubeChannelId: cmoneyYoutubeChannelId.value || null,
      },
    })
    useToast().add({
      title: '人設已更新',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    emit('saved')
  } catch (error: any) {
    useToast().add({
      title: '儲存失敗',
      description: error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

// ========== YouTube 頻道操作 ==========
async function addChannel() {
  if (!newChannelUrl.value.trim()) return

  isAddingChannel.value = true
  try {
    await $fetch('/api/youtube/channels', {
      method: 'POST',
      body: {
        channelUrl: newChannelUrl.value,
        authorId: props.authorId,
      },
    })
    useToast().add({
      title: '頻道已新增',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    newChannelUrl.value = ''
    await loadChannels()
  } catch (error: any) {
    useToast().add({
      title: '新增失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isAddingChannel.value = false
  }
}

async function deleteChannel(channel: YoutubeChannel) {
  if (!confirm(`確定要刪除「${channel.channelTitle}」的訂閱嗎？`)) return

  try {
    await $fetch(`/api/youtube/channels/${channel.id}`, { method: 'DELETE' })
    useToast().add({
      title: '頻道已刪除',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    await loadChannels()
  } catch (error: any) {
    useToast().add({
      title: '刪除失敗',
      description: error.data?.message || '請稍後再試',
      color: 'red',
    })
  }
}

function openBatchModal(channel: YoutubeChannel) {
  selectedChannel.value = channel
  batchForm.value = { mode: 'past', pastDays: 30, maxVideos: 10 }
  isBatchModalOpen.value = true
}

async function startBatchProcess() {
  if (!selectedChannel.value) return

  isBatchProcessing.value = true
  try {
    const result = await $fetch('/api/youtube/batch-process', {
      method: 'POST',
      body: {
        channelId: selectedChannel.value.channelId,
        mode: batchForm.value.mode,
        pastDays: batchForm.value.pastDays,
        maxVideos: batchForm.value.maxVideos,
      },
    })
    useToast().add({
      title: '批次處理已開始',
      description: `已加入 ${(result as any).videosQueued} 部影片到處理佇列`,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    isBatchModalOpen.value = false
  } catch (error: any) {
    useToast().add({
      title: '處理失敗',
      description: error.data?.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isBatchProcessing.value = false
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'subscribed': return 'green'
    case 'pending': return 'yellow'
    case 'failed': return 'red'
    case 'expired': return 'orange'
    default: return 'gray'
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'subscribed': return '已訂閱'
    case 'pending': return '等待中'
    case 'failed': return '失敗'
    case 'expired': return '已過期'
    default: return status
  }
}

// ========== CMoney Podcast 集數相關 ==========
async function loadEpisodes() {
  if (!cmoneyPodcastTrackId.value) return

  isLoadingEpisodes.value = true
  try {
    const result = await $fetch<{ episodes: PodcastEpisode[], summary: EpisodeSummary }>(
      `/api/cmoney/podcasts/episodes?authorId=${props.authorId}`
    )
    episodes.value = result.episodes
    episodeSummary.value = result.summary

    // 自動設定同步範圍為尚未同步的最舊到最新
    if (result.summary.episodeRange) {
      syncRange.value.from = ''
      syncRange.value.to = ''
    }
  } catch (error) {
    console.error('Failed to load episodes:', error)
    episodes.value = []
    episodeSummary.value = null
  } finally {
    isLoadingEpisodes.value = false
  }
}

function openEpisodeListModal() {
  isEpisodeListModalOpen.value = true
  loadEpisodes()
}

function getEpisodeNumber(title: string): number | null {
  const match = title?.match(/EP(\d+)/i)
  return match ? parseInt(match[1]) : null
}

function getEpisodeStatusColor(status: string) {
  switch (status) {
    case 'completed': return 'green'
    case 'processing': return 'blue'
    case 'pending': return 'yellow'
    case 'failed': return 'red'
    case 'not_synced': return 'gray'
    default: return 'gray'
  }
}

function getEpisodeStatusText(status: string) {
  switch (status) {
    case 'completed': return '已完成'
    case 'processing': return '轉錄中'
    case 'pending': return '等待中'
    case 'failed': return '失敗'
    case 'not_synced': return '未同步'
    default: return status
  }
}

async function retryFailedEpisodes(audioUrls?: string[]) {
  isRetrying.value = true
  try {
    const result = await $fetch('/api/cmoney/podcasts/retry', {
      method: 'POST',
      body: {
        authorId: props.authorId,
        audioUrls: audioUrls,
        retryAll: !audioUrls,
      },
    })
    useToast().add({
      title: '重試已開始',
      description: (result as any).message,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    // 重新載入列表
    await loadEpisodes()
  } catch (error: any) {
    useToast().add({
      title: '重試失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isRetrying.value = false
  }
}

async function syncEpisodeRange() {
  const from = parseInt(syncRange.value.from)
  const to = parseInt(syncRange.value.to)

  if (isNaN(from) || isNaN(to) || from > to) {
    useToast().add({
      title: '請輸入正確的集數範圍',
      description: '起始集數須小於或等於結束集數',
      color: 'red',
    })
    return
  }

  // 生成 EP 編號的正則表達式
  // 例如 from=345, to=352 => EP34[5-9]|EP35[0-2]
  const titlePattern = generateEpisodePattern(from, to)

  isSyncingRange.value = true
  try {
    const result = await $fetch('/api/cmoney/podcasts/sync', {
      method: 'POST',
      body: {
        authorId: props.authorId,
        maxEpisodes: 100,
        titlePattern,
        forceResync: false,
      },
    })
    useToast().add({
      title: '同步已開始',
      description: (result as any).message,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    // 重新載入列表
    await loadEpisodes()
  } catch (error: any) {
    useToast().add({
      title: '同步失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSyncingRange.value = false
  }
}

function generateEpisodePattern(from: number, to: number): string {
  // 簡單方式：直接生成 EP345|EP346|EP347|... 的模式
  const episodes = []
  for (let i = from; i <= to; i++) {
    episodes.push(`EP${i}`)
  }
  return episodes.join('|')
}

// ========== CMoney 同步操作 ==========
async function syncCMoneyPodcast() {
  isSyncingPodcast.value = true
  try {
    const result = await $fetch('/api/cmoney/podcasts/sync', {
      method: 'POST',
      body: {
        authorId: props.authorId,
        maxEpisodes: 50,
      },
    })
    useToast().add({
      title: '同步成功',
      description: (result as any).message,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (error: any) {
    useToast().add({
      title: '同步失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSyncingPodcast.value = false
  }
}

function openAdvancedSyncModal() {
  advancedSyncForm.value = {
    titlePattern: '',
    maxEpisodes: 60,
    forceResync: false,
  }
  isAdvancedSyncModalOpen.value = true
}

async function startAdvancedSync() {
  isAdvancedSyncing.value = true
  try {
    const result = await $fetch('/api/cmoney/podcasts/sync', {
      method: 'POST',
      body: {
        authorId: props.authorId,
        maxEpisodes: advancedSyncForm.value.maxEpisodes,
        titlePattern: advancedSyncForm.value.titlePattern || undefined,
        forceResync: advancedSyncForm.value.forceResync,
      },
    })
    useToast().add({
      title: '同步成功',
      description: (result as any).message,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    isAdvancedSyncModalOpen.value = false
  } catch (error: any) {
    useToast().add({
      title: '同步失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isAdvancedSyncing.value = false
  }
}

async function syncCMoneyYoutube() {
  isSyncingYoutube.value = true
  try {
    const result = await $fetch('/api/cmoney/youtube/sync', {
      method: 'POST',
      body: {
        authorId: props.authorId,
        maxVideos: 50,
      },
    })
    useToast().add({
      title: '同步成功',
      description: (result as any).message,
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (error: any) {
    useToast().add({
      title: '同步失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSyncingYoutube.value = false
  }
}
</script>

<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard :ui="{ ring: 'ring-1 ring-gray-200', divide: 'divide-y divide-gray-100' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-gray-600" />
          <span class="font-semibold text-gray-900">
            「{{ authorName }}」設定
          </span>
        </div>
      </template>

      <!-- Tabs -->
      <UTabs v-model="activeTab" :items="tabs" class="w-full">
        <template #default="{ item, selected }">
          <div class="flex items-center gap-2 truncate">
            <UIcon :name="item.icon" class="w-4 h-4 flex-shrink-0" />
            <span class="truncate">{{ item.label }}</span>
          </div>
        </template>
      </UTabs>

      <!-- Tab 1: 人設設定 -->
      <div v-show="activeTab === 0" class="mt-4">
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
        </div>

        <div v-else class="space-y-4">
          <p class="text-sm text-gray-500">
            設定此作者的寫作風格、語氣、特色用語等，AI 生成貼文時會遵循這些指引。
          </p>

          <UFormGroup label="人設描述">
            <UTextarea
              v-model="persona"
              :rows="6"
              placeholder="例如：語氣親切幽默、喜歡用比喻說明複雜概念、常以問句引導讀者思考、段落簡短有力..."
              autoresize
            />
          </UFormGroup>

          <UFormGroup label="要忽略的 Slogan（選填）">
            <UInput
              v-model="sloganToIgnore"
              placeholder="例如：歡迎收看老簡講股、先讚後看腰纏萬貫"
            />
            <template #hint>
              <span class="text-xs text-gray-400">Podcast 中的開場白或結尾語，AI 生成時會忽略這些內容</span>
            </template>
          </UFormGroup>

          <UFormGroup label="風格指引（選填）">
            <UTextarea
              v-model="styleGuidelines"
              :rows="3"
              placeholder="例如：專注於實質投資觀點、市場分析、個股解讀"
              autoresize
            />
            <template #hint>
              <span class="text-xs text-gray-400">額外的寫作風格指引，讓 AI 更貼近作者特色</span>
            </template>
          </UFormGroup>

          <div class="flex justify-end pt-2">
            <UButton
              color="black"
              :loading="isSaving"
              :disabled="isLoading"
              @click="savePersona"
            >
              儲存人設
            </UButton>
          </div>
        </div>
      </div>

      <!-- Tab 2: YouTube 頻道 (原有的 YouTube PubSub 訂閱) -->
      <div v-show="activeTab === 1" class="mt-4">
        <div v-if="isLoadingChannels" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
        </div>

        <div v-else class="space-y-4">
          <p class="text-sm text-gray-500">
            訂閱 YouTube 頻道後，新影片會自動轉錄並以此作者的人設生成貼文。
          </p>

          <!-- 新增頻道 -->
          <div class="flex gap-2">
            <UInput
              v-model="newChannelUrl"
              class="flex-1"
              placeholder="輸入 YouTube 頻道網址或 @username"
              @keyup.enter="addChannel"
            />
            <UButton
              :loading="isAddingChannel"
              :disabled="!newChannelUrl.trim()"
              @click="addChannel"
            >
              新增
            </UButton>
          </div>

          <!-- 頻道列表 -->
          <div v-if="channels.length === 0" class="text-center py-8 text-gray-400">
            <UIcon name="i-heroicons-video-camera" class="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>尚未訂閱任何頻道</p>
          </div>

          <div v-else class="space-y-2 max-h-64 overflow-y-auto">
            <div
              v-for="channel in channels"
              :key="channel.id"
              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-medium text-gray-900 truncate">
                    {{ channel.channelTitle || '未知頻道' }}
                  </span>
                  <UBadge :color="getStatusColor(channel.subscriptionStatus)" size="xs">
                    {{ getStatusText(channel.subscriptionStatus) }}
                  </UBadge>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  已處理 {{ channel.totalVideosProcessed || 0 }} 部影片
                </div>
              </div>

              <div class="flex items-center gap-1 ml-2">
                <UButton
                  color="primary"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-arrow-path"
                  @click="openBatchModal(channel)"
                >
                  爬取
                </UButton>
                <UButton
                  color="red"
                  variant="ghost"
                  size="xs"
                  icon="i-heroicons-trash"
                  @click="deleteChannel(channel)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 3: CMoney 整合 -->
      <div v-show="activeTab === 2" class="mt-4">
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
        </div>

        <div v-else class="space-y-6">
          <p class="text-sm text-gray-500">
            連接 CMoney 平台，自動取得 Podcast 和 YouTube 影片並處理。
          </p>

          <!-- CMoney Podcast -->
          <div class="p-4 bg-gray-50 rounded-lg space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-microphone" class="w-5 h-5 text-purple-500" />
              <span class="font-medium">CMoney Podcast</span>
            </div>

            <UFormGroup label="Podcast TrackId">
              <UInput
                v-model="cmoneyPodcastTrackId"
                placeholder="例如：1602637578"
              />
              <template #hint>
                <span class="text-xs text-gray-400">
                  CMoney Podcast 節目的 TrackId，用於自動取得歷史 Podcast 集數
                </span>
              </template>
            </UFormGroup>

            <div class="flex justify-end gap-2">
              <UButton
                :disabled="!cmoneyPodcastTrackId"
                variant="ghost"
                size="sm"
                icon="i-heroicons-list-bullet"
                @click="openEpisodeListModal"
              >
                集數列表
              </UButton>
              <UButton
                :loading="isSyncingPodcast"
                :disabled="!cmoneyPodcastTrackId"
                variant="soft"
                icon="i-heroicons-arrow-path"
                @click="syncCMoneyPodcast"
              >
                同步最新
              </UButton>
            </div>
          </div>

          <!-- CMoney YouTube -->
          <div class="p-4 bg-gray-50 rounded-lg space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-video-camera" class="w-5 h-5 text-red-500" />
              <span class="font-medium">CMoney YouTube</span>
            </div>

            <UFormGroup label="YouTube 頻道 ID">
              <UInput
                v-model="cmoneyYoutubeChannelId"
                placeholder="例如：UC-_yPPKswADJNcIV_jEoGLA"
              />
              <template #hint>
                <span class="text-xs text-gray-400">
                  YouTube 頻道 ID（UC 開頭），用於從 CMoney API 取得影片列表
                </span>
              </template>
            </UFormGroup>

            <div class="flex justify-end">
              <UButton
                :loading="isSyncingYoutube"
                :disabled="!cmoneyYoutubeChannelId"
                variant="soft"
                icon="i-heroicons-arrow-path"
                @click="syncCMoneyYoutube"
              >
                同步 YouTube
              </UButton>
            </div>
          </div>

          <!-- 儲存按鈕 -->
          <div class="flex justify-end pt-2">
            <UButton
              color="black"
              :loading="isSaving"
              :disabled="isLoading"
              @click="savePersona"
            >
              儲存設定
            </UButton>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton
            color="gray"
            variant="ghost"
            @click="isOpen = false"
          >
            關閉
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- Podcast 集數列表 Modal -->
  <UModal v-model="isEpisodeListModalOpen" :ui="{ width: 'sm:max-w-3xl' }">
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">Podcast 集數管理</h3>
            <p class="text-sm text-gray-500 mt-1">查看同步狀態、重試失敗的集數、或同步指定範圍</p>
          </div>
          <UButton
            variant="ghost"
            size="sm"
            icon="i-heroicons-arrow-path"
            :loading="isLoadingEpisodes"
            @click="loadEpisodes"
          />
        </div>
      </template>

      <div class="space-y-4">
        <!-- 狀態摘要 -->
        <div v-if="episodeSummary" class="grid grid-cols-5 gap-2 text-center">
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold">{{ episodeSummary.total }}</div>
            <div class="text-xs text-gray-500">總計</div>
          </div>
          <div class="p-2 bg-green-50 rounded">
            <div class="text-lg font-semibold text-green-600">{{ episodeSummary.synced }}</div>
            <div class="text-xs text-gray-500">已完成</div>
          </div>
          <div class="p-2 bg-blue-50 rounded">
            <div class="text-lg font-semibold text-blue-600">{{ episodeSummary.processing }}</div>
            <div class="text-xs text-gray-500">處理中</div>
          </div>
          <div class="p-2 bg-red-50 rounded">
            <div class="text-lg font-semibold text-red-600">{{ episodeSummary.failed }}</div>
            <div class="text-xs text-gray-500">失敗</div>
          </div>
          <div class="p-2 bg-gray-50 rounded">
            <div class="text-lg font-semibold text-gray-600">{{ episodeSummary.notSynced }}</div>
            <div class="text-xs text-gray-500">未同步</div>
          </div>
        </div>

        <!-- 同步指定範圍 -->
        <div class="p-3 bg-blue-50 rounded-lg">
          <div class="flex items-center gap-2 mb-2">
            <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-blue-500" />
            <span class="text-sm font-medium text-blue-700">同步指定集數範圍</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600">從 EP</span>
            <UInput
              v-model="syncRange.from"
              type="number"
              class="w-20"
              placeholder="345"
              size="sm"
            />
            <span class="text-sm text-gray-600">到 EP</span>
            <UInput
              v-model="syncRange.to"
              type="number"
              class="w-20"
              placeholder="352"
              size="sm"
            />
            <UButton
              size="sm"
              :loading="isSyncingRange"
              :disabled="!syncRange.from || !syncRange.to"
              @click="syncEpisodeRange"
            >
              同步
            </UButton>
          </div>
        </div>

        <!-- 失敗重試 -->
        <div v-if="episodeSummary && episodeSummary.failed > 0" class="p-3 bg-red-50 rounded-lg">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-red-500" />
              <span class="text-sm text-red-700">
                {{ episodeSummary.failed }} 個集數處理失敗
              </span>
            </div>
            <UButton
              size="sm"
              color="red"
              variant="soft"
              :loading="isRetrying"
              @click="retryFailedEpisodes()"
            >
              全部重試
            </UButton>
          </div>
        </div>

        <!-- 集數列表 -->
        <div v-if="isLoadingEpisodes" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
        </div>

        <div v-else-if="episodes.length === 0" class="text-center py-8 text-gray-400">
          <UIcon name="i-heroicons-microphone" class="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>尚無 Podcast 集數資料</p>
        </div>

        <div v-else class="max-h-80 overflow-y-auto space-y-1">
          <div
            v-for="episode in episodes"
            :key="episode.audioUrl"
            class="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg border border-gray-100"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-900 truncate text-sm">
                  {{ episode.title || '未知標題' }}
                </span>
                <UBadge :color="getEpisodeStatusColor(episode.syncStatus)" size="xs">
                  {{ getEpisodeStatusText(episode.syncStatus) }}
                </UBadge>
              </div>
              <div class="text-xs text-gray-400 mt-0.5">
                {{ new Date(episode.pubDate * 1000).toLocaleDateString('zh-TW') }}
                <span v-if="episode.duration"> · {{ Math.round(episode.duration / 60) }} 分鐘</span>
                <span v-if="episode.errorMessage" class="text-red-500 ml-2">
                  {{ episode.errorMessage }}
                </span>
              </div>
            </div>

            <div class="flex items-center gap-1 ml-2">
              <!-- 失敗時顯示重試按鈕 -->
              <UButton
                v-if="episode.syncStatus === 'failed'"
                color="red"
                variant="ghost"
                size="xs"
                icon="i-heroicons-arrow-path"
                :loading="isRetrying"
                @click="retryFailedEpisodes([episode.audioUrl])"
              >
                重試
              </UButton>
              <!-- 已完成時顯示連結 -->
              <UButton
                v-if="episode.syncStatus === 'completed' && episode.podcastId"
                color="primary"
                variant="ghost"
                size="xs"
                icon="i-heroicons-eye"
                :to="`/podcast/${episode.podcastId}`"
                target="_blank"
              >
                查看
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" @click="isEpisodeListModalOpen = false">
            關閉
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 批次爬取 Modal -->
  <UModal v-model="isBatchModalOpen">
    <UCard>
      <template #header>
        <h3 class="text-lg font-semibold">批次爬取影片</h3>
        <p class="text-sm text-gray-500 mt-1">{{ selectedChannel?.channelTitle }}</p>
      </template>

      <div class="space-y-4">
        <UFormGroup label="爬取模式">
          <URadioGroup
            v-model="batchForm.mode"
            :options="[
              { label: '爬取過去的影片', value: 'past' },
              { label: '只監控未來新影片', value: 'future' },
            ]"
          />
        </UFormGroup>

        <template v-if="batchForm.mode === 'past'">
          <UFormGroup label="時間範圍">
            <USelect
              v-model="batchForm.pastDays"
              :options="[
                { label: '最近 7 天', value: 7 },
                { label: '最近 14 天', value: 14 },
                { label: '最近 30 天', value: 30 },
                { label: '最近 60 天', value: 60 },
                { label: '最近 90 天', value: 90 },
              ]"
            />
          </UFormGroup>

          <UFormGroup label="最多處理幾部影片">
            <USelect
              v-model="batchForm.maxVideos"
              :options="[
                { label: '5 部', value: 5 },
                { label: '10 部', value: 10 },
                { label: '20 部', value: 20 },
                { label: '50 部', value: 50 },
              ]"
            />
            <template #hint>
              <span class="text-xs text-gray-400">每部影片約需 3-5 分鐘處理</span>
            </template>
          </UFormGroup>
        </template>

        <div v-else class="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          系統會自動監控此頻道，當有新影片發布時自動處理。
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" @click="isBatchModalOpen = false">
            取消
          </UButton>
          <UButton
            :loading="isBatchProcessing"
            @click="startBatchProcess"
          >
            {{ batchForm.mode === 'past' ? '開始爬取' : '確認' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
