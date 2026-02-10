<script setup lang="ts">
import type { Podcast } from '~/server/database/schema'

interface Props {
  podcast: Podcast
  isActive?: boolean
}

defineProps<Props>()

const statusColors = {
  pending: 'gray',
  downloading: 'yellow',
  transcribing: 'yellow',
  generating: 'blue',
  completed: 'green',
  error: 'red'
} as const
</script>

<template>
  <NuxtLink
    :to="`/podcast/${podcast.id}`"
    class="block p-3 rounded-lg transition-colors"
    :class="isActive ? 'bg-primary-50 border border-primary-200' : 'hover:bg-gray-50'"
  >
    <div class="flex items-start gap-2">
      <UIcon
        :name="podcast.sourceType === 'youtube' ? 'i-heroicons-play-circle' : 'i-heroicons-microphone'"
        class="w-4 h-4 mt-0.5 text-gray-400"
      />
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-gray-900 truncate">
          {{ podcast.title }}
        </p>
        <div class="flex items-center gap-2 mt-1">
          <UBadge
            :color="statusColors[podcast.status as keyof typeof statusColors] || 'gray'"
            size="xs"
            variant="subtle"
          >
            {{ podcast.status }}
          </UBadge>
          <span class="text-xs text-gray-400">
            {{ new Date(podcast.createdAt).toLocaleDateString() }}
          </span>
        </div>
      </div>
    </div>
  </NuxtLink>
</template>
