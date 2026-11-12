<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import { screenshotUrl } from '../services/api';
import { useI18n } from '../services/i18n';
const props = defineProps<{ filename: string | null }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const url = ref(''),
  error = ref(''),
  loading = ref(false);
let request = 0;
function release() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
}
watch(
  () => props.filename,
  async (filename) => {
    const current = ++request;
    release();
    error.value = '';
    if (!filename) return;
    loading.value = true;
    try {
      const result = await screenshotUrl(filename);
      if (current === request) url.value = result;
      else URL.revokeObjectURL(result);
    } catch (e) {
      if (current === request) error.value = String(e);
    } finally {
      if (current === request) loading.value = false;
    }
  },
);
onUnmounted(() => {
  request++;
  release();
});
</script>
<template>
  <Dialog
    :visible="!!filename"
    modal
    :header="t('screenshotTitle')"
    :style="{ width: 'min(1100px, 94vw)' }"
    @update:visible="emit('close')"
    ><div class="screenshot-frame">
      <ProgressSpinner v-if="loading" />
      <p v-else-if="error" class="error">{{ error }}</p>
      <img v-else-if="url" :src="url" :alt="t('screenshotTitle')" />
    </div>
    <p class="muted">
      {{ t('screenshotNote') }}
    </p></Dialog
  >
</template>
