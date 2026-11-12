<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { api } from '../services/api';
import type { User } from '../types';
import { useI18n } from '../services/i18n';

const teachers = ref<User[]>([]),
  visible = ref(false),
  name = ref(''),
  email = ref(''),
  password = ref(''),
  error = ref(''),
  busy = ref(false);
const { t } = useI18n();
async function load() {
  try {
    teachers.value = await api<User[]>('/api/admin/teachers');
  } catch (reason) {
    error.value = String(reason);
  }
}
async function create() {
  busy.value = true;
  error.value = '';
  try {
    await api<User>('/api/admin/teachers', {
      method: 'POST',
      body: JSON.stringify({ name: name.value, email: email.value, password: password.value }),
    });
    visible.value = false;
    name.value = '';
    email.value = '';
    password.value = '';
    await load();
  } catch (reason) {
    error.value = String(reason);
  } finally {
    busy.value = false;
  }
}
async function setActive(teacher: User) {
  await api(`/api/admin/teachers/${teacher.id}/status`, {
    method: 'POST',
    body: JSON.stringify({ active: !teacher.active }),
  });
  await load();
}
onMounted(load);
</script>

<template>
  <div class="page-heading">
    <div>
      <div class="eyebrow">{{ t('administration') }}</div>
      <h1>{{ t('teacherAccounts') }}</h1>
      <p>{{ t('teachersHelp') }}</p>
    </div>
    <Button :label="t('createTeacher')" icon="pi pi-user-plus" @click="visible = true" />
  </div>
  <div v-if="error" class="alert" role="alert">{{ error }}</div>
  <section class="panel">
    <table class="student-table">
      <thead>
        <tr>
          <th>{{ t('teacher') }}</th>
          <th>Email</th>
          <th>{{ t('status') }}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="teacher in teachers" :key="teacher.id">
          <td>
            <strong>{{ teacher.name }}</strong>
          </td>
          <td>{{ teacher.email }}</td>
          <td>
            <span class="pill" :class="{ active: teacher.active }">{{
              teacher.active ? t('active') : t('disabled')
            }}</span>
          </td>
          <td>
            <Button
              :label="teacher.active ? t('disable') : t('enable')"
              text
              :severity="teacher.active ? 'danger' : 'success'"
              @click="setActive(teacher)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </section>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('createTeacherTitle')"
    :style="{ width: '500px' }"
  >
    <form class="form-stack" @submit.prevent="create">
      <label for="teacher-name">{{ t('name') }}</label
      ><InputText id="teacher-name" v-model="name" required maxlength="120" />
      <label for="teacher-email">Email</label
      ><InputText id="teacher-email" v-model="email" type="email" autocomplete="off" required />
      <label for="teacher-password">{{ t('temporaryPassword') }}</label
      ><InputText
        id="teacher-password"
        v-model="password"
        type="password"
        autocomplete="new-password"
        minlength="6"
        maxlength="128"
        required
      />
      <small>{{ t('passwordHelp') }}</small>
      <p v-if="error" class="error">{{ error }}</p>
      <Button type="submit" :label="t('createAccount')" :loading="busy" />
    </form>
  </Dialog>
</template>
