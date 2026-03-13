<script setup lang="ts">
import type { Author } from '~/server/database/schema'

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
}

interface CMoneyAuthStatus {
  hasAuth: boolean
  authMethod: 'password' | 'refresh_token' | null
  hasRefreshToken: boolean
  account: string | null
  tokenValid: boolean
  tokenExpiresAt: string | null
}

interface ThreadsAuthStatus {
  hasAuth: boolean
  username: string | null
  tokenExpiresAt: string | null
  isTokenValid: boolean
}

interface Props {
  project?: Project | null
  defaultAuthorId?: string | null
  authors: Author[]
}

const props = defineProps<Props>()
const emit = defineEmits<{ saved: [] }>()
const isOpen = defineModel<boolean>({ default: false })

// ========== CMoney 認證狀態 ==========
const cmoneyAuth = ref<CMoneyAuthStatus | null>(null)
const blogAuth = ref<CMoneyAuthStatus | null>(null)
const threadsAuth = ref<ThreadsAuthStatus | null>(null)
const isSavingCMoneyAuth = ref(false)
const isSavingBlogAuth = ref(false)
const isDisconnectingThreads = ref(false)

// 是否為編輯模式
const isEditing = computed(() => !!props.project)

// 表單狀態
const form = ref({
  name: '',
  authorId: '',
  inputType: '',       // 媒材類型：podcast / video / post
  inputPlatform: '',   // 來源平台
  outputType: '',      // 媒材類型：podcast / video / post
  outputPlatforms: [] as string[],  // 發布平台
  inputConfig: {} as Record<string, string>,
  outputConfig: {} as Record<string, Record<string, string>>,
  isAutoSync: true,
  syncInterval: 4,
})

// 媒材類型選項（ready: true 表示已實作功能）
const mediaTypes = [
  { value: 'podcast', label: 'Podcast', icon: 'i-heroicons-microphone', ready: true },
  { value: 'video', label: '影片', icon: 'i-heroicons-video-camera', ready: true },
  { value: 'post', label: '貼文', icon: 'i-heroicons-document-text', ready: true },
]

// 輸入平台選項（ready: true 表示已實作功能）
const inputPlatformOptions = [
  { value: 'apple_podcast', label: 'Apple Podcast', icon: 'i-simple-icons-applepodcasts', ready: true },
  { value: 'youtube', label: 'YouTube', icon: 'i-simple-icons-youtube', ready: true },
  { value: 'internal_video', label: '內部影音', icon: 'i-heroicons-film', ready: true },
  { value: 'cmoney_classmate', label: '同學會', icon: 'i-heroicons-user-group', ready: true },
  { value: 'line_community', label: 'Line 社群', icon: 'i-simple-icons-line', ready: false },
  { value: 'threads', label: 'Threads', icon: 'i-simple-icons-threads', ready: false, needsOAuth: true },
  { value: 'facebook', label: 'FB', icon: 'i-simple-icons-facebook', ready: false, needsOAuth: true },
  { value: 'instagram', label: 'IG', icon: 'i-simple-icons-instagram', ready: false, needsOAuth: true },
  { value: 'investment_blog', label: '投資網誌', icon: 'i-heroicons-newspaper', ready: true },
]

// 輸出平台選項（ready: true 表示已實作功能）
const outputPlatformOptions = [
  { value: 'cmoney_classmate', label: '同學會', icon: 'i-heroicons-user-group', ready: true },
  { value: 'line_community', label: 'Line 社群', icon: 'i-simple-icons-line', ready: false },
  { value: 'threads', label: 'Threads', icon: 'i-simple-icons-threads', ready: true, needsOAuth: true },
  { value: 'facebook', label: 'FB', icon: 'i-simple-icons-facebook', ready: false, needsOAuth: true },
  { value: 'instagram', label: 'IG', icon: 'i-simple-icons-instagram', ready: false, needsOAuth: true },
  { value: 'investment_blog', label: '投資網誌', icon: 'i-heroicons-newspaper', ready: true },
  { value: 'internal_video', label: '內部影音', icon: 'i-heroicons-film', ready: false },
  { value: 'youtube', label: 'YouTube', icon: 'i-simple-icons-youtube', ready: false },
]

