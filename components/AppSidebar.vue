<script setup lang="ts">
import type { Podcast, Author } from '~/server/database/schema'

interface PodcastWithAuthor extends Podcast {
  author?: { id: string; name: string } | null
}

interface Props {
  podcasts: PodcastWithAuthor[]
  currentId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'podcast-deleted': [id: string]
}>()

// 處理刪除事件
function handlePodcastDelete(id: string) {
  emit('podcast-deleted', id)
}

const isModalOpen = ref(false)

// 獲取作者列表
const { data: authors } = await useFetch<Author[]>('/api/authors')

// 作者篩選
const selectedAuthorId = ref<string | null>(null)

const authorOptions = computed(() => [
  { id: null, name: '全部作者' },
  ...(authors.value || []),
])

const filteredPodcasts = computed(() => {
  if (!selectedAuthorId.value) return props.podcasts
  return props.podcasts.filter(p => p.authorId === selectedAuthorId.value)
})
</script>

<template>
  <aside class="w-64 bg-gray-900 flex flex-col">
    <!-- 頭部 -->
    <div class="h-14 border-b border-gray-800 px-4 flex items-center justify-between">
      <span class="font-semibold text-white">MediaPost</span>
      <UButton
        icon="i-heroicons-plus"
        size="xs"
        color="white"
        variant="ghost"
        @click="isModalOpen = true"
      />
    </div>

    <!-- 作者篩選 -->
    <div class="px-3 py-2 border-b border-gray-800">
      <USelectMenu
        v-model="selectedAuthorId"
        :options="authorOptions"
        value-attribute="id"
        option-attribute="name"
        placeholder="全部作者"
        searchable
        searchable-placeholder="搜尋作者..."
        size="sm"
        :ui="{
          wrapper: 'w-full',
          base: 'bg-gray-800 border-gray-700 text-white',
          placeholder: 'text-gray-400',
          leading: { wrapper: 'text-gray-400' },
          trailing: { wrapper: 'text-gray-400' },
        }"
      >
        <template #leading>
          <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-gray-400" />
        </template>
      </USelectMenu>
    </div>

    <!-- 列表 -->
    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="filteredPodcasts.length === 0" class="text-center text-gray-500 py-8 text-sm">
        {{ selectedAuthorId ? '該作者尚無記錄' : '尚無記錄' }}
      </div>
      <SidebarPodcastItem
        v-for="podcast in filteredPodcasts"
        :key="podcast.id"
        :podcast="podcast"
        :is-active="podcast.id === currentId"
        @delete="handlePodcastDelete"
      />
    </div>

    <!-- 新增 Modal -->
    <ModalsNewPodcastModal v-model="isModalOpen" />
  </aside>
</template>
