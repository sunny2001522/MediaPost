<script setup lang="ts">
// 獲取學習偏好
const { data: preferences } = await useFetch('/api/learning/preferences')

// 獲取學習事件
const { data: events } = await useFetch('/api/learning/events', {
  query: { limit: 5 }
})

// 計算學習進度
const learningProgress = computed(() => {
  if (!preferences.value || preferences.value.length === 0) return 0
  const avgConfidence = preferences.value.reduce((sum, p) => sum + p.confidence, 0) / preferences.value.length
  return Math.min(100, Math.round(avgConfidence))
})

const getCategoryLabel = (category: string) => {
  const labels: Record<string, string> = {
    writing_style: '寫作風格',
    tone: '語氣',
    length: '長度',
    structure: '結構',
    vocabulary: '詞彙',
    emoji: '表情符號'
  }
  return labels[category] || category
}

const getEventIcon = (type: string) => {
  const icons: Record<string, string> = {
    pattern_discovered: 'i-heroicons-magnifying-glass',
    preference_learned: 'i-heroicons-light-bulb',
    prompt_updated: 'i-heroicons-rocket-launch'
  }
  return icons[type] || 'i-heroicons-sparkles'
}

const getImpactColor = (level: string) => {
  const colors: Record<string, string> = {
    low: 'gray',
    medium: 'blue',
    high: 'purple'
  }
  return colors[level] || 'gray'
}
</script>

<template>
  <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
    <!-- 頭部 -->
    <div class="px-4 py-3 border-b bg-purple-50">
      <h3 class="font-medium text-purple-700 flex items-center gap-2">
        <UIcon name="i-heroicons-academic-cap" class="w-4 h-4" />
        AI 學習洞察
      </h3>
    </div>

    <div class="p-4 space-y-4">
      <!-- 學習進度 -->
      <div class="flex items-center gap-3">
        <div class="relative w-12 h-12">
          <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e9d5ff"
              stroke-width="3"
            />
            <path
              d="M18 2.0845
                a 15.9155 15.9155 0 0 1 0 31.831
                a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#9333ea"
              stroke-width="3"
              :stroke-dasharray="`${learningProgress}, 100`"
            />
          </svg>
          <span class="absolute inset-0 flex items-center justify-center text-xs font-semibold text-purple-700">
            {{ learningProgress }}%
          </span>
        </div>
        <div>
          <p class="font-medium text-gray-900">學習進度</p>
          <p class="text-xs text-gray-500">
            已學習 {{ preferences?.length || 0 }} 個偏好
          </p>
        </div>
      </div>

      <!-- 已學習偏好 -->
      <div v-if="preferences && preferences.length > 0">
        <h4 class="text-sm font-medium text-gray-700 mb-2">你的寫作偏好</h4>
        <div class="space-y-2">
          <div
            v-for="pref in preferences.slice(0, 3)"
            :key="pref.id"
            class="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
          >
            <div class="flex items-center gap-2">
              <UBadge :color="pref.isActive ? 'green' : 'gray'" size="xs">
                {{ getCategoryLabel(pref.category) }}
              </UBadge>
              <span class="text-sm text-gray-600">{{ pref.preferenceKey }}</span>
            </div>
            <div class="flex items-center gap-1">
              <div class="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  class="h-full bg-purple-500 rounded-full"
                  :style="{ width: `${pref.confidence}%` }"
                />
              </div>
              <span class="text-xs text-gray-400">{{ pref.confidence }}%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 最近學習事件 -->
      <div v-if="events && events.length > 0">
        <h4 class="text-sm font-medium text-gray-700 mb-2">最近學習</h4>
        <div class="space-y-2">
          <div
            v-for="event in events"
            :key="event.id"
            class="flex items-start gap-2 p-2 bg-gray-50 rounded-lg"
          >
            <UIcon
              :name="getEventIcon(event.eventType)"
              class="w-4 h-4 mt-0.5"
              :class="{
                'text-blue-500': event.impactLevel === 'medium',
                'text-purple-500': event.impactLevel === 'high',
                'text-gray-400': event.impactLevel === 'low'
              }"
            />
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 truncate">{{ event.title }}</p>
              <p class="text-xs text-gray-500 truncate">{{ event.description }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-if="(!preferences || preferences.length === 0) && (!events || events.length === 0)" class="text-center py-4">
        <UIcon name="i-heroicons-academic-cap" class="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p class="text-sm text-gray-500">開始編輯貼文，AI 會學習你的風格</p>
      </div>
    </div>
  </div>
</template>
