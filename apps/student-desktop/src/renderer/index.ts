import type { GuardAPI } from '../types';
declare global {
  interface Window {
    examguard: GuardAPI;
  }
}
import type { DesktopState } from '../types';
const copy = {
  ru: {
    waiting: 'Ожидаем контест',
    active: 'Мониторинг включён',
    paused: 'Контест приостановлен',
    ended: 'Контест завершён',
    connecting: 'Подключение к контесту',
    help: 'Войдите в fizmat.win и откройте свой контест. Подключение приложения и расширения выполняется автоматически.',
    start: 'Вернитесь на fizmat.win и нажмите «Начать контест». Копировать коды не нужно.',
    notice:
      'Перед началом сохраните работу: остальные приложения будут закрыты. Закрытие Коширме или отключение расширения завершит вашу попытку.',
    backend: 'Сервер',
    extension: 'Расширение Chrome',
    screen: 'Запись экрана',
    yes: 'Подключено',
    no: 'Ожидание',
    permission: 'Разрешить запись экрана',
  },
  kz: {
    waiting: 'Контест күтілуде',
    active: 'Мониторинг қосулы',
    paused: 'Контест уақытша тоқтатылды',
    ended: 'Контест аяқталды',
    connecting: 'Контестке қосылу',
    help: 'fizmat.win сайтына кіріп, өз контестіңізді ашыңыз. Қолданба мен кеңейтім автоматты қосылады.',
    start: 'fizmat.win бетіне оралып, «Контестті бастау» түймесін басыңыз. Код көшіру қажет емес.',
    notice:
      'Бастамас бұрын жұмысыңызды сақтаңыз: басқа қолданбалар жабылады. Көшірме не кеңейтім жабылса, әрекетіңіз аяқталады.',
    backend: 'Сервер',
    extension: 'Chrome кеңейтімі',
    screen: 'Экран жазу',
    yes: 'Қосылды',
    no: 'Күту',
    permission: 'Экран жазуға рұқсат беру',
  },
  en: {
    waiting: 'Waiting for a contest',
    active: 'Monitoring is active',
    paused: 'Contest paused',
    ended: 'Contest finished',
    connecting: 'Connecting to the contest',
    help: 'Sign in to fizmat.win and open your contest. The app and extension connect automatically.',
    start: 'Return to fizmat.win and click Start contest. No codes to copy.',
    notice:
      'Save your work before starting: other apps will close. Closing Koshirme or disabling the extension ends your attempt.',
    backend: 'Server',
    extension: 'Chrome extension',
    screen: 'Screen recording',
    yes: 'Connected',
    no: 'Waiting',
    permission: 'Allow screen recording',
  },
};
let language: keyof typeof copy = 'ru',
  current: DesktopState | null = null;
const el = (id: string) => document.getElementById(id)!;
function render(s: DesktopState) {
  current = s;
  const t = copy[language];
  el('mode').textContent = 'KOSH!RME';
  el('title').textContent =
    s.exam?.finished_at || s.session?.finished_at
      ? t.ended
      : s.exam?.paused
        ? t.paused
        : s.monitoring
          ? t.active
          : s.starting
            ? t.connecting
            : t.waiting;
  el('description').textContent = s.session ? t.start : t.help;
  el('exam-title').textContent = s.exam?.title || '';
  el('student').textContent = s.session?.student_name || '';
  for (const [id, label, ready] of [
    ['backend', t.backend, s.backend],
    ['extension', t.extension, s.extension],
    ['screen', t.screen, s.permission === 'granted'],
  ] as const) {
    el(id).textContent = (ready ? '✓ ' : '○ ') + label + ' · ' + (ready ? t.yes : t.no);
  }
  el('notice').textContent = t.notice;
  el('permission-button').hidden = s.permission === 'granted';
  el('permission-button').textContent = t.permission;
  el('error').textContent = s.applicationError || s.error || '';
}
el('language').addEventListener('change', (event) => {
  language = (event.target as HTMLSelectElement).value as keyof typeof copy;
  if (current) render(current);
});
el('permission-button').addEventListener(
  'click',
  () =>
    void window.examguard.screenPermission().catch((error) => {
      el('error').textContent = String(error);
    }),
);
void window.examguard.getState().then(render);
window.examguard.onState(render);
