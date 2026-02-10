<script setup lang="ts">
import type { Podcast } from '~/server/database/schema'

interface Props {
  podcasts: Podcast[]
  currentId?: string
}

const props = defineProps<Props>()

const isModalOpen = ref(false)
</script>

<template>
  <aside class="w-64 bg-white border-r flex flex-col">
    <!-- 頭部 -->
    <div class="h-14 border-b px-4 flex items-center justify-between">
      <span class="font-semibold text-gray-900">MediaPost</span>
      <UButton
        icon="i-heroicons-plus"
        size="xs"
        color="primary"
        variant="ghost"
        @click="isModalOpen = true"
      />
    </div>

    <!-- 列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="podcasts.length === 0" class="text-center text-gray-400 py-8 text-sm">
        尚無記錄
      </div>
      <SidebarPodcastItem
        v-for="podcast in podcasts"
        :key="podcast.id"
        :podcast="podcast"
        :is-active="podcast.id === currentId"
      />
    </div>

    <!-- 新增 Modal -->
    <ModalsNewPodcastModal v-model="isModalOpen" />
  </aside>
</template>
