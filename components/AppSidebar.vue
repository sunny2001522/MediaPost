<script setup lang="ts">
import type { Podcast, Author } from '~/server/database/schema'

interface AuthorWithSlug extends Author {
  slug?: string | null
}

interface PodcastWithAuthor extends Podcast {
  author?: { id: string; name: string; slug?: string | null } | null
}

interface Props {
  podcasts: PodcastWithAuthor[]
  currentId?: string
  authorFilter?: string // 從路由傳入的作者 slug
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'podcast-deleted': [id: string]
}>()

const route = useRoute()
const router = useRouter()

// 處理刪除事件
function handlePodcastDelete(id: string) {
  emit('podcast-deleted', id)
}

const isModalOpen = ref(false)

// 獲取作者列表
const { data: authors } = await useFetch<AuthorWithSlug[]>('/api/authors')

// 作者篩選
const selectedAuthorId = ref<string | null>(null)

// 搜尋關鍵字
const searchQuery = ref('')

// 標記是否已初始化完成（避免初始化時觸發路由變更）
const isInitialized = ref(false)

// 當有路由篩選時，自動設定 selectedAuthorId
watch([() => props.authorFilter, authors], ([filter, authorList]) => {
  if (authorList) {
    if (filter) {
      // 支援用 slug 或 name 匹配
      const author = authorList.find(a => a.slug === filter || a.name === decodeURIComponent(filter))
      if (author) {
        selectedAuthorId.value = author.id
      }
    }
    // 標記初始化完成
    nextTick(() => {
      isInitialized.value = true
    })
  }
}, { immediate: true })

// 當選擇作者變化時，更新路由（只有用戶主動選擇才觸發）
watch(selectedAuthorId, (newAuthorId, oldAuthorId) => {
  // 避免初始化時觸發
  if (!isInitialized.value) return

  const selectedAuthor = authors.value?.find(a => a.id === newAuthorId)
  const currentPodcastId = props.currentId

  console.log('[AppSidebar] Author changed:', { newAuthorId, selectedAuthor, slug: selectedAuthor?.slug, currentPodcastId })

  if (newAuthorId && selectedAuthor?.slug) {
    // 選擇了有 slug 的作者，導航到作者路由
    const targetPath = currentPodcastId
      ? `/${selectedAuthor.slug}/${currentPodcastId}`
      : `/${selectedAuthor.slug}`
    console.log('[AppSidebar] Navigating to:', targetPath)
    router.push(targetPath)
  } else if (newAuthorId === null) {
    // 選擇了「全部作者」，導航回原始路由
    const targetPath = currentPodcastId ? `/podcast/${currentPodcastId}` : '/'
    console.log('[AppSidebar] Navigating to:', targetPath)
    router.push(targetPath)
  } else if (newAuthorId && !selectedAuthor?.slug) {
    console.log('[AppSidebar] Author has no slug, staying on current route')
  }
})

// 取得當前選中作者的 slug
const selectedAuthorSlug = computed(() => {
  if (!selectedAuthorId.value || !authors.value) return null
  const author = authors.value.find(a => a.id === selectedAuthorId.value)
  return author?.slug || null
})

const authorOptions = computed(() => [
  { id: null, name: '全部作者' },
  ...(authors.value || []),
])

const filteredPodcasts = computed(() => {
  let result = props.podcasts

  // 按作者篩選
  if (selectedAuthorId.value) {
    result = result.filter(p => p.authorId === selectedAuthorId.value)
  }

  // 按搜尋關鍵字篩選
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(p => p.title.toLowerCase().includes(query))
  }

  return result
})
</script>

<template>
  <aside class="w-64 bg-gray-900 flex flex-col">
    <!-- 頭部 -->
    <div class="h-14 border-b border-gray-800 px-4 flex items-center justify-between">
      <NuxtLink to="/" class="font-semibold text-white hover:text-gray-300 transition-colors">
        MediaPost
      </NuxtLink>
      <UButton
        icon="i-heroicons-plus"
        size="xs"
        color="white"
        variant="ghost"
        @click="isModalOpen = true"
      />
    </div>


    <!-- 搜尋框 -->
    <div class="px-3 py-2 border-b border-gray-800">
      <UInput
        v-model="searchQuery"
        placeholder="搜尋標題..."
        size="sm"
        icon="i-heroicons-magnifying-glass"
        :ui="{
          wrapper: 'w-full',
          base: 'bg-gray-800 border-gray-700 text-white placeholder-gray-400',
        }"
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
        {{ searchQuery ? '找不到符合的結果' : (selectedAuthorId ? '該作者尚無記錄' : '尚無記錄') }}
      </div>
      <SidebarPodcastItem
        v-for="podcast in filteredPodcasts"
        :key="podcast.id"
        :podcast="podcast"
        :is-active="podcast.id === currentId"
        :link-prefix="selectedAuthorSlug ? `/${selectedAuthorSlug}` : undefined"
        @delete="handlePodcastDelete"
      />
    </div>

    <!-- 新增 Modal -->
    <ModalsNewPodcastModal
      v-model="isModalOpen"
      :default-author-id="selectedAuthorId"
    />
  </aside>
</template>
