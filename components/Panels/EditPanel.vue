<script setup lang="ts">
interface Props {
  modelValue: string
  original?: string | null
  learningResult?: any
  isSaving?: boolean
  editId?: string
}

const props = defineProps<Props>()
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
  <div class="bg-white rounded-xl border shadow-sm flex flex-col overflow-hidden">
    <!-- 標題 -->
    <div class="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
      <h3 class="font-medium text-green-700 flex items-center gap-2">
        <UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
        編輯貼文
        <UBadge v-if="hasChanges" color="yellow" size="xs">已修改</UBadge>
      </h3>
      <span class="text-xs text-gray-500">{{ charCount }} 字</span>
    </div>

    <!-- 編輯區 -->
    <div class="flex-1 flex flex-col overflow-hidden">
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
    <div v-if="learningResult?.learned" class="px-4 py-3 bg-purple-50 border-t">
      <div class="flex items-center gap-2 text-purple-700 text-sm">
        <UIcon name="i-heroicons-light-bulb" class="w-4 h-4" />
        <span>AI 學到了 {{ learningResult.patternsFound }} 個新模式</span>
        <UBadge v-if="learningResult.promptUpdated" color="purple" size="xs">
          Prompt 已更新
        </UBadge>
      </div>
    </div>

    <!-- 操作按鈕 -->
    <div class="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
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
          color="primary"
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
        color="green"
        :loading="isSaving"
        @click="emit('save')"
      >
        儲存修改
      </UButton>
    </div>

    <!-- 發布 Modal -->
    <PublishPublishModal
      v-model="isPublishModalOpen"
      :content="content"
      :edit-id="editId"
    />
  </div>
</template>
