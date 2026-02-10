<script setup lang="ts">
const isOpen = defineModel<boolean>({ default: false })

const sourceType = ref<'upload' | 'youtube'>('youtube')
const youtubeUrl = ref('')
const title = ref('')
const file = ref<File | null>(null)
const isSubmitting = ref(false)

const fileInput = ref<HTMLInputElement>()

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.[0]) {
    file.value = target.files[0]
    // 自動填入標題
    if (!title.value) {
      title.value = target.files[0].name.replace(/\.[^/.]+$/, '')
    }
  }
}

async function submit() {
  if (sourceType.value === 'youtube' && !youtubeUrl.value) {
    useToast().add({ title: '請輸入 YouTube 連結', color: 'red' })
    return
  }
  if (sourceType.value === 'upload' && !file.value) {
    useToast().add({ title: '請選擇音檔', color: 'red' })
    return
  }

  isSubmitting.value = true
  try {
    let audioFileUrl = ''

    // 如果是上傳，先上傳檔案
    if (sourceType.value === 'upload' && file.value) {
      const formData = new FormData()
      formData.append('file', file.value)
      const uploadResult = await $fetch<{ url: string }>('/api/upload', {
        method: 'POST',
        body: formData
      })
      audioFileUrl = uploadResult.url
    }

    // 建立 podcast 記錄
    const podcast = await $fetch('/api/podcasts', {
      method: 'POST',
      body: {
        title: title.value || (sourceType.value === 'youtube' ? 'YouTube Podcast' : file.value?.name),
        sourceType: sourceType.value,
        sourceUrl: sourceType.value === 'youtube' ? youtubeUrl.value : undefined,
        audioFileUrl: audioFileUrl || undefined
      }
    })

    // 重置表單
    youtubeUrl.value = ''
    title.value = ''
    file.value = null
    isOpen.value = false

    // 導航到新頁面
    navigateTo(`/podcast/${podcast.id}`)

    useToast().add({
      title: '已建立新記錄',
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  } catch (error: any) {
    useToast().add({
      title: '建立失敗',
      description: error.message,
      color: 'red'
    })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <UModal v-model="isOpen">
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-plus-circle" class="w-5 h-5 text-primary-500" />
          <span class="font-semibold">新增音檔</span>
        </div>
      </template>

      <div class="space-y-4">
        <!-- 來源類型選擇 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">來源類型</label>
          <div class="flex gap-2">
            <UButton
              :color="sourceType === 'youtube' ? 'primary' : 'gray'"
              :variant="sourceType === 'youtube' ? 'solid' : 'outline'"
              icon="i-heroicons-play-circle"
              @click="sourceType = 'youtube'"
            >
              YouTube
            </UButton>
            <UButton
              :color="sourceType === 'upload' ? 'primary' : 'gray'"
              :variant="sourceType === 'upload' ? 'solid' : 'outline'"
              icon="i-heroicons-arrow-up-tray"
              @click="sourceType = 'upload'"
            >
              上傳檔案
            </UButton>
          </div>
        </div>

        <!-- YouTube URL -->
        <div v-if="sourceType === 'youtube'">
          <label class="block text-sm font-medium text-gray-700 mb-2">YouTube 連結</label>
          <UInput
            v-model="youtubeUrl"
            placeholder="https://www.youtube.com/watch?v=..."
            icon="i-heroicons-link"
          />
        </div>

        <!-- 檔案上傳 -->
        <div v-if="sourceType === 'upload'">
          <label class="block text-sm font-medium text-gray-700 mb-2">選擇音檔</label>
          <div
            class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
            :class="file ? 'border-green-400 bg-green-50' : 'border-gray-300'"
            @click="fileInput?.click()"
          >
            <input
              ref="fileInput"
              type="file"
              accept="audio/*"
              class="hidden"
              @change="handleFileChange"
            />
            <UIcon
              :name="file ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-up-tray'"
              class="w-8 h-8 mx-auto mb-2"
              :class="file ? 'text-green-500' : 'text-gray-400'"
            />
            <p v-if="file" class="text-sm text-green-600">{{ file.name }}</p>
            <p v-else class="text-sm text-gray-500">點擊選擇 MP3、WAV 等音檔</p>
          </div>
        </div>

        <!-- 標題 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">標題（選填）</label>
          <UInput
            v-model="title"
            placeholder="輸入標題..."
            icon="i-heroicons-pencil"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="gray" variant="ghost" @click="isOpen = false">
            取消
          </UButton>
          <UButton
            color="primary"
            :loading="isSubmitting"
            @click="submit"
          >
            建立
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 觸發按鈕（當沒有 v-model 時使用） -->
  <UButton
    v-if="!$attrs.modelValue"
    icon="i-heroicons-plus"
    color="primary"
    @click="isOpen = true"
  >
    新增音檔
  </UButton>
</template>
