import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import ToastService from 'primevue/toastservice';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import 'primeicons/primeicons.css';
import './style.css';
import App from './App.vue';
import router from './router';

const preset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#faf1f4',
      100: '#f4dee6',
      200: '#eab9ca',
      300: '#d78ba5',
      400: '#bb5b7d',
      500: '#9f3d5b',
      600: '#7f1d3a',
      700: '#66152f',
      800: '#4d1025',
      900: '#3a0c1d',
      950: '#240711',
    },
  },
});
createApp(App)
  .use(createPinia())
  .use(router)
  .use(PrimeVue, { theme: { preset, options: { darkModeSelector: false } } })
  .use(ToastService)
  .mount('#app');
