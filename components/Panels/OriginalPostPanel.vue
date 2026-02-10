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
  generate: []
  'select-post': [index: number, content: string]
  'delete-post': [generationId: string]
}>()

const isDeleting = ref(false)

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

// 獲取當前選中貼文對應的 generation ID
const currentGenerationId = computed(() => {
  if (!props.generations || props.generations.length === 0) return null
  // generations 按 batchIndex 排序，與 posts 順序對應
  return props.generations[currentPostIndex.value]?.id
})

// 刪除當前貼文
async function handleDeletePost() {
  if (!currentGenerationId.value) return
  if (!confirm('確定要刪除這篇貼文嗎？')) return

  isDeleting.value = true
  try {
    await $fetch(`/api/generations/${currentGenerationId.value}`, { method: 'DELETE' })
    emit('delete-post', currentGenerationId.value)
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
    isDeleting.value = false
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
        @click="emit('generate')"
      >
        生成
      </UButton>
    </div>

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
        v-if="currentGenerationId"
        icon="i-heroicons-trash"
        size="xs"
        color="gray"
        variant="ghost"
        :loading="isDeleting"
        @click="handleDeletePost"
      >
        刪除
      </UButton>
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
