<script setup lang="ts">
interface Props {
  result?: {
    learned: boolean
    patternsFound?: number
    preferencesUpdated?: number
    promptUpdated?: boolean
    reason?: string
  } | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()

const isVisible = computed(() => props.result?.learned)

// 自動關閉
watch(isVisible, (visible) => {
  if (visible) {
    setTimeout(() => {
      emit('close')
    }, 5000)
  }
})
</script>

<template>
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="transform translate-y-4 opacity-0"
    enter-to-class="transform translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="transform translate-y-0 opacity-100"
    leave-to-class="transform translate-y-4 opacity-0"
  >
    <div
      v-if="isVisible"
      class="fixed bottom-6 right-6 bg-purple-600 text-white rounded-xl shadow-lg p-4 max-w-sm"
    >
      <div class="flex items-start gap-3">
        <div class="flex-shrink-0">
          <div class="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
            <UIcon name="i-heroicons-light-bulb" class="w-5 h-5" />
          </div>
        </div>
        <div class="flex-1">
          <h4 class="font-semibold mb-1">AI 正在學習你的風格</h4>
          <p class="text-sm text-purple-200">
            發現了 {{ result?.patternsFound || 0 }} 個寫作模式
            <span v-if="result?.preferencesUpdated">
              ，更新了 {{ result.preferencesUpdated }} 個偏好
            </span>
          </p>
          <div v-if="result?.promptUpdated" class="mt-2">
            <UBadge color="white" variant="solid" size="xs">
              Prompt 已自動優化
            </UBadge>
          </div>
        </div>
        <button
          class="flex-shrink-0 text-purple-300 hover:text-white"
          @click="emit('close')"
        >
          <UIcon name="i-heroicons-x-mark" class="w-5 h-5" />
        </button>
      </div>
    </div>
  </Transition>
</template>
