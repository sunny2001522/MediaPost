<script setup lang="ts">
import type { Podcast, Generation, Edit, Author } from '~/server/database/schema'

const route = useRoute()
const podcastId = computed(() => route.params.id as string)

// 獲取當前 podcast 資料（包含作者資訊）
const { data: podcast, refresh: refreshPodcast } = await useFetch<Podcast & { author?: Author | null }>(
  () => `/api/podcasts/${podcastId.value}`
)

// 人設 Modal 狀態
const showPersonaModal = ref(false)

// 獲取所有 podcasts（側欄用）
const { data: podcasts, refresh: refreshPodcasts } = await useFetch('/api/podcasts')

// 當前 generation（現在可能包含多批次）
const { data: generation, refresh: refreshGeneration } = await useFetch<{
  generations?: Generation[]
  mergedContent?: string
  totalPosts?: number
  originalContent?: string
} | null>(
  () => `/api/podcasts/${podcastId.value}/generation`
)

// 編輯內容
const editedContent = ref('')
const selectedPostIndex = ref(0)
const selectedOriginalPost = ref('')
const isEditing = ref(false)
const isSaving = ref(false)
const isManualGenerating = ref(false)

// 學習結果
const learningResult = ref<any>(null)

// 取得合併後的貼文內容
const mergedContent = computed(() => {
  if (!generation.value) return null
  return generation.value.mergedContent || generation.value.originalContent
})

// 處理貼文選擇
function handleSelectPost(index: number, content: string) {
  selectedPostIndex.value = index
  selectedOriginalPost.value = content
  editedContent.value = content
}

// 處理狀態
const isTranscribing = computed(() => podcast.value?.status === 'transcribing')
const isGenerating = computed(() => podcast.value?.status === 'generating')
const isProcessing = computed(() => isTranscribing.value || isGenerating.value)

// 狀態文字
function getStatusText(status: string) {
  const statusMap: Record<string, string> = {
    pending: '等待中',
    transcribing: '轉錄中',
    generating: '生成中',
    completed: '完成',
    error: '錯誤'
  }
  return statusMap[status] || status
}

// 輪詢處理中的狀態
let pollInterval: ReturnType<typeof setInterval> | null = null