// 保留舊變數名稱給其他地方使用
const inputTypes = mediaTypes
const outputTypes = outputPlatformOptions
const outputPlatforms = outputPlatformOptions

// 輸入平台對應的配置欄位
const inputConfigFields: Record<string, Array<{ key: string; label: string; placeholder: string; type?: string }>> = {
  'apple_podcast': [
    { key: 'trackId', label: 'Podcast Track ID', placeholder: '例如：1602637578' },
  ],
  'youtube': [
    { key: 'channelId', label: 'YouTube 頻道 ID', placeholder: '例如：UC-_yPPKswADJNcIV_jEoGLA' },
  ],
  'internal_video': [
    { key: 'videoUrl', label: '影音網址', placeholder: '輸入內部影音網址' },
  ],
  'cmoney_classmate': [
    { key: 'boardId', label: 'Board ID', placeholder: '例如：10076（長線投資）' },
  ],
  'investment_blog': [
    { key: 'authorSlug', label: '作者 Slug', placeholder: '例如：mike' },
  ],
}

// 同學會文章類型選項
const forumArticleTypes = [
  { value: 'personal', label: '個版' },
  { value: 'group_v1', label: '社團 v1' },
  { value: 'group_v2', label: '社團 v2' },
]

// 輸出平台對應的配置欄位
const outputConfigFields: Record<string, Array<{ key: string; label: string; placeholder: string; type?: string }>> = {
  'cmoney_classmate': [
    { key: 'clientId', label: 'Client ID', placeholder: 'OAuth Client ID' },
    { key: 'refreshToken', label: 'Refresh Token', placeholder: 'Refresh Token（優先使用）' },
    { key: 'account', label: '帳號 Email', placeholder: 'your@email.com（或使用 Refresh Token）' },
    { key: 'password', label: '密碼', placeholder: '密碼', type: 'password' },
    { key: 'boardId', label: 'Board ID（社團 v2）', placeholder: '社團 v2 的 Board ID' },
  ],
  'line_community': [
    { key: 'formUrl', label: 'Google Form URL', placeholder: '輸入 Google Form 網址' },
  ],
  'investment_blog': [
    { key: 'authorSlug', label: '作者 Slug', placeholder: '例如：cmoney' },
    { key: 'userId', label: 'CMoney User ID', placeholder: '例如：6870918203145058' },
  ],
}

// 需要認證的平台
const authPlatforms = ['cmoney_classmate', 'investment_blog']

// 需要 OAuth 授權的平台
const oauthPlatforms = ['threads', 'facebook', 'instagram']

// 當前輸入平台的配置欄位
const currentInputFields = computed(() => {
  return inputConfigFields[form.value.inputPlatform] || []
})

// 需要認證的輸入平台（同學會輸入不需認證，只需 boardId）
const inputAuthPlatforms = ['investment_blog']

// 當前選中的輸入平台資訊
const selectedInputPlatform = computed(() => {
  return inputPlatformOptions.find(p => p.value === form.value.inputPlatform)
})

