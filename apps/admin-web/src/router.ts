import { createRouter, createWebHistory } from 'vue-router';
export default createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/exams' },
    { path: '/exams', component: () => import('./views/ExamsView.vue') },
    { path: '/admin/teachers', component: () => import('./views/TeachersView.vue') },
    { path: '/exam/:id', component: () => import('./views/ExamView.vue') },
    {
      path: '/exam/:examId/student/:studentId',
      component: () => import('./views/StudentView.vue'),
    },
    { path: '/:pathMatch(.*)*', redirect: '/exams' },
  ],
});
