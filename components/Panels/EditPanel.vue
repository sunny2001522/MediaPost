<script setup lang="ts">
interface Props {
  modelValue?: string
  original?: string | null
  learningResult?: any
  isSaving?: boolean
  editId?: string
  preferenceGuidelines?: string | null
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: ''
})
const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
  copy: []
}>()

const content = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const hasChanges = computed(() => {
  return props.original && content.value !== props.original
})

const charCount = computed(() => content.value?.length || 0)

// 計算修改幅度
const editSeverity = computed(() => {
  if (!props.original || !hasChanges.value) return 0
  const originalLen = props.original.length
  const currentLen = content.value.length
  const diff = Math.abs(originalLen - currentLen)
  return Math.min(1, diff / Math.max(originalLen, currentLen))
})

// 發布 Modal
const isPublishModalOpen = ref(false)
</script>

<template>
  <div class="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
    <!-- 標題 -->
    <div class="px-4 py-3 border-b border-gray-100 bg-white flex items-center justify-between">
      <h3 class="font-medium text-gray-900 flex items-center gap-2">
        <UIcon name="i-heroicons-pencil-square" class="w-4 h-4 text-gray-500" />
        編輯貼文
        <UBadge v-if="hasChanges" color="gray" size="xs" variant="subtle">已修改</UBadge>
      </h3>
      <span class="text-xs text-gray-500">{{ charCount }} 字</span>
    </div>

    <!-- 編輯區 -->
    <div class="flex-1 flex flex-col overflow-hidden bg-white">
      <UTextarea
        v-model="content"
        :disabled="!original"
        placeholder="AI 生成貼文後，可在此編輯..."
        class="flex-1 border-0 focus:ring-0 resize-none"
        :ui="{
          base: 'h-full',
          rounded: 'rounded-none',
          padding: { sm: 'p-4' }
        }"
      />
    </div>

    <!-- 學習洞察（如果有修改） -->
    <div v-if="learningResult?.learned" class="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div class="flex items-center gap-2 text-gray-700 text-sm">
        <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
        <span>AI 學到了 {{ learningResult.patternsFound }} 個新模式</span>
        <UBadge v-if="learningResult.promptUpdated" color="gray" size="xs">
          Prompt 已更新
        </UBadge>
      </div>
    </div>

    <!-- 偏好指引區塊 -->
    <div v-if="preferenceGuidelines" class="px-4 py-3 bg-amber-50 border-t border-amber-100">
      <div class="flex items-center gap-2 mb-2">
        <UIcon name="i-heroicons-sparkles" class="w-4 h-4 text-amber-600" />
        <span class="text-sm font-medium text-amber-800">AI 學習到的偏好指引</span>
      </div>
      <p class="text-sm text-amber-700 whitespace-pre-wrap">{{ preferenceGuidelines }}</p>
    </div>

    <!-- 操作按鈕 -->
    <div class="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-heroicons-clipboard-document"
          size="sm"
          color="gray"
          variant="solid"
          :disabled="!content"
          @click="emit('copy')"
        >
          複製
        </UButton>
        <UButton
          icon="i-heroicons-paper-airplane"
          size="sm"
          color="gray"
          variant="outline"
          :disabled="!content"
          @click="isPublishModalOpen = true"
        >
          發布
        </UButton>
      </div>
      <UButton
        v-if="hasChanges"
        icon="i-heroicons-check"
        size="sm"
        color="black"
        :loading="isSaving"
        @click="emit('save')"
      >
        儲存修改
      </UButton>
    </div>

    <!-- 發布 Modal -->
    <PublishModal
      v-model="isPublishModalOpen"
      :content="content"
      :edit-id="editId"
    />
  </div>
</template>
