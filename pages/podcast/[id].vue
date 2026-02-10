<script setup lang="ts">
import type { Podcast, Generation, Edit } from '~/server/database/schema'

const route = useRoute()
const podcastId = computed(() => route.params.id as string)

// 獲取當前 podcast 資料
const { data: podcast, refresh: refreshPodcast } = await useFetch<Podcast>(
  () => `/api/podcasts/${podcastId.value}`
)

// 獲取所有 podcasts（側欄用）
const { data: podcasts } = await useFetch<Podcast[]>('/api/podcasts')

// 當前 generation
const { data: generation, refresh: refreshGeneration } = await useFetch<Generation | null>(
  () => `/api/podcasts/${podcastId.value}/generation`
)

// 編輯內容
const editedContent = ref('')
const isEditing = ref(false)
const isSaving = ref(false)

// 學習結果
const learningResult = ref<any>(null)

// 當 generation 變化時，更新編輯內容
watch(generation, (newGen) => {
  if (newGen) {
    editedContent.value = newGen.originalContent
  }
}, { immediate: true })

// 處理狀態
const isTranscribing = computed(() => podcast.value?.status === 'transcribing')
const isGenerating = computed(() => podcast.value?.status === 'generating')
const isProcessing = computed(() => isTranscribing.value || isGenerating.value)

// 輪詢處理中的狀態
const { pause, resume } = useIntervalFn(async () => {
  if (isProcessing.value) {
    await refreshPodcast()
    await refreshGeneration()
  }
}, 3000)

// 當處理完成時停止輪詢
watch(isProcessing, (processing) => {
  if (processing) {
    resume()
  } else {
    pause()
  }
}, { immediate: true })

// 開始轉錄
async function startTranscribe() {
  await $fetch(`/api/transcribe/${podcastId.value}`, { method: 'POST' })
  await refreshPodcast()
}

// 生成貼文
async function generatePost() {
  await $fetch(`/api/generate/${podcastId.value}`, { method: 'POST' })
  await refreshPodcast()
  await refreshGeneration()
}

// 重新生成
async function regenerate() {
  await generatePost()
}

// 儲存編輯
async function saveEdit() {
  if (!generation.value || editedContent.value === generation.value.originalContent) {
    return
  }

  isSaving.value = true
  try {
    const result = await $fetch('/api/edits', {
      method: 'POST',
      body: {
        generationId: generation.value.id,
        originalContent: generation.value.originalContent,
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
</script>

<template>
  <div class="flex h-screen">
    <!-- 側欄 -->
    <SidebarIndex
      :podcasts="podcasts || []"
      :current-id="podcastId"
    />

    <!-- 主內容區 - 三欄 -->
    <div class="flex-1 flex flex-col">
      <!-- 頂部標題列 -->
      <header class="h-14 border-b bg-white px-4 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-microphone" class="w-5 h-5 text-primary-500" />
          <h1 class="font-semibold text-gray-900">{{ podcast?.title || '載入中...' }}</h1>
          <UBadge v-if="podcast?.status" :color="podcast.status === 'completed' ? 'green' : 'yellow'" size="xs">
            {{ podcast.status }}
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="podcast?.status === 'pending' && !podcast?.transcript"
            @click="startTranscribe"
            :loading="isTranscribing"
            size="sm"
          >
            開始轉錄
          </UButton>
          <UButton
            v-if="podcast?.transcript && !generation"
            @click="generatePost"
            :loading="isGenerating"
            size="sm"
            color="primary"
          >
            生成貼文
          </UButton>
        </div>
      </header>

      <!-- 三欄內容 -->
      <div class="flex-1 grid grid-cols-3 gap-4 p-4 overflow-hidden">
        <!-- 左：轉錄內容 -->
        <PanelsTranscriptPanel
          :transcript="podcast?.transcript"
          :status="podcast?.status"
          :is-transcribing="isTranscribing"
        />

        <!-- 中：AI 原始貼文 -->
        <PanelsOriginalPostPanel
          :content="generation?.originalContent"
          :is-generating="isGenerating"
          @regenerate="regenerate"
        />

        <!-- 右：編輯區 + 學習洞察 -->
        <PanelsEditPanel
          v-model="editedContent"
          :original="generation?.originalContent"
          :learning-result="learningResult"
          :is-saving="isSaving"
          @save="saveEdit"
          @copy="copyToClipboard"
        />
      </div>
    </div>

    <!-- 學習反饋 Toast -->
    <LearningLearningFeedback :result="learningResult" @close="learningResult = null" />
  </div>
</template>
