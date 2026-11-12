import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { websocketUrl } from '@koshirme/protocol';
import type { AdminMessage, Exam, Student, ViolationEvent } from '../types';
import { API_URL, api, getToken, embedded } from '../services/api';

export const useExams = defineStore('exams', () => {
  const exams = ref<Exam[]>([]),
    exam = ref<Exam | null>(null),
    students = ref<Student[]>([]);
  const events = ref<ViolationEvent[]>([]),
    live = ref(false),
    error = ref(''),
    loading = ref(false);
  const selectedStudent = ref<string | null>(null),
    moreEvents = ref(false);
  let socket: WebSocket | null = null,
    retry: ReturnType<typeof setTimeout> | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;
  let watchedId: string | null = null,
    attempt = 0,
    generation = 0,
    dataEpoch = 0;
  let onHigh: (event: ViolationEvent, student: Student) => void = () => {};
  const online = computed(() => students.value.filter((s) => s.connected).length);
  function setHighHandler(handler: typeof onHigh) {
    onHigh = handler;
  }
  async function fetchExams() {
    const epoch = dataEpoch;
    loading.value = true;
    error.value = '';
    try {
      const result = await api<Exam[]>('/api/exams');
      if (epoch === dataEpoch) exams.value = result;
    } catch (e) {
      if (epoch === dataEpoch) error.value = String(e);
    } finally {
      if (epoch === dataEpoch) loading.value = false;
    }
  }
  function upsertStudent(student: Student) {
    const i = students.value.findIndex((s) => s.id === student.id);
    if (i < 0) students.value.push(student);
    else students.value[i] = student;
  }
  function mergeEvents(incoming: ViolationEvent[]) {
    const byId = new Map(events.value.map((event) => [event.id, event]));
    for (const event of incoming) {
      const existing = byId.get(event.id);
      byId.set(event.id, existing?.screenshot_path && !event.screenshot_path ? existing : event);
    }
    events.value = [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  async function fetchEvents(id: string, older = false) {
    const epoch = dataEpoch;
    if (selectedStudent.value !== id) {
      selectedStudent.value = id;
      events.value = [];
    }
    const cursor = older ? events.value.at(-1)?.id : undefined;
    try {
      const result = await api<ViolationEvent[]>(
        `/api/students/${id}/events?limit=200${cursor ? `&before=${cursor}` : ''}`,
      );
      if (epoch === dataEpoch && selectedStudent.value === id) {
        mergeEvents(result);
        moreEvents.value = result.length === 200;
      }
    } catch (e) {
      error.value = String(e);
    }
  }
  function disconnect() {
    generation++;
    watchedId = null;
    live.value = false;
    if (retry) clearTimeout(retry);
    if (ping) clearInterval(ping);
    retry = null;
    ping = null;
    socket?.close();
    socket = null;
  }
  function reset() {
    dataEpoch++;
    disconnect();
    exams.value = [];
    exam.value = null;
    students.value = [];
    events.value = [];
    selectedStudent.value = null;
    moreEvents.value = false;
    error.value = '';
    loading.value = false;
  }
  function watchExam(id: string) {
    if (watchedId === id) return;
    disconnect();
    watchedId = id;
    exam.value = null;
    students.value = [];
    events.value = [];
    selectedStudent.value = null;
    error.value = '';
    attempt = 0;
    moreEvents.value = false;
    const epoch = generation;
    function connect() {
      if (epoch !== generation) return;
      const ws = new WebSocket(
        websocketUrl(API_URL, `${embedded ? '/koshirme' : ''}/ws/admin/${id}`),
      );
      socket = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token: getToken() }));
        ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
        }, 15000);
      };
      ws.onmessage = (message) => {
        if (epoch !== generation) return;
        const data = JSON.parse(String(message.data)) as AdminMessage;
        switch (data.type) {
          case 'snapshot':
            exam.value = data.exam;
            students.value = data.students;
            live.value = true;
            attempt = 0;
            error.value = '';
            if (selectedStudent.value) void fetchEvents(selectedStudent.value);
            break;
          case 'student_updated':
            upsertStudent(data.student);
            break;
          case 'exam_updated':
            exam.value = data.exam;
            break;
          case 'event_created':
          case 'screenshot_updated':
            upsertStudent(data.student);
            if (selectedStudent.value === data.event.student_session_id) mergeEvents([data.event]);
            if (data.type === 'event_created' && data.event.severity === 'high')
              onHigh(data.event, data.student);
            break;
        }
      };
      ws.onclose = (event) => {
        if (epoch !== generation) return;
        live.value = false;
        if (ping) clearInterval(ping);
        if (event.code === 4401 || event.code === 4404) {
          error.value =
            event.code === 4401 ? 'Your session expired. Sign in again.' : 'Room not found.';
          return;
        }
        error.value = 'Live connection lost. Reconnecting…';
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempt++, 10000));
      };
      ws.onerror = () => ws.close();
    }
    connect();
  }
  async function action(kind: 'start' | 'pause' | 'finish') {
    if (!exam.value) return;
    exam.value = await api<Exam>(`/api/exams/${exam.value.id}/${kind}`, { method: 'POST' });
  }
  async function deleteRoom(id: string) {
    await api<void>(`/api/exams/${id}`, { method: 'DELETE' });
    exams.value = exams.value.filter((item) => item.id !== id);
    if (exam.value?.id === id) exam.value = null;
    disconnect();
  }
  async function requestScreenshot(id: string) {
    const event = await api<ViolationEvent>(`/api/students/${id}/screenshot-request`, {
      method: 'POST',
    });
    if (selectedStudent.value === id) mergeEvents([event]);
  }
  return {
    exams,
    exam,
    students,
    events,
    live,
    error,
    loading,
    online,
    moreEvents,
    selectedStudent,
    fetchExams,
    watchExam,
    disconnect,
    reset,
    fetchEvents,
    action,
    deleteRoom,
    requestScreenshot,
    setHighHandler,
  };
});