function startPolling() {
  if (pollInterval) return
  pollInterval = setInterval(async () => {
    if (isProcessing.value) {
      await refreshPodcast()
      await refreshGeneration()
    }
  }, 3000)
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

// 當處理完成時停止輪詢（只在客戶端執行）
onMounted(() => {
  watch(isProcessing, (processing) => {
    if (processing) {
      startPolling()
    } else {
      stopPolling()
    }
  }, { immediate: true })
})

// 組件卸載時清理
onUnmounted(() => {
  stopPolling()
})

// 生成貼文（若無貼文則新生成，若有則追加不同視角）
async function handleGenerate() {
  isManualGenerating.value = true
  try {
    const result = await $fetch(`/api/generate/${podcastId.value}`, { method: 'POST' })
    await refreshPodcast()
    await refreshGeneration()

    const hasExisting = (generation.value?.generations?.length || 0) > 0
    useToast().add({
      title: hasExisting ? '已生成更多貼文' : '已生成貼文',
      description: `共 ${result.postsGenerated} 篇，剩餘 ${result.remainingAngles} 個視角可用`,
      icon: 'i-heroicons-sparkles',
      color: 'gray'
    })
  }
  catch (error: any) {
    useToast().add({
      title: '生成失敗',
      description: error.message,
      color: 'red'
    })
  }
  finally {
    isManualGenerating.value = false
  }
}

// 儲存編輯
async function saveEdit() {
  if (!generation.value || editedContent.value === selectedOriginalPost.value) {
    return
  }

  isSaving.value = true
  try {
    const result = await $fetch('/api/edits', {
      method: 'POST',
      body: {
        generationId: generation.value.id,
        originalContent: selectedOriginalPost.value,
        editedContent: editedContent.value
      }
    })
    learningResult.value = result.learning
    isEditing.value = false
  } finally {
    isSaving.value = false
  }
}

// 複製到剪貼簿
async function copyToClipboard() {
  await navigator.clipboard.writeText(editedContent.value)
  useToast().add({
    title: '已複製到剪貼簿',
    icon: 'i-heroicons-clipboard-document-check',
    color: 'green'
  })
}

// 處理貼文刪除
async function handleDeletePost(generationId: string) {
  await refreshGeneration()
  // 如果刪除後沒有貼文了，重設狀態
  if (!generation.value?.generations || generation.value.generations.length === 0) {
    selectedPostIndex.value = 0
    selectedOriginalPost.value = ''
    editedContent.value = ''
  }
}

// 處理 podcast 刪除
async function handlePodcastDeleted(id: string) {
  // 刷新側欄列表
  await refreshPodcasts()
  // 如果刪除的是當前 podcast，導航到首頁
  if (id === podcastId.value) {
    await navigateTo('/')
  }
}
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <!-- 側欄 -->
    <AppSidebar
      :podcasts="podcasts || []"
      :current-id="podcastId"
      @podcast-deleted="handlePodcastDeleted"
    />

    <!-- 主內容區 - 三欄 -->
    <div class="flex-1 flex flex-col">
      <!-- 頂部標題列 -->
      <header class="h-14 border-b border-gray-200 bg-white px-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-microphone" class="w-5 h-5 text-gray-600" />
          <h1 class="font-semibold text-gray-900">{{ podcast?.title || '載入中...' }}</h1>
          <UBadge
            v-if="podcast?.status"
            :color="podcast.status === 'completed' ? 'black' : podcast.status === 'error' ? 'red' : 'gray'"
            :variant="podcast.status === 'completed' ? 'solid' : 'subtle'"
            size="xs"
          >
            {{ getStatusText(podcast.status) }}
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <!-- 作者設定按鈕 -->
          <UButton
            v-if="podcast?.author"
            variant="ghost"
            color="gray"
            size="sm"
            icon="i-heroicons-cog-6-tooth"
            @click="showPersonaModal = true"
          >
            「{{ podcast.author.name }}」設定
          </UButton>
          <!-- 狀態指示器 -->
          <div class="flex items-center gap-2 text-sm text-gray-500">
            <template v-if="isTranscribing">
              <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              轉錄中...
            </template>
            <template v-else-if="isGenerating">
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4 animate-pulse" />
              生成貼文中...
            </template>
          </div>
        </div>
      </header>

      <!-- 三欄內容 -->
      <div class="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden bg-gray-50">
        <!-- 左：轉錄內容 -->
        <PanelsTranscriptPanel
          :transcript="podcast?.transcript"
          :status="podcast?.status"
          :is-transcribing="isTranscribing"
        />

        <!-- 中：AI 原始貼文 -->
        <PanelsOriginalPostPanel
          :content="mergedContent"
          :generations="generation?.generations"
          :is-generating="isGenerating || isManualGenerating"
          @generate="handleGenerate"
          @select-post="handleSelectPost"
          @delete-post="handleDeletePost"
        />

        <!-- 右：編輯區 + 學習洞察 -->
        <PanelsEditPanel
          v-model="editedContent"
          :original="selectedOriginalPost"
          :learning-result="learningResult"
          :is-saving="isSaving"
          :edit-id="generation?.generations?.[0]?.id || generation?.id"
          @save="saveEdit"
          @copy="copyToClipboard"
        />
      </div>
    </div>

    <!-- 學習反饋 Toast -->
    <LearningFeedback :result="learningResult" @close="learningResult = null" />

    <!-- 人設編輯 Modal -->
    <ModalsAuthorPersonaModal
      v-if="podcast?.author"
      v-model="showPersonaModal"
      :author-id="podcast.author.id"
      :author-name="podcast.author.name"
    />
  </div>
</template>
