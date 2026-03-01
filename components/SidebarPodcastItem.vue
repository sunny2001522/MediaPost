<script setup lang="ts">
import type { Podcast } from '~/server/database/schema'

interface PodcastWithAuthor extends Podcast {
  author?: { id: string; name: string } | null
}

interface Props {
  podcast: PodcastWithAuthor
  isActive?: boolean
  linkPrefix?: string // 自訂連結前綴，例如 "/股市隱者"
}

const props = defineProps<Props>()

// 計算連結路徑
const podcastLink = computed(() => {
  if (props.linkPrefix) {
    return `${props.linkPrefix}/${props.podcast.id}`
  }
  return `/podcast/${props.podcast.id}`
})
const emit = defineEmits<{
  delete: [id: string]
}>()

const isHovering = ref(false)
const isDeleting = ref(false)
const isRetrying = ref(false)

// 是否可以重試（狀態卡住或失敗）
const canRetry = computed(() =>
  props.podcast.status === 'transcribing' || props.podcast.status === 'error'
)

const statusConfig = {
  pending: { color: 'gray', label: '待處理' },
  downloading: { color: 'gray', label: '下載中' },
  transcribing: { color: 'gray', label: '轉錄中' },
  generating: { color: 'gray', label: '生成中' },
  completed: { color: 'black', label: '完成' },
  error: { color: 'red', label: '錯誤' },
} as const

async function handleDelete(e: Event) {
  e.preventDefault()
  e.stopPropagation()

  if (!confirm('確定要刪除這個記錄嗎？')) return

  isDeleting.value = true
  try {
    await $fetch(`/api/podcasts/${props.podcast.id}`, { method: 'DELETE' })
    emit('delete', props.podcast.id)
  }
  catch (error: any) {
    useToast().add({
      title: '刪除失敗',
      description: error.message,
      color: 'red',
    })
  }
  finally {
    isDeleting.value = false
  }
}

async function handleRetry(e: Event) {
  e.preventDefault()
  e.stopPropagation()

  isRetrying.value = true
  try {
    await $fetch(`/api/transcribe/${props.podcast.id}`, { method: 'POST' })
    useToast().add({
      title: '已重新開始轉錄',
      icon: 'i-heroicons-arrow-path',
      color: 'green',
    })
  }
  catch (error: any) {
    useToast().add({
      title: '重試失敗',
      description: error.message,
      color: 'red',
    })
  }
  finally {
    isRetrying.value = false
  }
}
</script>

<template>
  <NuxtLink
    :to="podcastLink"
    class="block p-3 rounded-lg transition-colors relative group"
    :class="isActive ? 'bg-gray-700' : 'hover:bg-gray-800'"
    @mouseenter="isHovering = true"
    @mouseleave="isHovering = false"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="podcast.sourceType === 'youtube' ? 'i-heroicons-play-circle' : 'i-heroicons-microphone'"
        class="w-4 h-4 mt-0.5 text-gray-500"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-white truncate pr-6">
          {{ podcast.title }}
        </p>
        <p v-if="podcast.author" class="text-xs text-gray-500 truncate mt-0.5">
          {{ podcast.author.name }}
        </p>
        <div class="flex items-center gap-2 mt-1">
          <UBadge
            :color="statusConfig[podcast.status as keyof typeof statusConfig]?.color || 'gray'"
            size="xs"
            :variant="podcast.status === 'completed' ? 'solid' : 'subtle'"
          >
            {{ statusConfig[podcast.status as keyof typeof statusConfig]?.label || podcast.status }}
          </UBadge>
          <span class="text-xs text-gray-500">
            {{ new Date(podcast.createdAt).toLocaleDateString() }}
          </span>
        </div>
      </div>

      <!-- 操作按鈕 -->
      <div class="absolute right-2 top-3 flex items-center gap-1">
        <!-- 重試按鈕 -->
        <button
          v-if="canRetry"
          v-show="isHovering || isRetrying"
          class="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-blue-400 transition-colors"
          :disabled="isRetrying"
          title="重新轉錄"
          @click="handleRetry"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-4 h-4"
            :class="{ 'animate-spin': isRetrying }"
          />
        </button>
        <!-- 刪除按鈕 -->
        <button
          v-show="isHovering || isDeleting"
          class="p-1 rounded hover:bg-gray-600 text-gray-400 hover:text-red-400 transition-colors"
          :disabled="isDeleting"
          title="刪除"
          @click="handleDelete"
        >
          <UIcon
            :name="isDeleting ? 'i-heroicons-arrow-path' : 'i-heroicons-trash'"
            class="w-4 h-4"
            :class="{ 'animate-spin': isDeleting }"
          />
        </button>
      </div>
    </div>
  </NuxtLink>
</template>
