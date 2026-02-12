<script setup lang="ts">
import type { AuthorPersona } from '~/server/database/schema'

interface Props {
  authorId: string
  authorName: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  saved: []
}>()

const isOpen = defineModel<boolean>({ default: false })

const persona = ref('')
const sloganToIgnore = ref('')
const styleGuidelines = ref('')
const isLoading = ref(false)
const isSaving = ref(false)

// 開啟時載入現有人設
watch(isOpen, async (open) => {
  if (open && props.authorId) {
    await loadPersona()
  }
})

// 當 authorId 變更時也重新載入
watch(() => props.authorId, async (newId) => {
  if (isOpen.value && newId) {
    await loadPersona()
  }
})

async function loadPersona() {
  isLoading.value = true
  try {
    const data = await $fetch<AuthorPersona | null>(`/api/authors/${props.authorId}/persona`)
    if (data) {
      persona.value = data.persona || ''
      sloganToIgnore.value = data.sloganToIgnore || ''
      styleGuidelines.value = data.styleGuidelines || ''
    } else {
      // 沒有人設，清空欄位
      persona.value = ''
      sloganToIgnore.value = ''
      styleGuidelines.value = ''
    }
  } catch (error) {
    console.error('Failed to load persona:', error)
  } finally {
    isLoading.value = false
  }
}

async function save() {
  isSaving.value = true
  try {
    await $fetch(`/api/authors/${props.authorId}/persona`, {
      method: 'PUT',
      body: {
        persona: persona.value || null,
        sloganToIgnore: sloganToIgnore.value || null,
        styleGuidelines: styleGuidelines.value || null,
      },
    })
    useToast().add({
      title: '人設已更新',
      icon: 'i-heroicons-check-circle',
      color: 'green',
    })
    emit('saved')
    isOpen.value = false
  } catch (error: any) {
    useToast().add({
      title: '儲存失敗',
      description: error.message || '請稍後再試',
      color: 'red',
    })
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <UModal v-model="isOpen">
    <UCard :ui="{ ring: 'ring-1 ring-gray-200', divide: 'divide-y divide-gray-100' }">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-user-circle" class="w-5 h-5 text-gray-600" />
          <span class="font-semibold text-gray-900">
            編輯「{{ authorName }}」人設
          </span>
        </div>
      </template>

      <div v-if="isLoading" class="flex items-center justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 text-gray-400 animate-spin" />
      </div>

      <div v-else class="space-y-4">
        <p class="text-sm text-gray-500">
          設定此作者的寫作風格、語氣、特色用語等，AI 生成貼文時會遵循這些指引。
        </p>

        <UFormGroup label="人設描述">
          <UTextarea
            v-model="persona"
            :rows="6"
            placeholder="例如：語氣親切幽默、喜歡用比喻說明複雜概念、常以問句引導讀者思考、段落簡短有力..."
            autoresize
          />
        </UFormGroup>

        <UFormGroup label="要忽略的 Slogan（選填）">
          <UInput
            v-model="sloganToIgnore"
            placeholder="例如：歡迎收看老簡講股、先讚後看腰纏萬貫"
          />
          <template #hint>
            <span class="text-xs text-gray-400">Podcast 中的開場白或結尾語，AI 生成時會忽略這些內容</span>
          </template>
        </UFormGroup>

        <UFormGroup label="風格指引（選填）">
          <UTextarea
            v-model="styleGuidelines"
            :rows="3"
            placeholder="例如：專注於實質投資觀點、市場分析、個股解讀"
            autoresize
          />
          <template #hint>
            <span class="text-xs text-gray-400">額外的寫作風格指引，讓 AI 更貼近作者特色</span>
          </template>
        </UFormGroup>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="gray"
            variant="ghost"
            @click="isOpen = false"
          >
            取消
          </UButton>
          <UButton
            color="black"
            :loading="isSaving"
            :disabled="isLoading"
            @click="save"
          >
            儲存
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>
</template>
