<script setup lang="ts">
import type { Author } from '~/server/database/schema'

interface ProjectStats {
  fetched: number
  converted: number
  published: number
}

interface Project {
  id: string
  name: string
  authorId: string
  inputType: string
  inputConfig: Record<string, unknown> | null
  outputPlatforms: string[]
  outputConfig: Record<string, Record<string, unknown>> | null
  isAutoSync: boolean | null
  syncInterval: number | null
  lastSyncAt: Date | null
  isActive: boolean | null
  createdAt: Date
  updatedAt: Date
  stats: ProjectStats
}

interface AuthorWithProjects {
  id: string
  name: string
  slug: string | null
  projects: Project[]
}

// 取得作者和專案資料
const { data: authorsWithProjects, refresh } = await useFetch<AuthorWithProjects[]>('/api/projects/by-author')

// 取得作者列表（用於 Modal）
const { data: authors } = await useFetch<Author[]>('/api/authors')

// 展開所有專案並附加作者資訊
const allProjects = computed(() => {
  if (!authorsWithProjects.value) return []
  return authorsWithProjects.value.flatMap(author =>
    author.projects.map(project => ({
      ...project,
      authorName: author.name,
      authorSlug: author.slug,
    }))
  ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
})

// Modal 狀態
const isProjectModalOpen = ref(false)
const editingProject = ref<Project | null>(null)
const selectedAuthorId = ref<string | null>(null)

function openCreateModal() {
  selectedAuthorId.value = null
  editingProject.value = null
  isProjectModalOpen.value = true
}

function openEditModal(project: Project) {
  editingProject.value = project
  selectedAuthorId.value = project.authorId
  isProjectModalOpen.value = true
}

async function handleProjectSaved() {
  await refresh()
}

async function handleDeleteProject(projectId: string) {
  if (!confirm('確定要刪除此專案？相關的 Podcast 記錄不會被刪除。')) return

  try {
    await $fetch(`/api/projects/${projectId}`, { method: 'DELETE' as const })
    useToast().add({
      title: '專案已刪除',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    await refresh()
  } catch (error: any) {
    useToast().add({
      title: '刪除失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  }
}

function handleOpenProject(project: Project & { authorSlug: string | null }) {
  if (project.authorSlug) {
    navigateTo(`/${project.authorSlug}`)
  } else {
    navigateTo(`/${project.authorId}`)
  }
}

// 媒材類型配置
const mediaTypeConfig: Record<string, { label: string; icon: string; color: string }> = {
  'podcast': { label: 'Podcast', icon: 'i-heroicons-microphone', color: 'bg-purple-100 text-purple-700' },
  'video': { label: '影片', icon: 'i-heroicons-video-camera', color: 'bg-blue-100 text-blue-700' },
  'post': { label: '貼文', icon: 'i-heroicons-document-text', color: 'bg-green-100 text-green-700' },
  // 舊格式相容
  'podcast_to_post': { label: 'Podcast', icon: 'i-heroicons-microphone', color: 'bg-purple-100 text-purple-700' },
  'social_video_to_short': { label: '影片', icon: 'i-heroicons-video-camera', color: 'bg-blue-100 text-blue-700' },
  'social_post_to_video': { label: '貼文', icon: 'i-heroicons-document-text', color: 'bg-green-100 text-green-700' },
}

// 平台配置
const platformConfig: Record<string, { label: string; icon: string; color: string }> = {
  'apple_podcast': { label: 'Apple', icon: 'i-simple-icons-applepodcasts', color: 'bg-purple-100 text-purple-700' },
  'youtube': { label: 'YT', icon: 'i-simple-icons-youtube', color: 'bg-red-100 text-red-700' },
  'internal_video': { label: '內部影音', icon: 'i-heroicons-film', color: 'bg-gray-100 text-gray-700' },
  'cmoney_classmate': { label: '同學會', icon: 'i-heroicons-user-group', color: 'bg-yellow-100 text-yellow-700' },
  'line_community': { label: 'Line', icon: 'i-simple-icons-line', color: 'bg-green-100 text-green-700' },
  'threads': { label: 'Threads', icon: 'i-simple-icons-threads', color: 'bg-gray-100 text-gray-700' },
  'facebook': { label: 'FB', icon: 'i-simple-icons-facebook', color: 'bg-blue-100 text-blue-700' },
  'instagram': { label: 'IG', icon: 'i-simple-icons-instagram', color: 'bg-pink-100 text-pink-700' },
  'investment_blog': { label: '網誌', icon: 'i-heroicons-newspaper', color: 'bg-indigo-100 text-indigo-700' },
}

// 相容舊變數名
const inputTypeConfig = mediaTypeConfig
const outputTypeConfig = platformConfig

// 支援的平台 icon
const supportedPlatforms = [
  { name: 'Podcast', icon: 'i-heroicons-microphone' },
  { name: 'YouTube', icon: 'i-simple-icons-youtube' },
  { name: '同學會', icon: 'i-heroicons-user-group' },
  { name: '投資網誌', icon: 'i-heroicons-newspaper' },
  { name: 'Threads', icon: 'i-simple-icons-threads' },
  { name: 'Facebook', icon: 'i-simple-icons-facebook' },
  { name: 'Instagram', icon: 'i-simple-icons-instagram' },
  { name: 'Line', icon: 'i-simple-icons-line' },
]
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <!-- Hero 區塊 -->
    <div class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      <div class="max-w-6xl mx-auto px-6 py-16 text-center">
        <h1 class="text-4xl font-bold mb-4">
          CMoney 社群大師 Agent
        </h1>
        <p class="text-xl text-gray-300 mb-2">
          還在手動不同社群平台複製貼上？
        </p>
        <p class="text-2xl font-semibold text-primary-400 mb-8">
          一鍵實現多平台經營
        </p>

        <!-- 支援平台 -->
        <div class="flex items-center justify-center gap-2 text-gray-400 mb-4">
          <span class="text-sm">支援</span>
        </div>
        <div class="flex items-center justify-center gap-6">
          <div
            v-for="platform in supportedPlatforms"
            :key="platform.name"
            class="flex flex-col items-center gap-1"
          >
            <div class="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
              <UIcon :name="platform.icon" class="w-6 h-6" />
            </div>
            <span class="text-xs text-gray-400">{{ platform.name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 專案卡片區 -->
    <div class="max-w-6xl mx-auto px-6 py-8">
      <!-- 標題列 -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-gray-900">專案總覽</h2>
        <UButton
          icon="i-heroicons-plus"
          color="black"
          @click="openCreateModal"
        >
          新增專案
        </UButton>
      </div>

      <!-- 專案卡片網格 -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="project in allProjects"
          :key="project.id"
          class="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg hover:border-gray-300 transition-all cursor-pointer group"
          @click="handleOpenProject(project)"
        >
          <!-- 作者名稱 -->
          <div class="font-semibold text-gray-900 mb-3">
            {{ project.authorName }}
          </div>

          <!-- 輸入 → 輸出 轉換流程 -->
          <div class="space-y-2 mb-4">
            <!-- 第一行：輸入類型 + 輸入平台 -->
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1 px-2 py-1 rounded-lg" :class="mediaTypeConfig[project.inputType]?.color || 'bg-gray-100 text-gray-600'">
                <UIcon :name="mediaTypeConfig[project.inputType]?.icon || 'i-heroicons-document'" class="w-4 h-4" />
                <span class="text-xs font-medium">{{ mediaTypeConfig[project.inputType]?.label || project.inputType }}</span>
              </div>
              <div
                v-if="(project as any).inputPlatform"
                class="flex items-center gap-1 px-2 py-1 rounded-lg"
                :class="platformConfig[(project as any).inputPlatform]?.color || 'bg-gray-100 text-gray-600'"
              >
                <UIcon :name="platformConfig[(project as any).inputPlatform]?.icon || 'i-heroicons-globe-alt'" class="w-4 h-4" />
                <span class="text-xs font-medium">{{ platformConfig[(project as any).inputPlatform]?.label || (project as any).inputPlatform }}</span>
              </div>
            </div>

            <UIcon name="i-heroicons-arrow-down" class="w-4 h-4 text-gray-400 ml-2" />

            <!-- 第二行：輸出類型 + 輸出平台 -->
            <div class="flex items-center gap-2 flex-wrap">
              <div
                v-if="(project as any).outputType"
                class="flex items-center gap-1 px-2 py-1 rounded-lg"
                :class="mediaTypeConfig[(project as any).outputType]?.color || 'bg-gray-100 text-gray-600'"
              >
                <UIcon :name="mediaTypeConfig[(project as any).outputType]?.icon || 'i-heroicons-document'" class="w-4 h-4" />
                <span class="text-xs font-medium">{{ mediaTypeConfig[(project as any).outputType]?.label || (project as any).outputType }}</span>
              </div>
              <div
                v-for="platform in project.outputPlatforms.slice(0, 2)"
                :key="platform"
                class="flex items-center gap-1 px-2 py-1 rounded-lg"
                :class="platformConfig[platform]?.color || 'bg-gray-100 text-gray-600'"
              >
                <UIcon :name="platformConfig[platform]?.icon || 'i-heroicons-globe-alt'" class="w-4 h-4" />
                <span class="text-xs font-medium">{{ platformConfig[platform]?.label || platform }}</span>
              </div>
              <span
                v-if="project.outputPlatforms.length > 2"
                class="px-2 py-1 rounded-lg text-xs font-medium bg-gray-100 text-gray-600"
              >
                +{{ project.outputPlatforms.length - 2 }}
              </span>
            </div>
          </div>

          <!-- 統計數據 -->
          <div class="flex items-center justify-between text-xs border-t border-gray-100 pt-3">
            <div class="flex items-center gap-4 text-gray-500">
              <span>已抓取 <span class="font-semibold text-gray-900">{{ project.stats.fetched }}</span></span>
              <span>已轉換 <span class="font-semibold text-gray-900">{{ project.stats.converted }}</span></span>
              <span>已發表 <span class="font-semibold text-gray-900">{{ project.stats.published }}</span></span>
            </div>

            <!-- 編輯按鈕 -->
            <UButton
              icon="i-heroicons-pencil"
              size="xs"
              color="gray"
              variant="ghost"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="openEditModal(project)"
            />
          </div>
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-if="!allProjects.length" class="text-center py-16">
        <UIcon name="i-heroicons-folder-open" class="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 class="text-xl font-semibold text-gray-900 mb-2">尚無專案</h2>
        <p class="text-gray-500 mb-4">建立你的第一個內容轉換專案</p>
        <UButton icon="i-heroicons-plus" color="black" @click="openCreateModal">
          新增專案
        </UButton>
      </div>
    </div>

    <!-- 專案 Modal -->
    <ModalsProjectModal
      v-model="isProjectModalOpen"
      :project="editingProject"
      :default-author-id="selectedAuthorId"
      :authors="authors || []"
      @saved="handleProjectSaved"
    />
  </div>
</template>
