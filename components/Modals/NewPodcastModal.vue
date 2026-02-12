<script setup lang="ts">
import type { Author } from "~/server/database/schema";

interface Props {
  defaultAuthorId?: string | null;
}
const props = defineProps<Props>();

const isOpen = defineModel<boolean>({ default: false });

const sourceType = ref<"upload" | "youtube">("youtube");
const youtubeUrl = ref("");
const title = ref("");
const manualDescription = ref(""); // 手動輸入的 YouTube 描述
const selectedAuthorId = ref<string | null>(props.defaultAuthorId ?? null);

// Modal 開啟時，重設作者為預設值
watch(isOpen, (newVal) => {
  if (newVal) {
    selectedAuthorId.value = props.defaultAuthorId ?? null;
  }
});
const file = ref<File | null>(null);
const isSubmitting = ref(false);
const isDragging = ref(false);

const fileInput = ref<HTMLInputElement>();

// 使用新的客戶端上傳 composable
const {
  uploadFile,
  isUploading,
  progress,
  error: uploadError,
  reset: resetUpload,
} = useClientUpload();

// 獲取作者列表
const { data: authors } = await useFetch<Author[]>("/api/authors");

// 格式化檔案大小
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  if (target.files?.[0]) {
    processFile(target.files[0]);
  }
}

function processFile(selectedFile: File) {
  // 驗證檔案類型
  if (!selectedFile.type.startsWith("audio/")) {
    useToast().add({
      title: "檔案格式不支援",
      description: "請上傳音檔（MP3、WAV 等）",
      color: "red",
    });
    return;
  }

  // 驗證檔案大小（200MB）
  const maxSize = 200 * 1024 * 1024;
  if (selectedFile.size > maxSize) {
    useToast().add({
      title: "檔案過大",
      description: `最大支援 ${formatFileSize(maxSize)}`,
      color: "red",
    });
    return;
  }

  file.value = selectedFile;
  // 自動填入標題
  if (!title.value) {
    title.value = selectedFile.name.replace(/\.[^/.]+$/, "");
  }
  // 重置上傳狀態
  resetUpload();
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e: DragEvent) {
  isDragging.value = false;
}

function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;

  const droppedFile = e.dataTransfer?.files[0];
  if (droppedFile) {
    processFile(droppedFile);
  }
}

