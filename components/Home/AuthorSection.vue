<script setup lang="ts">
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

interface Props {
  author: {
    id: string
    name: string
    slug: string | null
    projects: Project[]
  }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'create-project': []
  'edit-project': [project: Project]
  'delete-project': [projectId: string]
  'open-project': [project: Project]
}>()

// 計算總統計
const totalStats = computed(() => {
  return props.author.projects.reduce(
    (acc, p) => ({
      fetched: acc.fetched + p.stats.fetched,
      converted: acc.converted + p.stats.converted,
      published: acc.published + p.stats.published,
    }),
    { fetched: 0, converted: 0, published: 0 }
  )
})

// 輸入類型映射
const inputTypeLabels: Record<string, string> = {
  'social_post_to_video': '社群貼文 → 長影音',
  'social_video_to_short': '社群影片 → 短影音',
  'podcast_to_post': 'Podcast → 貼文',
  'course_to_post': '課程 → 貼文',
}

// 輸出平台映射
const platformLabels: Record<string, string> = {
  'line_community': 'Line 社群',
  'cmoney_classmate': '同學會',
  'threads': 'Thread',
  'facebook': 'FB',
  'instagram': 'IG',
  'investment_blog': '投資網誌',
}

function handleProjectClick(project: Project) {
  emit('open-project', project)
}
</script>

<template>
  <UCard :ui="{ body: { padding: 'p-0' } }">
    <!-- 作者標題列 -->
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <UAvatar :alt="author.name" size="sm" />
          <div>
            <h2 class="font-semibold text-gray-900">{{ author.name }}</h2>
            <p v-if="author.slug" class="text-xs text-gray-400">/{{ author.slug }}</p>
          </div>
        </div>
        <UButton
          icon="i-heroicons-plus"
          size="sm"
          color="gray"
          variant="ghost"
          @click="emit('create-project')"
        >
          新增專案
        </UButton>
      </div>
    </template>

    <!-- 專案列表 -->
    <div class="divide-y divide-gray-100">
      <div
        v-for="project in author.projects"
        :key="project.id"
        class="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group cursor-pointer"
        @click="handleProjectClick(project)"
      >
        <div class="flex items-center gap-4 flex-1 min-w-0">
          <!-- 專案名稱 & 轉換流程 -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium text-gray-900">{{ project.name }}</span>
              <UBadge v-if="!project.isActive" color="gray" size="xs">停用</UBadge>
            </div>
            <div class="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <span>{{ inputTypeLabels[project.inputType] || project.inputType }}</span>
              <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
              <div class="flex items-center gap-1 flex-wrap">
                <UBadge
                  v-for="platform in project.outputPlatforms"
                  :key="platform"
                  size="xs"
                  color="gray"
                  variant="soft"
                >
                  {{ platformLabels[platform] || platform }}
                </UBadge>
              </div>
            </div>
          </div>

        

        <!-- 操作按鈕 -->
        <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-4" @click.stop>
          <UButton
            icon="i-heroicons-pencil"
            size="xs"
            color="gray"
            variant="ghost"
            @click="emit('edit-project', project)"
          />
          <UButton
            icon="i-heroicons-trash"
            size="xs"
            color="red"
            variant="ghost"
            @click="emit('delete-project', project.id)"
          />
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-if="author.projects.length === 0" class="px-6 py-8 text-center text-gray-400">
        <UIcon name="i-heroicons-folder-open" class="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p class="text-sm">尚無專案，點擊「新增專案」開始</p>
      </div>
    </div>

    <!-- 底部統計 -->
    <template #footer>
      <div class="flex items-center justify-between text-sm text-gray-500">
        <span>共 {{ author.projects.length }} 個專案</span>
        <div class="flex items-center gap-4">
          <span>已抓取: {{ totalStats.fetched }}</span>
          <span>已轉換: {{ totalStats.converted }}</span>
          <span>已發表: {{ totalStats.published }}</span>
        </div>
      </div>
    </template>
  </UCard>
</template>
