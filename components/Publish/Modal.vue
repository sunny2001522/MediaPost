<script setup lang="ts">
interface Props {
  content: string
  editId?: string
  podcastId?: string
  projectId?: string
  authorId?: string
}

const props = defineProps<Props>()
const isOpen = defineModel<boolean>({ default: false })

const selectedPlatforms = ref<string[]>(['clipboard'])
const isPublishing = ref(false)
const results = ref<Array<{ platform: string; status: string; postUrl?: string; error?: string }>>([])

// Threads 連結狀態
const threadsAuth = ref<{ hasAuth: boolean; username: string | null; isTokenValid: boolean } | null>(null)
const isLoadingThreadsAuth = ref(false)
const isConnectingThreads = ref(false)
const threadsConnectError = ref('')

// CMoney 認證狀態
const cmoneyAuth = ref<{ hasAuth: boolean } | null>(null)

const platforms = [
  { id: 'clipboard', name: '複製到剪貼簿', icon: 'i-heroicons-clipboard-document' },
  { id: 'threads', name: 'Instagram Threads', icon: 'i-heroicons-chat-bubble-oval-left' },
  { id: 'cmoney', name: 'CMoney 同學會', icon: 'i-heroicons-user-group' }
]

// Modal 開啟時檢查認證狀態
watch(isOpen, async (open) => {
  if (open && props.authorId) {
    await checkAuthStatus()
  }
  if (!open) {
    // 關閉時重置
    results.value = []
    isConnectingThreads.value = false
  }
})

async function checkAuthStatus() {
  if (!props.authorId) return

  isLoadingThreadsAuth.value = true
  try {
    const [threadsResult, cmoneyResult] = await Promise.all([
      $fetch<{ hasAuth: boolean; username: string | null; isTokenValid: boolean }>(
        `/api/authors/${props.authorId}/threads-auth`
      ),
      $fetch<{ hasAuth: boolean }>(
        `/api/authors/${props.authorId}/cmoney-auth`
      ).catch(() => null),
    ])
    threadsAuth.value = threadsResult
    cmoneyAuth.value = cmoneyResult || { hasAuth: false }
  } catch {
    threadsAuth.value = null
    cmoneyAuth.value = null
  } finally {
    isLoadingThreadsAuth.value = false
  }
}

function getPlatformStatus(platformId: string): 'ready' | 'needs_setup' | 'loading' {
  if (platformId === 'threads') {
    if (isLoadingThreadsAuth.value) return 'loading'
    if (!threadsAuth.value?.hasAuth || !threadsAuth.value?.isTokenValid) return 'needs_setup'
    return 'ready'
  }
  if (platformId === 'cmoney') {
    if (isLoadingThreadsAuth.value) return 'loading'
    if (!cmoneyAuth.value?.hasAuth) return 'needs_setup'
    return 'ready'
  }
  return 'ready'
}

function togglePlatform(id: string) {
  const index = selectedPlatforms.value.indexOf(id)
  if (index === -1) {
    selectedPlatforms.value.push(id)
  } else {
    selectedPlatforms.value.splice(index, 1)
  }
}

async function connectThreads() {
  if (!props.authorId) {
    threadsConnectError.value = '無法確定作者'
    return
  }
  isConnectingThreads.value = true
  threadsConnectError.value = ''
  try {
    const { url } = await $fetch<{ url: string }>(`/api/authors/${props.authorId}/threads-auth/authorize`)
    // 直接跳轉而非 window.open，避免被瀏覽器阻擋
    window.location.href = url
  } catch (error: any) {
    threadsConnectError.value = error.data?.message || error.message || '無法產生授權連結'
    isConnectingThreads.value = false
  }
}