async function submit() {
  if (sourceType.value === "youtube" && !youtubeUrl.value) {
    useToast().add({ title: "請輸入 YouTube 連結", color: "red" });
    return;
  }
  if (sourceType.value === "upload" && !file.value) {
    useToast().add({ title: "請選擇音檔", color: "red" });
    return;
  }

  isSubmitting.value = true;
  try {
    let audioFileUrl = "";

    // 使用客戶端直傳 Vercel Blob
    if (sourceType.value === "upload" && file.value) {
      const uploadResult = await uploadFile(file.value);
      audioFileUrl = uploadResult.url;
    }

    // 建立 podcast 記錄
    const podcast = await $fetch("/api/podcasts", {
      method: "POST",
      body: {
        title:
          title.value ||
          (sourceType.value === "youtube"
            ? "YouTube Podcast"
            : file.value?.name),
        authorId: selectedAuthorId.value,
        sourceType: sourceType.value,
        sourceUrl:
          sourceType.value === "youtube" ? youtubeUrl.value : undefined,
        audioFileUrl: audioFileUrl || undefined,
        manualDescription:
          sourceType.value === "youtube" && manualDescription.value.trim()
            ? manualDescription.value.trim()
            : undefined,
      },
    });

    // 重置表單
    youtubeUrl.value = "";
    title.value = "";
    manualDescription.value = "";
    selectedAuthorId.value = null;
    file.value = null;
    resetUpload();
    isOpen.value = false;

    // 導航到新頁面
    navigateTo(`/podcast/${podcast.id}`);

    useToast().add({
      title: "已建立新記錄",
      icon: "i-heroicons-check-circle",
      color: "green",
    });
  } catch (error: any) {
    useToast().add({
      title: "建立失敗",
      description: uploadError.value || error.message,
      color: "red",
    });
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <UModal v-model="isOpen">
    <UCard
      :ui="{ ring: 'ring-1 ring-gray-200', divide: 'divide-y divide-gray-100' }"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-plus-circle" class="w-5 h-5 text-gray-600" />
          <span class="font-semibold text-gray-900">新增音檔</span>
        </div>
      </template>

      <div class="space-y-4">
        <!-- 作者選擇 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >選擇作者</label
          >
          <USelectMenu
            v-model="selectedAuthorId"
            :options="authors || []"
            value-attribute="id"
            option-attribute="name"
            placeholder="選擇作者..."
            searchable
            searchable-placeholder="搜尋作者..."
          >
            <template #leading>
              <UIcon name="i-heroicons-user" class="w-4 h-4 text-gray-400" />
            </template>
          </USelectMenu>
        </div>

        <!-- 來源類型選擇 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >來源類型</label
          >
          <div class="flex gap-2">
            <UButton
              :color="sourceType === 'youtube' ? 'black' : 'gray'"
              :variant="sourceType === 'youtube' ? 'solid' : 'outline'"
              icon="i-heroicons-play-circle"
              @click="sourceType = 'youtube'"
            >
              YouTube
            </UButton>
            <UButton
              :color="sourceType === 'upload' ? 'black' : 'gray'"
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
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >YouTube 連結</label
          >
          <UInput
            v-model="youtubeUrl"
            placeholder="https://www.youtube.com/watch?v=..."
            icon="i-heroicons-link"
          />
        </div>

        <!-- 手動輸入 YouTube 描述（選填） -->
        <div v-if="sourceType === 'youtube'">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            影片描述（選填）
            <span class="text-gray-400 font-normal">- 可手動貼上，或留空自動抓取</span>
          </label>
          <UTextarea
            v-model="manualDescription"
            placeholder="貼上 YouTube 影片描述，此內容會原封不動放在貼文開頭..."
            :rows="4"
          />
        </div>

        <!-- 檔案上傳 -->
        <div v-if="sourceType === 'upload'">
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >選擇音檔</label
          >
          <div
            class="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors"
            :class="[
              isDragging ? 'border-primary-500 bg-primary-50' : '',
              file ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400',
            ]"
            @click="fileInput?.click()"
            @dragover.prevent="handleDragOver"
            @dragenter.prevent="handleDragOver"
            @dragleave="handleDragLeave"
            @drop.prevent="handleDrop"
          >
            <input
              ref="fileInput"
              type="file"
              accept="audio/*"
              class="hidden"
              @change="handleFileChange"
            />
            <UIcon
              :name="
                file ? 'i-heroicons-check-circle' : 'i-heroicons-arrow-up-tray'
              "
              class="w-8 h-8 mx-auto mb-2"
              :class="file ? 'text-gray-900' : 'text-gray-400'"
            />
            <p v-if="file" class="text-sm text-gray-900">
              {{ file.name }}
              <span class="text-gray-500"
                >({{ formatFileSize(file.size) }})</span
              >
            </p>
            <p v-else class="text-sm text-gray-500">
              拖曳音檔到此處，或點擊選擇（最大 200MB）
            </p>
          </div>

          <!-- 上傳進度條 -->
          <div v-if="isUploading" class="mt-3">
            <div class="flex justify-between text-sm text-gray-600 mb-1">
              <span>上傳中...</span>
              <span>{{ progress.percentage }}%</span>
            </div>
            <UProgress :value="progress.percentage" />
          </div>

          <!-- 上傳錯誤 -->
          <p v-if="uploadError" class="mt-2 text-sm text-red-500">
            {{ uploadError }}
          </p>
        </div>

        <!-- 標題 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2"
            >標題（選填）</label
          >
          <UInput
            v-model="title"
            placeholder="輸入標題..."
            icon="i-heroicons-pencil"
          />
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="gray"
            variant="ghost"
            :disabled="isUploading"
            @click="isOpen = false"
          >
            取消
          </UButton>
          <UButton
            color="black"
            :loading="isSubmitting || isUploading"
            :disabled="isUploading"
            @click="submit"
          >
            {{ isUploading ? `上傳中 ${progress.percentage}%` : "建立" }}
          </UButton>
        </div>
      </template>
    </UCard>
  </UModal>

  <!-- 觸發按鈕（當沒有 v-model 時使用） -->
  <UButton
    v-if="!$attrs.modelValue"
    icon="i-heroicons-plus"
    color="black"
    class="mb-4 ps-3"
    @click="isOpen = true"
  >
    新增音檔
  </UButton>
</template>
