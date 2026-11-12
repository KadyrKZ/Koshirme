<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import { useExams } from '../stores/exams';
import { eventDetail, eventLabel } from '../services/labels';
import { useI18n } from '../services/i18n';
import ScreenshotDialog from '../components/ScreenshotDialog.vue';
const route = useRoute(),
  store = useExams(),
  screenshot = ref<string | null>(null),
  captureBusy = ref(false),
  captureError = ref('');
const { language, t } = useI18n();
const id = computed(() => String(route.params.studentId));
const student = computed(() => store.students.find((s) => s.id === id.value));
onMounted(() => {
  store.watchExam(String(route.params.examId));
  void store.fetchEvents(id.value);
});
watch(id, (value) => store.fetchEvents(value));
async function requestScreenshot() {
  captureBusy.value = true;
  captureError.value = '';
  try {
    await store.requestScreenshot(id.value);
  } catch (error) {
    captureError.value = String(error);
  } finally {
    captureBusy.value = false;
  }
}
function captureReason(reason: unknown) {
  if (reason === 'rate_limited') return t('captureRateLimited');
  if (reason === 'desktop_disconnected') return t('captureDesktopDisconnected');
  if (reason === 'permission_denied') return t('capturePermissionDenied');
  if (reason === 'upload_failed') return t('captureUploadFailed');
  if (reason === 'lease_expired') return t('captureConnectionExpired');
  return t('captureFailed');
}
</script>
<template>
  <RouterLink :to="`/exam/${route.params.examId}`" class="back-link"
    ><i class="pi pi-arrow-left" /> {{ store.exam?.title || t('allRooms') }}</RouterLink
  >
  <div v-if="store.error" class="alert" role="alert">{{ store.error }}</div>
  <div class="page-heading">
    <div>
      <div class="eyebrow">{{ t('studentSession') }}</div>
      <h1>{{ student?.student_name || t('student') }}</h1>
      <p>{{ t('timelineHelp') }}</p>
    </div>
    <div v-if="student" class="student-summary">
      <span class="status" :class="student.connected ? 'online' : 'offline'"
        ><span />{{ student.connected ? t('online') : t('offline') }}</span
      ><strong>{{ student.violations_count }} {{ t('violations') }}</strong>
      <Button
        :label="t('takeScreenshot')"
        icon="pi pi-camera"
        :loading="captureBusy"
        :disabled="!student.connected || !student.active"
        @click="requestScreenshot"
      />
    </div>
  </div>
  <p v-if="captureError" class="error" role="alert">{{ captureError }}</p>
  <section class="panel timeline-panel">
    <div class="panel-heading">
      <h2>{{ t('activityTimeline') }}</h2>
      <span class="muted">{{ student?.violations_count || 0 }} {{ t('violations') }}</span>
    </div>
    <div v-if="!store.events.length" class="table-empty">
      <i class="pi pi-check-circle" />
      <h3>{{ t('noEvents') }}</h3>
      <p>{{ t('noEventsHelp') }}</p>
    </div>
    <article v-for="event in store.events" :key="event.id" class="timeline-item">
      <div class="event-time">
        <time>{{ new Date(event.timestamp).toLocaleTimeString() }}</time
        ><small>{{ new Date(event.timestamp).toLocaleDateString() }}</small>
      </div>
      <div class="timeline-marker" :class="event.severity" />
      <div class="event-detail">
        <div class="event-title">
          <h3>{{ eventLabel(event.event_type, language) }}</h3>
          <span class="severity" :class="event.severity">{{ event.severity }}</span>
        </div>
        <code class="event-type">{{ event.event_type }}</code>
        <p v-if="eventDetail(event.event_type, language)" class="event-context">
          {{ eventDetail(event.event_type, language) }}
        </p>
        <p v-if="event.current_url" class="current-url">
          {{ t('currentUrl') }}: <span>{{ event.current_url }}</span>
        </p>
        <Button
          v-if="event.screenshot_path"
          :label="t('viewScreenshot')"
          icon="pi pi-image"
          size="small"
          outlined
          @click="screenshot = event.screenshot_path"
        />
        <p v-else-if="event.metadata.capture_status" class="capture-note">
          <i class="pi pi-image" />{{
            event.metadata.capture_status === 'pending'
              ? t('screenshotPending')
              : `${t('screenshotUnavailable')}${event.metadata.capture_reason ? ` · ${captureReason(event.metadata.capture_reason)}` : ''}`
          }}
        </p>
      </div>
    </article>
    <div v-if="store.moreEvents" class="load-more">
      <Button :label="t('loadOlder')" outlined @click="store.fetchEvents(id, true)" />
    </div>
  </section>
  <ScreenshotDialog :filename="screenshot" @close="screenshot = null" />
</template>
