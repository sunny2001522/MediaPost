<script setup lang="ts">
const route = useRoute()
const authorSlug = computed(() => route.params.author as string)

const { data: podcasts, refresh: refreshPodcasts } = await useFetch('/api/podcasts')

// 處理 podcast 刪除後刷新列表
async function handlePodcastDeleted() {
  await refreshPodcasts()
}
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <!-- 側欄（透過 authorFilter 自動選中該作者） -->
    <AppSidebar
      :podcasts="podcasts || []"
      :author-filter="authorSlug"
      @podcast-deleted="handlePodcastDeleted"
    />

    <!-- 主內容區 - 空狀態 -->
    <div class="flex-1 flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <UIcon name="i-heroicons-microphone" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 mb-2">選擇一個 Podcast</h2>
        <p class="text-gray-500 mb-6">從左側列表選擇，或點擊 + 新增</p>
      </div>
    </div>
  </div>
</template>
