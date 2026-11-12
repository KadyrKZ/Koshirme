<script setup lang="ts">
import { normalizeAllowedUrl } from '@koshirme/protocol';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import type { Exam } from '../types';
import { api } from '../services/api';
import { useExams } from '../stores/exams';
import { useI18n } from '../services/i18n';
const store = useExams(),
  router = useRouter();
const { t } = useI18n();
const URL = globalThis.URL;
const createVisible = ref(false),
  title = ref(''),
  contestValues = ref(['', '', '']),
  startTime = ref(''),
  error = ref(''),
  saving = ref(false),
  deleteTarget = ref<Exam | null>(null),
  deleting = ref(false);
onMounted(() => store.fetchExams());
function allowedUrl(value: string) {
  const url = normalizeAllowedUrl(value);
  if (!url) throw new Error(t('httpsUrlError'));
  return url;
}
function openCreate() {
  title.value = '';
  contestValues.value = ['', '', ''];
  startTime.value = '';
  error.value = '';
  createVisible.value = true;
}
async function create() {
  saving.value = true;
  error.value = '';
  try {
    const exam = await api<Exam>('/api/exams', {
      method: 'POST',
      body: JSON.stringify({
        title: title.value,
        allowed_urls: contestValues.value.filter((value) => value.trim()).map(allowedUrl),
        start_time: startTime.value ? new Date(startTime.value).toISOString() : null,
      }),
    });
    await router.push(`/exam/${exam.id}`);
  } catch (e) {
    error.value = String(e);
  } finally {
    saving.value = false;
  }
}
async function removeRoom() {
  if (!deleteTarget.value) return;
  deleting.value = true;
  error.value = '';
  try {
    await store.deleteRoom(deleteTarget.value.id);
    deleteTarget.value = null;
  } catch (e) {
    error.value = String(e);
  } finally {
    deleting.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">{{ t('roomManagement') }}</div>
      <h1>{{ t('examRooms') }}</h1>
      <p>{{ t('roomsHelp') }}</p>
      <a
        class="create-contest-link"
        href="https://fizmat.win"
        target="_blank"
        rel="noopener noreferrer"
      >
        <i class="pi pi-external-link" /> {{ t('createContestHere') }}
      </a>
    </div>
    <Button :label="t('createRoom')" icon="pi pi-plus" @click="openCreate" />
  </div>
  <div v-if="store.error" class="alert" role="alert">
    {{ store.error }} <Button :label="t('retry')" text @click="store.fetchExams" />
  </div>
  <div v-if="error && !createVisible" class="alert" role="alert">{{ error }}</div>
  <p v-if="store.loading" class="muted">{{ t('loadingRooms') }}</p>
  <div v-else-if="!store.exams.length && !store.error" class="empty-state panel">
    <i class="pi pi-book" />
    <h2>{{ t('firstRoom') }}</h2>
    <p>{{ t('firstRoomHelp') }}</p>
    <Button :label="t('createRoom')" @click="openCreate" />
  </div>
  <div v-else class="exam-grid">
    <RouterLink
      v-for="exam in store.exams"
      :key="exam.id"
      :to="`/exam/${exam.id}`"
      class="exam-card"
      ><div class="card-top">
        <span class="card-icon"><i class="pi pi-code" /></span
        ><span class="card-actions"
          ><span class="pill" :class="exam.active ? 'active' : ''">{{
            exam.active
              ? t('live')
              : exam.paused
                ? t('paused')
                : exam.finished_at
                  ? t('finished')
                  : t('readyToStart')
          }}</span
          ><Button
            class="card-delete"
            icon="pi pi-trash"
            severity="danger"
            text
            rounded
            :aria-label="t('deleteRoom')"
            :disabled="exam.active"
            @click.prevent.stop="deleteTarget = exam"
        /></span>
      </div>
      <h2>{{ exam.title }}</h2>
      <p v-for="url in exam.allowed_urls" :key="url" class="exam-url">
        {{ new URL(url).host }}{{ new URL(url).pathname }}
      </p>
      <div class="card-bottom">
        <div>
          <span class="small-label">{{ t('roomCode') }}</span
          ><code>{{ exam.join_code }}</code>
        </div>
        <i class="pi pi-arrow-up-right" /></div
    ></RouterLink>
  </div>
  <Dialog
    v-model:visible="createVisible"
    modal
    :header="t('createRoomTitle')"
    :style="{ width: '520px' }"
    ><form class="form-stack" @submit.prevent="create">
      <label for="exam-title">{{ t('examTitle') }}</label
      ><InputText id="exam-title" v-model="title" required maxlength="200" />
      <template v-for="index in [0, 1, 2]" :key="index">
        <label :for="`allowed-url-${index}`"
          >{{ t('contestLink') }} {{ index + 1 }}
          <span v-if="index > 0" class="muted">({{ t('optional') }})</span>
        </label>
        <InputText
          :id="`allowed-url-${index}`"
          v-model="contestValues[index]"
          placeholder="https://…"
          type="url"
          :required="index === 0"
          maxlength="2048"
        />
      </template>
      <a
        class="create-contest-link"
        href="https://fizmat.win"
        target="_blank"
        rel="noopener noreferrer"
      >
        <i class="pi pi-external-link" /> {{ t('createContestHere') }}
      </a>
      <label for="start-time"
        >{{ t('plannedStart') }} <span class="muted">({{ t('optional') }})</span></label
      >
      <InputText id="start-time" v-model="startTime" type="datetime-local" />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <Button :label="t('createRoom')" type="submit" :loading="saving" /></form
  ></Dialog>
  <Dialog
    :visible="!!deleteTarget"
    modal
    :header="t('deleteQuestion')"
    :style="{ width: '460px' }"
    @update:visible="!$event && (deleteTarget = null)"
  >
    <p>{{ t('deleteWarning') }}</p>
    <template #footer>
      <Button :label="t('cancel')" text @click="deleteTarget = null" />
      <Button :label="t('deleteRoom')" severity="danger" :loading="deleting" @click="removeRoom" />
    </template>
  </Dialog>
</template>
