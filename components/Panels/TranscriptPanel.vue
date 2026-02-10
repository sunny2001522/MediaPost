<script setup lang="ts">
interface Props {
  transcript?: string | null
  status?: string
  isTranscribing?: boolean
}

defineProps<Props>()
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
    <!-- 標題 -->
    <div class="px-4 py-3 border-b border-gray-100 bg-white">
      <h3 class="font-medium text-gray-900 flex items-center gap-2">
        <UIcon name="i-heroicons-document-text" class="w-4 h-4 text-gray-500" />
        轉錄內容
      </h3>
    </div>

    <!-- 內容 -->
    <div class="flex-1 overflow-y-auto p-4 bg-white">
      <!-- 載入中 -->
      <div v-if="isTranscribing" class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin mb-2" />
        <p class="text-sm">正在轉錄中...</p>
        <p class="text-xs mt-1">這可能需要幾分鐘</p>
      </div>

      <!-- 空狀態 -->
      <div v-else-if="!transcript" class="flex flex-col items-center justify-center h-full text-gray-400">
        <UIcon name="i-heroicons-document" class="w-12 h-12 mb-2" />
        <p class="text-sm">尚未轉錄</p>
        <p class="text-xs mt-1">點擊「開始轉錄」開始處理</p>
      </div>

      <!-- 轉錄內容 -->
      <div v-else class="prose prose-sm max-w-none">
        <p class="whitespace-pre-wrap text-gray-700 leading-relaxed">{{ transcript }}</p>
      </div>
    </div>
  </div>
</template>
