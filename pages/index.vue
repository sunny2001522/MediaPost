<script setup lang="ts">
const { data: podcasts, refresh: refreshPodcasts } = await useFetch('/api/podcasts')

// 如果有記錄，導向第一個
watchEffect(() => {
  if (podcasts.value && podcasts.value.length > 0) {
    navigateTo(`/podcast/${podcasts.value[0].id}`)
  }
})

// 處理 podcast 刪除後刷新列表
async function handlePodcastDeleted() {
  await refreshPodcasts()
}
</script>

<template>
  <div class="flex h-screen bg-gray-50">
    <!-- 側欄 -->
    <AppSidebar :podcasts="podcasts || []" @podcast-deleted="handlePodcastDeleted" />

    <!-- 主內容區 - 空狀態 -->
    <div class="flex-1 flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <UIcon name="i-heroicons-microphone" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 mb-2">開始使用 MediaPost</h2>
        <p class="text-gray-500 mb-6">上傳音檔或貼上 YouTube 連結，AI 幫你轉成社群貼文</p>
        <ModalsNewPodcastModal />
      </div>
    </div>
  </div>
</template>
