<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import type { Student } from '../types';
import { eventLabel, relativeTime } from '../services/labels';
import { useI18n } from '../services/i18n';
defineProps<{ students: Student[]; examId: string }>();
const router = useRouter(),
  now = ref(Date.now());
const { language, t } = useI18n();
const timer = setInterval(() => {
  now.value = Date.now();
}, 1000); // Local labels only; no HTTP polling.
onUnmounted(() => clearInterval(timer));
const highEvents = new Set([
  'TAB_CHANGED',
  'GOOGLE_LENS_ATTEMPT',
  'BROWSER_UI_ATTEMPT',
  'CHROME_FOCUS_LOST',
  'DESKTOP_GUARD_DISCONNECTED',
  'STUDENT_DISCONNECTED',
]);
const rowClass = (student: Student) =>
  highEvents.has(student.last_event || '') ? 'student-cheating' : '';
</script>
<template>
  <DataTable
    :value="students"
    data-key="id"
    row-hover
    class="students-table"
    :row-class="rowClass"
    @row-click="router.push(`/exam/${examId}/student/${$event.data.id}`)"
  >
    <template #empty
      ><div class="table-empty">
        <i class="pi pi-users" />
        <h3>{{ t('waitingStudents') }}</h3>
        <p>{{ t('waitingStudentsHelp') }}</p>
      </div></template
    >
    <Column field="student_name" :header="t('student')" sortable
      ><template #body="{ data }"
        ><RouterLink class="student-cell" :to="`/exam/${examId}/student/${data.id}`"
          ><span class="avatar">{{ data.student_name.slice(0, 2).toUpperCase() }}</span
          ><strong>{{ data.student_name }}</strong></RouterLink
        ></template
      ></Column
    >
    <Column field="connected" :header="t('status')" sortable
      ><template #body="{ data }"
        ><span class="status" :class="data.connected ? 'online' : 'offline'"
          ><span />{{ data.connected ? t('online') : t('offline') }}</span
        ><small class="sub-status">{{
          data.active ? t('monitoring') : data.ready ? t('ready') : t('notReady')
        }}</small></template
      ></Column
    >
    <Column field="violations_count" :header="t('violations')" sortable />
    <Column :header="t('lastEvent')"
      ><template #body="{ data }"
        ><span :class="{ muted: !data.last_event }">{{
          data.last_event ? eventLabel(data.last_event, language) : t('noEventsShort')
        }}</span></template
      ></Column
    >
    <Column field="last_seen" :header="t('lastSeen')" sortable
      ><template #body="{ data }"
        ><span class="muted">{{ relativeTime(data.last_seen, now, language) }}</span></template
      ></Column
    >
  </DataTable>
</template>