async function publish() {
  if (selectedPlatforms.value.length === 0) {
    useToast().add({ title: '請選擇至少一個平台', color: 'red' })
    return
  }

  // 檢查選擇的平台是否都已設定
  const needsSetup = selectedPlatforms.value.filter(p => getPlatformStatus(p) === 'needs_setup')
  if (needsSetup.length > 0) {
    const names = needsSetup.map(p => platforms.find(pl => pl.id === p)?.name).join('、')
    useToast().add({ title: `${names} 尚未設定認證`, description: '請先完成帳號連結', color: 'red' })
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
          podcastId: props.podcastId,
          projectId: props.projectId,
          content: props.content,
          platforms: otherPlatforms,
          platformConfigs: {
            ...(props.authorId ? Object.fromEntries(otherPlatforms.map(p => [p, { authorId: props.authorId }])) : {})
          }
        }
      })
      results.value.push(...response.results)
    }

    const hasSuccess = results.value.some(r => r.status === 'success')
    const hasFailed = results.value.some(r => r.status === 'failed')
    useToast().add({
      title: hasFailed ? (hasSuccess ? '部分發布成功' : '發布失敗') : '發布完成',
      icon: hasFailed ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-check-circle',
      color: hasFailed ? (hasSuccess ? 'yellow' : 'red') : 'green'
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
            <div v-for="platform in platforms" :key="platform.id">
              <button
                class="w-full flex items-center justify-between p-3 rounded-lg border-2 transition-colors"
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
                  <!-- 認證狀態標籤 -->
                  <template v-if="getPlatformStatus(platform.id) === 'loading'">
                    <UBadge color="gray" size="xs" variant="subtle">檢查中...</UBadge>
                  </template>
                  <template v-else-if="getPlatformStatus(platform.id) === 'needs_setup'">
                    <UBadge color="orange" size="xs">未連結</UBadge>
                  </template>
                  <template v-else-if="getPlatformStatus(platform.id) === 'ready' && platform.id === 'threads' && threadsAuth?.username">
                    <UBadge color="green" size="xs" variant="subtle">@{{ threadsAuth.username }}</UBadge>
                  </template>
                </div>
                <UIcon
                  :name="selectedPlatforms.includes(platform.id) ? 'i-heroicons-check-circle-solid' : 'i-heroicons-circle'"
                  class="w-5 h-5"
                  :class="selectedPlatforms.includes(platform.id) ? 'text-gray-900' : 'text-gray-300'"
                />
              </button>

              <!-- Threads 未連結：顯示連結按鈕 -->
              <div
                v-if="platform.id === 'threads' && selectedPlatforms.includes('threads') && getPlatformStatus('threads') === 'needs_setup'"
                class="mt-1 ml-3 p-3 bg-orange-50 rounded-lg border border-orange-200"
              >
                <p class="text-sm text-orange-800 mb-2">尚未連結 Threads 帳號，請先完成 OAuth 授權。</p>
                <div class="flex items-center gap-2">
                  <UButton
                    size="sm"
                    color="orange"
                    icon="i-heroicons-link"
                    :loading="isConnectingThreads"
                    @click.stop="connectThreads"
                  >
                    連結 Threads 帳號
                  </UButton>
                  <UButton
                    size="xs"
                    color="gray"
                    variant="ghost"
                    @click.stop="checkAuthStatus"
                  >
                    重新檢查
                  </UButton>
                </div>
                <p v-if="threadsConnectError" class="text-sm text-red-600 mt-2">{{ threadsConnectError }}</p>
              </div>

              <!-- CMoney 未設定：顯示提示 -->
              <div
                v-if="platform.id === 'cmoney' && selectedPlatforms.includes('cmoney') && getPlatformStatus('cmoney') === 'needs_setup'"
                class="mt-1 ml-3 p-3 bg-orange-50 rounded-lg border border-orange-200"
              >
                <p class="text-sm text-orange-800">此作者尚未設定 CMoney 同學會認證（Client ID / 帳號密碼），請至作者設定頁面設定。</p>
              </div>
            </div>
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
              'bg-green-50': result.status === 'success',
              'bg-red-50': result.status === 'failed',
              'bg-gray-50': result.status === 'pending' || result.status === 'manual'
            }"
          >
            <div class="flex items-center gap-2">
              <UIcon :name="getStatusIcon(result.status)" :class="`text-${getStatusColor(result.status)}-500`" />
              <span class="text-sm text-gray-900">{{ platforms.find(p => p.id === result.platform)?.name || result.platform }}</span>
            </div>
            <div class="flex items-center gap-2">
              <a v-if="result.postUrl" :href="result.postUrl" target="_blank" class="text-xs text-blue-600 hover:underline">查看</a>
              <UBadge :color="getStatusColor(result.status)" size="xs">
                {{ result.status === 'success' ? '成功' : result.status === 'failed' ? '失敗' : result.status === 'manual' ? '需手動' : result.status }}
              </UBadge>
            </div>
          </div>
          <!-- 顯示失敗原因 -->
          <div v-for="result in results.filter(r => r.status === 'failed' && r.error)" :key="'err-' + result.platform" class="text-xs text-red-600 px-2">
            {{ result.platform }}: {{ result.error }}
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
