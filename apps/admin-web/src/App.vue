<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Toast from 'primevue/toast';
import { useToast } from 'primevue/usetoast';
import { api, getToken, setToken, embedded } from './services/api';
import { eventLabel } from './services/labels';
import { useI18n } from './services/i18n';
import { useExams } from './stores/exams';
import type { LoginResponse, User } from './types';
const route = useRoute(),
  store = useExams(),
  toast = useToast();
const { language, setLanguage, t } = useI18n();
const access = ref(!embedded && !getToken()),
  email = ref(''),
  password = ref(''),
  user = ref<User | null>(null),
  accessError = ref(''),
  busy = ref(false),
  ready = ref(false);
const passwordDialog = ref(false),
  currentPassword = ref(''),
  newPassword = ref(''),
  confirmPassword = ref(''),
  passwordError = ref(''),
  passwordBusy = ref(false);
store.setHighHandler((event, student) =>
  toast.add({
    severity: 'error',
    summary: t('violationDetected'),
    detail: `${student.student_name}: ${eventLabel(event.event_type, language.value)}`,
    life: 7000,
  }),
);
watch(
  () => route.path,
  () => {
    if (route.path === '/exams') store.disconnect();
  },
);
onMounted(async () => {
  if (embedded) {
    access.value = false;
    try {
      const response = await fetch('/api/koshirme/session', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('KOSH!RME connection unavailable');
      const result: LoginResponse = await response.json();
      setToken(result.token);
      user.value = result.user;
      ready.value = true;
    } catch (error) {
      accessError.value = String(error);
    }
    return;
  }
  if (!getToken()) return;
  try {
    user.value = await api<User>('/api/auth/me');
    ready.value = true;
    access.value = false;
  } catch {
    setToken('');
    access.value = true;
  }
});
async function signIn() {
  busy.value = true;
  accessError.value = '';
  try {
    const result = await api<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email.value.trim(), password: password.value }),
    });
    setToken(result.token);
    user.value = result.user;
    password.value = '';
    access.value = false;
    ready.value = true;
    store.reset();
    await store.fetchExams();
    const id = String(route.params.id || route.params.examId || '');
    if (id) store.watchExam(id);
    if (route.params.studentId) void store.fetchEvents(String(route.params.studentId));
  } catch (e) {
    setToken('');
    accessError.value = String(e);
  } finally {
    busy.value = false;
  }
}
async function signOut() {
  if (embedded) {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    setToken('');
    window.top!.location.href = '/';
    return;
  }
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  setToken('');
  user.value = null;
  ready.value = false;
  store.reset();
  access.value = true;
}
async function changePassword() {
  passwordError.value = '';
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = t('passwordsMismatch');
    return;
  }
  passwordBusy.value = true;
  try {
    if (embedded) {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          currentPassword: currentPassword.value,
          password: newPassword.value,
        }),
      });
      if (!response.ok) throw new Error('Unable to change password; check the current password');
      const renewed = await fetch('/api/koshirme/session', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!renewed.ok) throw new Error('Please reopen the KOSH!RME section');
      const session: LoginResponse = await renewed.json();
      setToken(session.token);
      store.reset();
      const id = String(route.params.id || route.params.examId || '');
      if (id) store.watchExam(id);
      else await store.fetchExams();
    } else {
      await api('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword.value,
          new_password: newPassword.value,
        }),
      });
    }
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
    passwordDialog.value = false;
    toast.add({ severity: 'success', summary: t('passwordUpdated'), life: 4000 });
  } catch (e) {
    passwordError.value = String(e);
  } finally {
    passwordBusy.value = false;
  }
}
</script>
<template>
  <Toast position="top-right" />
  <div class="shell" :class="{ embedded }">
    <aside v-if="!embedded" class="sidebar">
      <RouterLink to="/exams" class="brand"
        ><span class="brand-icon"><i class="pi pi-shield" /></span>KOSH!RME</RouterLink
      >
      <div class="workspace-label">{{ t('workspace') }}</div>
      <RouterLink to="/exams" class="nav-item"
        ><i class="pi pi-th-large" /> {{ t('rooms') }}</RouterLink
      >
      <RouterLink v-if="user?.role === 'admin'" to="/admin/teachers" class="nav-item"
        ><i class="pi pi-users" /> {{ t('teachers') }}</RouterLink
      >
      <div class="sidebar-downloads">
        <a target="_blank" rel="noopener" class="brand-domain" href="https://koshirme.stream"
          >koshirme.stream</a
        >
        <a
          target="_blank"
          rel="noopener"
          class="brand-domain"
          href="https://koshirme.stream/guide.html"
          >Инструкция · Нұсқаулық</a
        >
        <a
          class="brand-domain"
          href="https://chromewebstore.google.com/detail/mcfibeppldfkaahnjdpbcfpbncemolnp"
          >Chrome · Көшірме</a
        >
        <a
          target="_blank"
          rel="noopener"
          class="brand-domain"
          href="https://koshirme.stream/windows-build.html"
          >Windows · сборка 0.1.6</a
        >
        <a
          target="_blank"
          rel="noopener"
          class="brand-domain"
          href="https://koshirme.stream/downloads/KOSHIRME-0.1.6-Windows-source.zip"
          >Windows · исходники 0.1.6</a
        >
        <a
          target="_blank"
          rel="noopener"
          class="brand-domain"
          href="https://koshirme.stream/downloads/KOSHIRME-0.1.7-arm64.dmg"
          >macOS · Apple Silicon 0.1.7</a
        >
      </div>
    </aside>
    <div class="main-shell">
      <header v-if="!embedded" class="topbar">
        <span>{{ t('contestMonitoring') }}</span>
        <select
          :aria-label="t('language')"
          :value="language"
          class="language-select"
          @change="setLanguage(($event.target as HTMLSelectElement).value as 'ru' | 'en' | 'kz')"
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="kz">Қазақша</option>
        </select>
        <div v-if="user" class="heading-actions">
          <span
            >{{ user.name }} · {{ t(user.role === 'admin' ? 'administration' : 'teacher') }}</span
          >
          <Button
            :label="t('password')"
            icon="pi pi-key"
            text
            severity="secondary"
            @click="passwordDialog = true"
          />
          <Button
            :label="t('signOut')"
            icon="pi pi-sign-out"
            text
            severity="secondary"
            @click="signOut"
          />
        </div>
      </header>
      <main>
        <RouterView
          v-if="ready"
          :key="String(route.params.id || route.params.examId || route.name || route.path)"
        />
        <div v-else class="empty-state">
          <i class="pi pi-shield" />
          <h1>{{ t('welcome') }}</h1>
          <p>{{ t('signInHelp') }}</p>
          <Button :label="t('signIn')" @click="access = true" />
        </div>
      </main>
      <footer>
        <span>KOSH!RME · koshirme.stream</span><small class="signature">by Mr. Kadyr</small>
      </footer>
    </div>
  </div>
  <Dialog
    v-if="!embedded"
    v-model:visible="access"
    modal
    :header="t('signInTitle')"
    :closable="ready"
    :style="{ width: '440px' }"
  >
    <form class="form-stack" @submit.prevent="signIn">
      <p>{{ t('accountHelp') }}</p>
      <label for="login-email">{{ t('nameOrEmail') }}</label>
      <InputText id="login-email" v-model="email" autocomplete="username" required />
      <label for="login-password">{{ t('password') }}</label>
      <Password
        input-id="login-password"
        v-model="password"
        autocomplete="current-password"
        toggle-mask
        :feedback="false"
        fluid
        required
        minlength="4"
      />
      <p v-if="accessError" class="error" role="alert">{{ accessError }}</p>
      <Button type="submit" :label="t('signIn')" :loading="busy" />
    </form>
  </Dialog>
  <Dialog
    v-model:visible="passwordDialog"
    modal
    :header="t('changePassword')"
    :style="{ width: '440px' }"
  >
    <form class="form-stack" @submit.prevent="changePassword">
      <label for="current-password">{{ t('currentPassword') }}</label>
      <InputText
        id="current-password"
        v-model="currentPassword"
        type="password"
        autocomplete="current-password"
        required
        minlength="4"
      />
      <label for="new-password">{{ t('newPassword') }}</label>
      <InputText
        id="new-password"
        v-model="newPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
      />
      <label for="confirm-password">{{ t('confirmPassword') }}</label>
      <InputText
        id="confirm-password"
        v-model="confirmPassword"
        type="password"
        autocomplete="new-password"
        required
        minlength="6"
      />
      <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
      <Button type="submit" :label="t('changePassword')" :loading="passwordBusy" />
    </form>
  </Dialog>
</template>

<style scoped>
.shell.embedded .main-shell { margin-left: 0; width: 100%; }
</style>