// 監聽 URL 參數（Threads OAuth 回調）
onMounted(() => {
  const url = new URL(window.location.href)
  const threadsStatus = url.searchParams.get('threads')
  if (threadsStatus === 'connected') {
    useToast().add({
      title: 'Threads 帳號連結成功',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    // 清除 URL 參數
    url.searchParams.delete('threads')
    window.history.replaceState({}, '', url.toString())
  } else if (threadsStatus === 'error') {
    useToast().add({
      title: 'Threads 連結失敗',
      description: url.searchParams.get('message') || '請重試',
      color: 'red',
    })
    url.searchParams.delete('threads')
    url.searchParams.delete('message')
    window.history.replaceState({}, '', url.toString())
  }
})

// Modal 開啟時初始化
watch(isOpen, async (open) => {
  if (open) {
    if (props.project) {
      // 編輯模式 - 載入現有專案
      const projectAny = props.project as any
      form.value = {
        name: props.project.name,
        authorId: props.project.authorId,
        inputType: props.project.inputType,
        inputPlatform: projectAny.inputPlatform || '',
        outputType: projectAny.outputType || '',
        outputPlatforms: Array.isArray(props.project.outputPlatforms)
          ? [...props.project.outputPlatforms]
          : JSON.parse(props.project.outputPlatforms as unknown as string || '[]'),
        inputConfig: props.project.inputConfig ? { ...props.project.inputConfig as Record<string, string> } : {},
        outputConfig: props.project.outputConfig
          ? JSON.parse(JSON.stringify(props.project.outputConfig))
          : {},
        isAutoSync: props.project.isAutoSync ?? true,
        syncInterval: props.project.syncInterval ?? 4,
      }
      // 載入認證狀態
      await loadAuthStatus(props.project.authorId)
    } else if (props.defaultAuthorId) {
      // 從作者預填預設值（適用於從 Podcast 頁面進入但沒有關聯專案的情況）
      const author = props.authors.find(a => a.id === props.defaultAuthorId) as any

      // 根據作者現有設定預填
      const inputConfig: Record<string, string> = {}
      let inputPlatform = ''
      let inputType = 'podcast' // 預設為 podcast

      if (author?.cmoneyPodcastTrackId) {
        inputPlatform = 'apple_podcast'
        inputConfig.trackId = author.cmoneyPodcastTrackId
      }

      if (author?.cmoneyYoutubeChannelId) {
        // 如果有 YouTube 頻道，可能是內部影音
        if (!inputPlatform) {
          inputPlatform = 'internal_video'
          inputType = 'video'
        }
        inputConfig.channelId = author.cmoneyYoutubeChannelId
      }

      form.value = {
        name: '',
        authorId: props.defaultAuthorId,
        inputType,
        inputPlatform,
        outputType: 'post', // 預設輸出貼文
        outputPlatforms: ['cmoney_classmate'], // 預設輸出到同學會
        inputConfig,
        outputConfig: {},
        isAutoSync: true,
        syncInterval: 4,
      }

      await loadAuthStatus(props.defaultAuthorId)
    } else {
      // 全新模式
      form.value = {
        name: '',
        authorId: '',
        inputType: '',
        inputPlatform: '',
        outputType: '',
        outputPlatforms: [],
        inputConfig: {},
        outputConfig: {},
        isAutoSync: true,
        syncInterval: 4,
      }
      cmoneyAuth.value = null
      blogAuth.value = null
      threadsAuth.value = null
    }
  }
})

// 當作者變更時重新載入認證狀態
watch(() => form.value.authorId, async (newAuthorId) => {
  if (newAuthorId && isOpen.value) {
    await loadAuthStatus(newAuthorId)
  }
})

// 載入認證狀態
async function loadAuthStatus(authorId: string) {
  try {
    const [cmoneyData, blogData, threadsData] = await Promise.all([
      $fetch<CMoneyAuthStatus>(`/api/authors/${authorId}/cmoney-auth`).catch(() => null),
      $fetch<CMoneyAuthStatus>(`/api/authors/${authorId}/blog-auth`).catch(() => null),
      $fetch<ThreadsAuthStatus>(`/api/authors/${authorId}/threads-auth`).catch(() => null),
    ])
    cmoneyAuth.value = cmoneyData
    blogAuth.value = blogData
    threadsAuth.value = threadsData
  } catch (error) {
    console.error('Failed to load auth status:', error)
    cmoneyAuth.value = null
    blogAuth.value = null
    threadsAuth.value = null
  }
}

// 儲存同學會認證（輸出或輸入）
async function saveCMoneyAuth() {
  // 優先從輸出配置取得，如果沒有再從輸入配置取得
  const outputConfig = form.value.outputConfig['cmoney_classmate']
  const inputConfig = form.value.inputConfig
  const isFromInput = form.value.inputPlatform === 'cmoney_classmate' && inputConfig?.clientId
  const config = isFromInput ? inputConfig : outputConfig

  if (!config?.clientId) {
    useToast().add({ title: '請填寫 Client ID', color: 'red' })
    return
  }

  const hasRefreshToken = !!config?.refreshToken
  const hasPassword = !!(config?.account && config?.password)

  if (!hasRefreshToken && !hasPassword) {
    useToast().add({ title: '請填寫 Refresh Token 或帳號密碼', color: 'red' })
    return
  }

  isSavingCMoneyAuth.value = true
  try {
    const body: Record<string, string> = { clientId: config.clientId }
    if (hasRefreshToken) {
      body.refreshToken = config.refreshToken!
    }
    if (hasPassword) {
      body.account = config.account!
      body.password = config.password!
    }

    await $fetch(`/api/authors/${form.value.authorId}/cmoney-auth`, {
      method: 'PUT',
      body,
    })
    useToast().add({
      title: '同學會認證設定成功',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    cmoneyAuth.value = await $fetch<CMoneyAuthStatus>(`/api/authors/${form.value.authorId}/cmoney-auth`)
    // 清空敏感欄位
    if (isFromInput) {
      form.value.inputConfig = { ...inputConfig, password: '', refreshToken: '' }
    } else {
      form.value.outputConfig['cmoney_classmate'] = { ...outputConfig, password: '', refreshToken: '' }
    }
  } catch (error: any) {
    useToast().add({
      title: '同學會認證失敗',
      description: error.data?.message || error.message || '請檢查認證資訊',
      color: 'red',
    })
  } finally {
    isSavingCMoneyAuth.value = false
  }
}

// 儲存投資網誌認證（輸出或輸入）
async function saveBlogAuth() {
  // 優先從輸出配置取得，如果沒有再從輸入配置取得
  const outputConfig = form.value.outputConfig['investment_blog']
  const inputConfig = form.value.inputConfig
  const isFromInput = form.value.inputPlatform === 'investment_blog' && inputConfig?.authorSlug
  const config = isFromInput ? inputConfig : outputConfig

  if (!config?.authorSlug || !config?.userId) {
    useToast().add({ title: '請填寫投資網誌所有認證欄位（作者 Slug 和 User ID）', color: 'red' })
    return
  }

  isSavingBlogAuth.value = true
  try {
    await $fetch(`/api/authors/${form.value.authorId}/blog-auth`, {
      method: 'PUT',
      body: {
        authorSlug: config.authorSlug,
        userId: config.userId,
      },
    })
    useToast().add({
      title: '投資網誌認證設定成功',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    blogAuth.value = await $fetch<CMoneyAuthStatus>(`/api/authors/${form.value.authorId}/blog-auth`)
  } catch (error: any) {
    useToast().add({
      title: '投資網誌認證失敗',
      description: error.data?.message || error.message || '請檢查設定',
      color: 'red',
    })
  } finally {
    isSavingBlogAuth.value = false
  }
}

// Threads OAuth 連結
async function connectThreads() {
  if (!form.value.authorId) {
    useToast().add({ title: '請先選擇作者', color: 'red' })
    return
  }
  try {
    const data = await $fetch<{ url: string }>(`/api/authors/${form.value.authorId}/threads-auth/authorize`)
    window.location.href = data.url
  } catch (error: any) {
    useToast().add({
      title: 'Threads 授權失敗',
      description: error.data?.message || error.message,
      color: 'red',
    })
  }
}

// Threads 斷開連結
async function disconnectThreads() {
  if (!form.value.authorId) return
  isDisconnectingThreads.value = true
  try {
    await $fetch(`/api/authors/${form.value.authorId}/threads-auth`, { method: 'DELETE' })
    threadsAuth.value = { hasAuth: false, username: null, tokenExpiresAt: null, isTokenValid: false }
    useToast().add({
      title: 'Threads 帳號已斷開連結',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
  } catch (error: any) {
    useToast().add({
      title: '斷開失敗',
      description: error.data?.message || error.message,
      color: 'red',
    })
  } finally {
    isDisconnectingThreads.value = false
  }
}

// 取得認證狀態
function getAuthStatus(platform: string): CMoneyAuthStatus | null {
  if (platform === 'cmoney_classmate') return cmoneyAuth.value
  if (platform === 'investment_blog') return blogAuth.value
  return null
}

// 取得認證按鈕載入狀態
function getAuthButtonLoading(platform: string): boolean {
  if (platform === 'cmoney_classmate') return isSavingCMoneyAuth.value
  if (platform === 'investment_blog') return isSavingBlogAuth.value
  return false
}

// 處理認證儲存
function handleAuthSave(platform: string) {
  if (platform === 'cmoney_classmate') saveCMoneyAuth()
  else if (platform === 'investment_blog') saveBlogAuth()
}

// 切換輸出平台
function toggleOutputPlatform(platform: string) {
  const index = form.value.outputPlatforms.indexOf(platform)
  if (index === -1) {
    form.value.outputPlatforms.push(platform)
    // 初始化該平台的配置
    const defaultConfig: Record<string, string> = {}
    if (platform === 'cmoney_classmate') {
      defaultConfig.articleType = 'personal'
    }
    form.value.outputConfig[platform] = defaultConfig
  } else {
    form.value.outputPlatforms.splice(index, 1)
    delete form.value.outputConfig[platform]
  }
}

const isSaving = ref(false)

// 自動生成專案名稱
function generateProjectName() {
  const inputTypeLabel = mediaTypes.find(t => t.value === form.value.inputType)?.label || form.value.inputType
  const inputPlatformLabel = inputPlatformOptions.find(p => p.value === form.value.inputPlatform)?.label || ''
  const outputTypeLabel = mediaTypes.find(t => t.value === form.value.outputType)?.label || ''
  const outputPlatformLabels = form.value.outputPlatforms
    .slice(0, 2)
    .map(p => outputPlatformOptions.find(op => op.value === p)?.label || p)
    .join('/')
  const suffix = form.value.outputPlatforms.length > 2 ? ` +${form.value.outputPlatforms.length - 2}` : ''

  // 格式：輸入類型(平台) → 輸出類型(平台)
  const inputPart = inputPlatformLabel ? `${inputTypeLabel}(${inputPlatformLabel})` : inputTypeLabel
  const outputPart = outputTypeLabel
    ? `${outputTypeLabel}(${outputPlatformLabels}${suffix})`
    : `${outputPlatformLabels}${suffix}`

  return `${inputPart} → ${outputPart}`
}

async function save() {
  // 驗證必填
  if (!form.value.authorId) {
    useToast().add({ title: '請選擇作者', color: 'red' })
    return
  }
  if (!form.value.inputType) {
    useToast().add({ title: '請選擇輸入類型', color: 'red' })
    return
  }
  if (!form.value.outputType) {
    useToast().add({ title: '請選擇輸出類型', color: 'red' })
    return
  }
  if (form.value.outputPlatforms.length === 0) {
    useToast().add({ title: '請至少選擇一個輸出平台', color: 'red' })
    return
  }

  isSaving.value = true
  try {
    // 自動生成專案名稱
    const projectName = generateProjectName()

    const body = {
      name: projectName,
      authorId: form.value.authorId,
      inputType: form.value.inputType,
      inputPlatform: form.value.inputPlatform,
      outputType: form.value.outputType,
      inputConfig: form.value.inputConfig,
      outputPlatforms: form.value.outputPlatforms,
      outputConfig: form.value.outputConfig,
      isAutoSync: form.value.isAutoSync,
      syncInterval: form.value.syncInterval,
    }

    if (isEditing.value && props.project) {
      await $fetch(`/api/projects/${props.project.id}`, {
        method: 'PUT' as const,
        body,
      })
    } else {
      await $fetch('/api/projects', {
        method: 'POST',
        body,
      })
    }
    useToast().add({
      title: isEditing.value ? '專案已更新' : '專案已建立',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    emit('saved')
    isOpen.value = false
  } catch (error: any) {
    useToast().add({
      title: '儲存失敗',
      description: error.data?.message || error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}

// 取得作者選項
const authorOptions = computed(() => {
  return props.authors.map(a => ({ label: a.name, value: a.id }))
})
</script>

<template>
  <UModal v-model="isOpen" :ui="{ width: 'sm:max-w-2xl' }">
    <UCard :ui="{ ring: 'ring-1 ring-gray-200', divide: 'divide-y divide-gray-100' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-folder-plus" class="w-5 h-5 text-gray-600" />
          <span class="font-semibold text-gray-900">
            {{ isEditing ? '編輯專案' : '新增專案' }}
          </span>
        </div>
      </template>

      <div class="space-y-6 max-h-[70vh] overflow-y-auto">
        <!-- 所屬作者 -->
        <UFormGroup label="所屬作者" required>
          <USelectMenu
            v-model="form.authorId"
            :options="authorOptions"
            value-attribute="value"
            option-attribute="label"
            placeholder="選擇作者"
            searchable
            searchable-placeholder="搜尋作者..."
            :disabled="isEditing"
          />
        </UFormGroup>

        <!-- ===== 輸入區塊 ===== -->
        <div class="p-4 bg-purple-50 rounded-lg space-y-4">
          <h3 class="font-semibold text-purple-900">輸入</h3>

          <!-- 輸入類型（單選） -->
          <UFormGroup label="類型" required>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="type in mediaTypes"
                :key="type.value"
                type="button"
                class="flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left relative"
                :class="[
                  form.inputType === type.value
                    ? 'border-purple-600 bg-purple-100'
                    : type.ready
                      ? 'border-gray-200 bg-white hover:border-gray-300'
                      : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                ]"
                :disabled="!type.ready"
                @click="type.ready && (form.inputType = type.value)"
              >
                <UIcon :name="type.icon" class="w-5 h-5 flex-shrink-0" :class="type.ready ? 'text-gray-600' : 'text-gray-400'" />
                <span class="font-medium text-sm" :class="type.ready ? 'text-gray-900' : 'text-gray-400'">{{ type.label }}</span>
                <UBadge v-if="!type.ready" color="gray" size="xs" class="absolute -top-1 -right-1">
                  開發中
                </UBadge>
              </button>
            </div>
          </UFormGroup>

          <!-- 輸入平台（單選） -->
          <UFormGroup label="平台">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="platform in inputPlatformOptions"
                :key="platform.value"
                type="button"
                class="flex items-center gap-2 p-2 rounded-lg border-2 transition-colors text-left relative"
                :class="[
                  form.inputPlatform === platform.value
                    ? 'border-purple-600 bg-purple-100'
                    : platform.ready
                      ? 'border-gray-200 bg-white hover:border-gray-300'
                      : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                ]"
                :disabled="!platform.ready"
                @click="platform.ready && (form.inputPlatform = form.inputPlatform === platform.value ? '' : platform.value)"
              >
                <UIcon :name="platform.icon" class="w-4 h-4 flex-shrink-0" :class="platform.ready ? 'text-gray-600' : 'text-gray-400'" />
                <span class="text-sm" :class="platform.ready ? 'text-gray-900' : 'text-gray-400'">{{ platform.label }}</span>
                <UBadge v-if="!platform.ready" color="gray" size="xs" class="absolute -top-1 -right-1">
                  開發中
                </UBadge>
              </button>
            </div>
          </UFormGroup>

          <!-- 輸入平台配置（選中後顯示） -->
          <div v-if="form.inputPlatform && currentInputFields.length > 0" class="p-3 bg-white rounded-lg border border-purple-200 space-y-3">
            <div class="flex items-center justify-between">
              <h4 class="text-sm font-medium text-purple-700">
                {{ selectedInputPlatform?.label }} 配置
              </h4>
              <!-- 輸入平台認證狀態 -->
              <template v-if="inputAuthPlatforms.includes(form.inputPlatform) && getAuthStatus(form.inputPlatform)">
                <UBadge
                  :color="getAuthStatus(form.inputPlatform)?.hasAuth ? 'green' : 'yellow'"
                  size="sm"
                >
                  {{ getAuthStatus(form.inputPlatform)?.hasAuth ? '已設定' : '未設定' }}
                </UBadge>
              </template>
            </div>

            <!-- 已認證顯示資訊 -->
            <div v-if="inputAuthPlatforms.includes(form.inputPlatform) && getAuthStatus(form.inputPlatform)?.hasAuth" class="text-sm text-gray-600">
              <template v-if="form.inputPlatform === 'cmoney_classmate'">
                {{ (getAuthStatus(form.inputPlatform) as CMoneyAuthStatus)?.authMethod === 'refresh_token' ? '認證方式：Refresh Token' : `帳號：${getAuthStatus(form.inputPlatform)?.account}` }}
              </template>
              <template v-else>
                {{ getAuthStatus(form.inputPlatform)?.account ? `帳號：${getAuthStatus(form.inputPlatform)?.account}` : `Slug：${(getAuthStatus(form.inputPlatform) as any)?.authorSlug}` }}
              </template>
            </div>

            <UFormGroup
              v-for="field in currentInputFields"
              :key="field.key"
              :label="field.label"
            >
              <UInput
                v-model="form.inputConfig[field.key]"
                :type="field.type || 'text'"
                :placeholder="field.placeholder"
              />
            </UFormGroup>

            <!-- 輸入平台認證按鈕 -->
            <div v-if="inputAuthPlatforms.includes(form.inputPlatform)" class="flex justify-end">
              <UButton
                size="sm"
                color="purple"
                :loading="getAuthButtonLoading(form.inputPlatform)"
                :disabled="!form.authorId"
                @click="handleAuthSave(form.inputPlatform)"
              >
                {{ getAuthStatus(form.inputPlatform)?.hasAuth ? '重新驗證' : '驗證並儲存' }}
              </UButton>
            </div>
          </div>
        </div>

        <!-- ===== 輸出區塊 ===== -->
        <div class="p-4 bg-green-50 rounded-lg space-y-4">
          <h3 class="font-semibold text-green-900">輸出</h3>

          <!-- 輸出類型（單選） -->
          <UFormGroup label="類型" required>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="type in mediaTypes"
                :key="type.value"
                type="button"
                class="flex items-center gap-2 p-3 rounded-lg border-2 transition-colors text-left relative"
                :class="[
                  form.outputType === type.value
                    ? 'border-green-600 bg-green-100'
                    : type.ready
                      ? 'border-gray-200 bg-white hover:border-gray-300'
                      : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                ]"
                :disabled="!type.ready"
                @click="type.ready && (form.outputType = type.value)"
              >
                <UIcon :name="type.icon" class="w-5 h-5 flex-shrink-0" :class="type.ready ? 'text-gray-600' : 'text-gray-400'" />
                <span class="font-medium text-sm" :class="type.ready ? 'text-gray-900' : 'text-gray-400'">{{ type.label }}</span>
                <UBadge v-if="!type.ready" color="gray" size="xs" class="absolute -top-1 -right-1">
                  開發中
                </UBadge>
              </button>
            </div>
          </UFormGroup>

          <!-- 輸出平台（多選） -->
          <UFormGroup label="平台" required hint="可多選">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="platform in outputPlatformOptions"
                :key="platform.value"
                type="button"
                class="flex items-center gap-2 p-2 rounded-lg border-2 transition-colors text-left relative"
                :class="[
                  form.outputPlatforms.includes(platform.value)
                    ? 'border-green-600 bg-green-100'
                    : platform.ready
                      ? 'border-gray-200 bg-white hover:border-gray-300'
                      : 'border-gray-100 bg-gray-50 cursor-not-allowed opacity-60'
                ]"
                :disabled="!platform.ready"
                @click="platform.ready && toggleOutputPlatform(platform.value)"
              >
                <UIcon :name="platform.icon" class="w-4 h-4 flex-shrink-0" :class="platform.ready ? 'text-gray-600' : 'text-gray-400'" />
                <span class="text-sm" :class="platform.ready ? 'text-gray-900' : 'text-gray-400'">{{ platform.label }}</span>
                <UBadge v-if="!platform.ready" color="gray" size="xs" class="absolute -top-1 -right-1">
                  開發中
                </UBadge>
              </button>
            </div>
          </UFormGroup>
        </div>

        <!-- 各輸出類型配置 -->
        <div
          v-for="outputItem in form.outputPlatforms"
          :key="outputItem"
          class="p-4 rounded-lg space-y-4"
          :class="oauthPlatforms.includes(outputItem) ? 'bg-amber-50' : authPlatforms.includes(outputItem) ? 'bg-green-50/50' : 'bg-blue-50'"
        >
          <div class="flex items-center justify-between">
            <h4
              class="text-sm font-medium"
              :class="oauthPlatforms.includes(outputItem) ? 'text-amber-700' : authPlatforms.includes(outputItem) ? 'text-green-700' : 'text-blue-700'"
            >
              {{ outputTypes.find(p => p.value === outputItem)?.label }} 配置
            </h4>
            <!-- 認證狀態 Badge -->
            <template v-if="authPlatforms.includes(outputItem) && getAuthStatus(outputItem)">
              <UBadge
                :color="getAuthStatus(outputItem)?.hasAuth ? 'green' : 'yellow'"
                size="sm"
              >
                {{ getAuthStatus(outputItem)?.hasAuth ? '已設定' : '未設定' }}
              </UBadge>
            </template>
          </div>

          <!-- 已認證顯示資訊 -->
          <div v-if="authPlatforms.includes(outputItem) && getAuthStatus(outputItem)?.hasAuth" class="text-sm text-gray-600">
            <template v-if="outputItem === 'cmoney_classmate'">
              {{ (getAuthStatus(outputItem) as CMoneyAuthStatus)?.authMethod === 'refresh_token' ? '認證方式：Refresh Token' : `帳號：${getAuthStatus(outputItem)?.account}` }}
            </template>
            <template v-else>
              {{ getAuthStatus(outputItem)?.account ? `帳號：${getAuthStatus(outputItem)?.account}` : `Slug：${(getAuthStatus(outputItem) as any)?.authorSlug}` }}
            </template>
          </div>

          <!-- 同學會文章類型選擇 -->
          <UFormGroup v-if="outputItem === 'cmoney_classmate'" label="文章類型">
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="type in forumArticleTypes"
                :key="type.value"
                type="button"
                class="p-2 rounded-lg border-2 transition-colors text-center text-sm font-medium"
                :class="[
                  form.outputConfig[outputItem]?.articleType === type.value
                    ? 'border-green-600 bg-green-100 text-green-900'
                    : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                ]"
                @click="form.outputConfig[outputItem] = { ...form.outputConfig[outputItem], articleType: type.value }"
              >
                {{ type.label }}
              </button>
            </div>
          </UFormGroup>

          <template v-for="field in (outputConfigFields[outputItem] || [])" :key="field.key">
            <UFormGroup
              v-if="field.key !== 'boardId' || form.outputConfig[outputItem]?.articleType === 'group_v2'"
              :label="field.label"
            >
              <UInput
                v-model="form.outputConfig[outputItem][field.key]"
                :type="field.type || 'text'"
                :placeholder="field.placeholder"
              />
            </UFormGroup>
          </template>

          <!-- CMoney 認證按鈕 -->
          <div
            v-if="authPlatforms.includes(outputItem)"
            class="flex justify-end"
          >
            <UButton
              size="sm"
              color="green"
              :loading="getAuthButtonLoading(outputItem)"
              :disabled="!form.authorId"
              @click="handleAuthSave(outputItem)"
            >
              {{ getAuthStatus(outputItem)?.hasAuth ? '重新驗證' : '驗證並儲存' }}
            </UButton>
          </div>

          <!-- Threads OAuth 連結 -->
          <template v-if="outputItem === 'threads'">
            <div v-if="threadsAuth?.hasAuth" class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UBadge color="green" size="sm">已連結</UBadge>
                <span class="text-sm text-gray-600">@{{ threadsAuth.username }}</span>
              </div>
              <UButton
                size="sm"
                color="red"
                variant="ghost"
                :loading="isDisconnectingThreads"
                @click="disconnectThreads"
              >
                斷開連結
              </UButton>
            </div>
            <div v-else class="flex items-center justify-between">
              <span class="text-sm text-amber-600">尚未連結 Threads 帳號</span>
              <UButton
                size="sm"
                color="amber"
                :disabled="!form.authorId"
                @click="connectThreads"
              >
                連結 Threads 帳號
              </UButton>
            </div>
          </template>
          <!-- 其他 OAuth 平台提示 -->
          <div v-else-if="oauthPlatforms.includes(outputItem)" class="flex items-center gap-2 text-sm text-amber-600">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 flex-shrink-0" />
            <span>此平台需要 OAuth 授權</span>
          </div>
          <!-- 無需配置提示 -->
          <p
            v-else-if="!outputConfigFields[outputItem]?.length && !authPlatforms.includes(outputItem)"
            class="text-sm text-blue-600"
          >
            此平台無需額外配置
          </p>
        </div>

        <!-- 排程設定 -->
        <div class="p-4 bg-gray-50 rounded-lg space-y-4">
          <h4 class="text-sm font-medium text-gray-700">排程設定</h4>
          <div class="flex items-center gap-4">
            <UCheckbox v-model="form.isAutoSync" label="自動同步" />
            <UFormGroup v-if="form.isAutoSync" label="同步間隔（小時）" class="flex-1">
              <UInput
                v-model.number="form.syncInterval"
                type="number"
                min="1"
                max="24"
              />
            </UFormGroup>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="isOpen = false">
            取消
          </UButton>
          <UButton color="black" :loading="isSaving" @click="save">
            {{ isEditing ? '更新' : '建立' }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
