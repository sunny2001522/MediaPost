<script setup lang="ts">
interface Props {
  content: string
  editId?: string
}

const props = defineProps<Props>()
const isOpen = defineModel<boolean>({ default: false })

const selectedPlatforms = ref<string[]>(['clipboard'])
const isPublishing = ref(false)
const results = ref<Array<{ platform: string; status: string; postUrl?: string; error?: string }>>([])

const platforms = [
  { id: 'clipboard', name: '複製到剪貼簿', icon: 'i-heroicons-clipboard-document', ready: true },
  { id: 'threads', name: 'Instagram Threads', icon: 'i-heroicons-chat-bubble-oval-left', ready: false },
  { id: 'cmoney', name: 'CMoney 同學會', icon: 'i-heroicons-user-group', ready: false }
]

function togglePlatform(id: string) {
  const index = selectedPlatforms.value.indexOf(id)
  if (index === -1) {
    selectedPlatforms.value.push(id)
  } else {
    selectedPlatforms.value.splice(index, 1)
  }
}

async function publish() {
  if (selectedPlatforms.value.length === 0) {
    useToast().add({ title: '請選擇至少一個平台', color: 'red' })
    return
  }

  isPublishing.value = true
  results.value = []

  try {
    // 處理剪貼簿
    if (selectedPlatforms.value.includes('clipboard')) {
      await navigator.clipboard.writeText(props.content)
      results.value.push({ platform: 'clipboard', status: 'success' })
    }

    // 發送到其他平台
    const otherPlatforms = selectedPlatforms.value.filter(p => p !== 'clipboard')
    if (otherPlatforms.length > 0) {
      const response = await $fetch('/api/publish', {
        method: 'POST',
        body: {
          editId: props.editId,
          content: props.content,
          platforms: otherPlatforms
        }
      })
      results.value.push(...response.results)
    }

    useToast().add({
      title: '發布完成',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error: any) {
    useToast().add({
      title: '發布失敗',
      description: error.message,
      color: 'red'
    })
  } finally {
    isPublishing.value = false
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'success': return 'i-heroicons-check-circle'
    case 'failed': return 'i-heroicons-x-circle'
    case 'pending': return 'i-heroicons-clock'
    case 'manual': return 'i-heroicons-hand-raised'
    default: return 'i-heroicons-question-mark-circle'
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'success': return 'green'
    case 'failed': return 'red'
    case 'pending': return 'yellow'
    case 'manual': return 'blue'
    default: return 'gray'
  }
}
</script>

<template>
  <UModal v-model="isOpen">
    <UCard :ui="{ ring: 'ring-1 ring-gray-200', divide: 'divide-y divide-gray-100' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-paper-airplane" class="w-5 h-5 text-gray-600" />
          <span class="font-semibold text-gray-900">發布貼文</span>
        </div>
      </template>

      <div class="space-y-4">
        <!-- 預覽 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">貼文預覽</label>
          <div class="p-3 bg-gray-50 rounded-lg text-sm text-gray-700 max-h-40 overflow-y-auto whitespace-pre-wrap">
            {{ content }}
          </div>
          <p class="text-xs text-gray-400 mt-1">{{ content.length }} 字</p>
        </div>

        <!-- 平台選擇 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">選擇發布平台</label>
          <div class="grid grid-cols-1 gap-2">
            <button
              v-for="platform in platforms"
              :key="platform.id"
              class="flex items-center justify-between p-3 rounded-lg border-2 transition-colors"
              :class="[
                selectedPlatforms.includes(platform.id)
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
              ]"
              @click="togglePlatform(platform.id)"
            >
              <div class="flex items-center gap-3">
                <UIcon :name="platform.icon" class="w-5 h-5 text-gray-600" />
                <span class="font-medium text-gray-900">{{ platform.name }}</span>
                <UBadge v-if="!platform.ready" color="gray" size="xs">需手動</UBadge>
              </div>
              <UIcon
                :name="selectedPlatforms.includes(platform.id) ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                class="w-5 h-5"
                :class="selectedPlatforms.includes(platform.id) ? 'text-gray-900' : 'text-gray-300'"
              />
            </button>
          </div>
        </div>

        <!-- 發布結果 -->
        <div v-if="results.length > 0" class="space-y-2">
          <label class="block text-sm font-medium text-gray-700">發布結果</label>
          <div
            v-for="result in results"
            :key="result.platform"
            class="flex items-center justify-between p-2 rounded-lg"
            :class="{
              'bg-gray-100': result.status === 'success',
              'bg-red-50': result.status === 'failed',
              'bg-gray-50': result.status === 'pending' || result.status === 'manual'
            }"
          >
            <div class="flex items-center gap-2">
              <UIcon :name="getStatusIcon(result.status)" :class="`text-${getStatusColor(result.status)}-500`" />
              <span class="text-sm text-gray-900">{{ platforms.find(p => p.id === result.platform)?.name }}</span>
            </div>
            <UBadge :color="getStatusColor(result.status)" size="xs">
              {{ result.status === 'manual' ? '需手動' : result.status }}
            </UBadge>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="isOpen = false">
            {{ results.length > 0 ? '關閉' : '取消' }}
          </UButton>
          <UButton
            v-if="results.length === 0"
            color="black"
            :loading="isPublishing"
            :disabled="selectedPlatforms.length === 0"
            @click="publish"
          >
            發布
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
