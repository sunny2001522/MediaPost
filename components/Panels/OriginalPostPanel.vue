<script setup lang="ts">
interface Props {
  content?: string | null
  isGenerating?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  regenerate: []
}>()
</script>

<template>
  <div class="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
    <!-- 標題 -->
    <div class="px-4 py-3 border-b bg-blue-50 flex items-center justify-between">
      <h3 class="font-medium text-blue-700 flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
        AI 生成貼文
      </h3>
      <UButton
        v-if="content"
        icon="i-heroicons-arrow-path"
        size="xs"
        color="blue"
        variant="ghost"
        :loading="isGenerating"
        @click="emit('regenerate')"
      >
        重新生成
      </UButton>
    </div>

    <!-- 內容 -->
    <div class="flex-1 overflow-y-auto p-4">
      <!-- 載入中 -->
      <div v-if="isGenerating" class="flex flex-col items-center justify-center h-full text-blue-400">
        <UIcon name="i-heroicons-sparkles" class="w-8 h-8 animate-pulse mb-2" />
        <p class="text-sm">AI 正在生成貼文...</p>
      </div>

      <!-- 空狀態 -->
      <div v-else-if="!content" class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-heroicons-sparkles" class="w-12 h-12 mb-2" />
        <p class="text-sm">尚未生成貼文</p>
        <p class="text-xs mt-1">先完成轉錄，再生成貼文</p>
      </div>

      <!-- 貼文內容 -->
      <div v-else class="prose prose-sm max-w-none">
        <p class="whitespace-pre-wrap text-gray-700 leading-relaxed">{{ content }}</p>
      </div>
    </div>
  </div>
</template>
