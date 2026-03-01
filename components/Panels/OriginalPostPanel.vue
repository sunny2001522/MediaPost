<script setup lang="ts">
interface Generation {
  id: string
  originalContent: string
  batchIndex: number
}

interface Props {
  content?: string | null
  generations?: Generation[]
  isGenerating?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  generate: [topicGuidance?: string]
  'select-post': [index: number, content: string]
  'delete-post': [generationId: string]
}>()

const isDeleting = ref<string | null>(null) // 儲存正在刪除的 generation ID

// 生成選項彈出框
const showGenerateModal = ref(false)
const topicGuidance = ref('')

function openGenerateModal() {
  topicGuidance.value = ''
  showGenerateModal.value = true
}

function confirmGenerate() {
  const guidance = topicGuidance.value.trim()
  emit('generate', guidance || undefined)
  showGenerateModal.value = false
  topicGuidance.value = ''
}

// 解析多個貼文
const posts = computed(() => {
  if (!props.content) return []
  return props.content.split('---POST---').map(p => p.trim()).filter(Boolean)
})

const currentPostIndex = ref(0)
const currentPost = computed(() => posts.value[currentPostIndex.value] || '')

function selectPost(index: number) {
  currentPostIndex.value = index
  emit('select-post', index, posts.value[index])
}

// 當內容變化時，通知選中第一個貼文
watch(() => props.content, () => {
  if (posts.value.length > 0) {
    currentPostIndex.value = 0
    emit('select-post', 0, posts.value[0])
  }
}, { immediate: true })

// 獲取指定索引的 generation ID
function getGenerationId(index: number): string | null {
  if (!props.generations || props.generations.length === 0) return null
  return props.generations[index]?.id || null
}

// 刪除指定索引的貼文
async function handleDeletePost(index: number) {
  const generationId = getGenerationId(index)
  if (!generationId) return
  if (!confirm('確定要刪除這篇貼文嗎？')) return

  isDeleting.value = generationId
  try {
    await $fetch(`/api/generations/${generationId}`, { method: 'DELETE' })
    emit('delete-post', generationId)
    // 如果刪除的是當前選中的貼文，切換到第一個
    if (currentPostIndex.value === index) {
      currentPostIndex.value = 0
    } else if (currentPostIndex.value > index) {
      // 如果刪除的是前面的貼文，調整索引
      currentPostIndex.value = Math.max(0, currentPostIndex.value - 1)
    }
    useToast().add({
      title: '已刪除貼文',
      icon: 'i-heroicons-trash',
      color: 'gray'
    })
  } catch (error: any) {
    useToast().add({
      title: '刪除失敗',
      description: error.message,
      color: 'red'
    })
  } finally {
    isDeleting.value = null
  }
}
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
    <!-- 標題 -->
    <div class="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
      <h3 class="font-medium text-gray-900 flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-gray-500" />
        AI 生成貼文
        <UBadge v-if="posts.length > 0" color="gray" size="xs">
          {{ posts.length }} 篇
        </UBadge>
      </h3>
      <UButton
        icon="i-heroicons-sparkles"
        size="xs"
        color="gray"
        variant="soft"
        :loading="isGenerating"
        @click="openGenerateModal"
      >
        生成
      </UButton>
    </div>

    <!-- 生成選項彈出框 -->
    <UModal v-model="showGenerateModal">
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-gray-500" />
            <span class="font-medium">生成貼文</span>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              主題方向引導（選填）
            </label>
            <UTextarea
              v-model="topicGuidance"
              placeholder="例如：聚焦在投資心態、著重技術分析、強調風險管理..."
              :rows="3"
              autoresize
            />
            <p class="mt-1 text-xs text-gray-500">
              這段文字會影響 AI 生成的內容方向
            </p>
          </div>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="gray"
              variant="ghost"
              @click="showGenerateModal = false"
            >
              取消
            </UButton>
            <UButton
              icon="i-heroicons-sparkles"
              :loading="isGenerating"
              @click="confirmGenerate"
            >
              開始生成
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>

    <!-- 貼文選擇器 -->
    <div v-if="posts.length > 0" class="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
      <div class="flex gap-2 overflow-x-auto">
        <UButton
          v-for="(_, index) in posts"
          :key="index"
          size="xs"
          :color="currentPostIndex === index ? 'black' : 'gray'"
          :variant="currentPostIndex === index ? 'solid' : 'ghost'"
          @click="selectPost(index)"
        >
          貼文 {{ index + 1 }}
        </UButton>
      </div>
      <UButton
        icon="i-heroicons-trash"
        size="xs"
        color="gray"
        variant="ghost"
        :loading="isDeleting !== null"
        :disabled="!getGenerationId(currentPostIndex)"
        @click="handleDeletePost(currentPostIndex)"
      />
    </div>

    <!-- 內容 -->
    <div class="flex-1 overflow-y-auto p-4 bg-white">
      <!-- 載入中 -->
      <div v-if="isGenerating" class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-heroicons-sparkles" class="w-8 h-8 animate-pulse mb-2" />
        <p class="text-sm">AI 正在生成貼文...</p>
      </div>

      <!-- 空狀態 -->
      <div v-else-if="!content" class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-heroicons-sparkles" class="w-12 h-12 mb-2" />
        <p class="text-sm">尚未生成貼文</p>
        <p class="text-xs mt-1">上傳音檔後會自動生成</p>
      </div>

      <!-- 貼文內容 -->
      <div v-else class="prose prose-sm max-w-none">
        <p class="whitespace-pre-wrap text-gray-700 leading-relaxed">{{ currentPost }}</p>
      </div>
    </div>
  </div>
</template>
