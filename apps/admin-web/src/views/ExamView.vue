<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { useToast } from 'primevue/usetoast';
import { useExams } from '../stores/exams';
import StudentTable from '../components/StudentTable.vue';
import { useI18n } from '../services/i18n';
const route = useRoute(),
  router = useRouter(),
  store = useExams(),
  finishVisible = ref(false),
  deleteVisible = ref(false),
  actionError = ref(''),
  busy = ref(false);
const { t } = useI18n();
const toast = useToast();
const readyStudents = computed(() => store.students.filter((s) => s.ready && s.connected).length);
async function copyCode() {
  if (!store.exam) return;
  try {
    await navigator.clipboard.writeText(store.exam.join_code);
    toast.add({ severity: 'success', summary: t('codeCopied'), life: 2500 });
  } catch (e) {
    actionError.value = String(e);
  }
}
onMounted(() => store.watchExam(String(route.params.id)));
const violations = computed(() => store.students.reduce((sum, s) => sum + s.violations_count, 0));
async function action(kind: 'start' | 'pause' | 'finish') {
  busy.value = true;
  actionError.value = '';
  try {
    await store.action(kind);
    finishVisible.value = false;
  } catch (e) {
    actionError.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function removeRoom() {
  if (!store.exam) return;
  busy.value = true;
  actionError.value = '';
  try {
    await store.deleteRoom(store.exam.id);
    await router.push('/exams');
  } catch (e) {
    actionError.value = String(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <RouterLink to="/exams" class="back-link"
    ><i class="pi pi-arrow-left" /> {{ t('allRooms') }}</RouterLink
  >
  <div v-if="store.error" class="alert" role="alert">{{ store.error }}</div>
  <p v-if="!store.exam" class="muted">{{ t('reconnecting') }}</p>
  <template v-else>
    <div class="page-heading">
      <div>
        <div class="eyebrow">
          <span class="live-dot" :class="{ connected: store.live }" />{{
            store.live ? t('liveConnection') : t('reconnecting')
          }}
        </div>
        <h1>{{ store.exam.title }}</h1>
        <p>
          {{ store.online }} / {{ store.students.length }} {{ t('studentsOnline') }}
          <span class="dot-separator">·</span>
          {{
            store.exam.active
              ? t('examInProgress')
              : store.exam.paused
                ? t('examPaused')
                : store.exam.finished_at
                  ? t('examFinished')
                  : t('waitingToStart')
          }}
        </p>
      </div>
      <div class="heading-actions">
        <Button
          v-if="!store.exam.active && !store.exam.finished_at"
          :label="store.exam.paused ? t('resumeMonitoring') : t('startMonitoring')"
          icon="pi pi-play"
          :loading="busy"
          @click="action('start')"
        /><Button
          v-if="store.exam.active"
          :label="t('pauseMonitoring')"
          severity="warn"
          outlined
          icon="pi pi-pause"
          :loading="busy"
          @click="action('pause')"
        /><Button
          v-if="store.exam.active || store.exam.paused"
          :label="t('finishRoom')"
          severity="secondary"
          outlined
          icon="pi pi-stop"
          @click="finishVisible = true"
        />
        <Button
          v-if="!store.exam.active"
          :label="t('deleteRoom')"
          severity="danger"
          text
          icon="pi pi-trash"
          @click="deleteVisible = true"
        />
      </div>
    </div>
    <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
    <div class="session-strip">
      <div>
        <span class="small-label">{{ t('roomCode') }}</span>
        <div class="code-row">
          <code>{{ store.exam.join_code }}</code
          ><Button
            icon="pi pi-copy"
            text
            severity="secondary"
            :aria-label="t('copyCode')"
            @click="copyCode"
          />
        </div>
      </div>
      <div class="allowed-site">
        <i class="pi pi-link" /><span>
          <span v-for="url in store.exam.allowed_urls" :key="url" class="allowed-url-item">{{
            url
          }}</span>
        </span>
      </div>
      <span class="pill" :class="{ active: store.exam.active }">{{
        store.exam.active
          ? t('monitoringEnabled')
          : store.exam.paused
            ? t('monitoringPaused')
            : t('monitoringStopped')
      }}</span>
    </div>
    <div class="stats">
      <div class="stat">
        <span>{{ t('studentsOnline') }}</span
        ><strong
          >{{ store.online }}<small>/ {{ store.students.length }}</small></strong
        >
      </div>
      <div class="stat">
        <span>{{ t('ready') }}</span
        ><strong
          >{{ readyStudents }}<small>/ {{ store.students.length }}</small></strong
        >
      </div>
      <div class="stat">
        <span>{{ t('eventsReview') }}</span
        ><strong>{{ violations }}</strong>
      </div>
    </div>
    <section class="panel">
      <div class="panel-heading">
        <h2>{{ t('students') }}</h2>
      </div>
      <StudentTable :students="store.students" :exam-id="store.exam.id" />
    </section>
  </template>
  <Dialog
    v-model:visible="finishVisible"
    modal
    :header="t('finishQuestion')"
    :style="{ width: '440px' }"
    ><p>{{ t('finishWarning') }}</p>
    <template #footer
      ><Button :label="t('cancel')" text @click="finishVisible = false" /><Button
        :label="t('finishRoom')"
        severity="danger"
        :loading="busy"
        @click="action('finish')" /></template
  ></Dialog>
  <Dialog
    v-model:visible="deleteVisible"
    modal
    :header="t('deleteQuestion')"
    :style="{ width: '460px' }"
  >
    <p>{{ t('deleteWarning') }}</p>
    <template #footer>
      <Button :label="t('cancel')" text @click="deleteVisible = false" />
      <Button :label="t('deleteRoom')" severity="danger" :loading="busy" @click="removeRoom" />
    </template>
  </Dialog>
</template>
