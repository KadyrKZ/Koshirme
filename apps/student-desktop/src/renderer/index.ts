import './style.css';
import type { DesktopState, GuardAPI } from '../types';

declare global {
  interface Window {
    examguard: GuardAPI;
  }
}
type Language = 'ru' | 'en' | 'kz';
const text = {
  ru: {
    edition: 'УЧЕНИК',
    joinEyebrow: 'ЭКЗАМЕН ПО ПРОГРАММИРОВАНИЮ',
    joinTitle: 'Можно начинать.',
    joinDescription: 'Подключитесь к комнате учителя до начала мониторинга.',
    studentName: 'Имя ученика',
    namePlaceholder: 'Введите своё имя',
    codePlaceholder: 'Введите код комнаты',
    roomCode: 'Код комнаты',
    joinButton: 'Войти в комнату',
    active: 'Мониторинг KOSH!RME активен',
    yourExam: 'ВАШ ЭКЗАМЕН',
    connection: 'Соединение',
    extension: 'Расширение Chrome',
    screen: 'Разрешение на снимок экрана',
    exam: 'Сессия экзамена',
    pairTitle: 'Подключите расширение Chrome',
    pairDescription:
      'Для ручного входа скопируйте код и подключите расширение. При входе через fizmat.win код не нужен:',
    copy: 'Копировать ещё раз',
    copied: 'Скопировано',
    permissionTitle: 'Сначала разрешите запись экрана',
    permissionDescription:
      'До входа в комнату откройте Системные настройки → Конфиденциальность и безопасность → Запись экрана и системного аудио. Включите KOSH!RME и перезапустите приложение.',
    openSettings: 'Открыть настройки',
    consent: 'Я согласен с мониторингом вкладки экзамена и снимком экрана при серьёзном нарушении.',
    readyExam: 'Готов к экзамену',
    openContest: 'Открыть контест',
    stop: 'Остановить мониторинг',
    another: 'Подключиться к другому экзамену',
    student: 'Ученик',
    allowed: 'Разрешено',
    connected: 'Подключено',
    disconnected: 'Нет связи',
    ready: 'Готово',
    permissionRequired: 'Нужно разрешение',
    inProgress: 'Идёт экзамен',
    paused: 'Пауза',
    finished: 'Завершён',
    waitingTeacher: 'Ожидание учителя',
    activeTitle: 'KOSH!RME активен',
    stoppedTitle: 'Мониторинг остановлен',
    pausedTitle: 'Мониторинг на паузе',
    readyTitle: 'Готов к экзамену',
    systemCheck: 'Проверка системы',
    activeStage: 'МОНИТОРИНГ АКТИВЕН',
    completeStage: 'ЭКЗАМЕН ЗАВЕРШЁН',
    pausedStage: 'МОНИТОРИНГ НА ПАУЗЕ',
    waitingStage: 'ГОТОВ — ОЖИДАНИЕ УЧИТЕЛЯ',
    checkStage: 'ПРОВЕРКА СОЕДИНЕНИЯ',
    keepOpen: 'Не закрывайте приложение до конца экзамена.',
    ended: 'Экзамен завершён. Мониторинг остановлен.',
    pausedDescription: 'Учитель приостановил мониторинг. Он продолжится автоматически.',
    prepared: 'Всё готово. Мониторинг начнётся одновременно у всех после запуска учителем.',
    interrupted: 'Соединение прервано. Мониторинг продолжится после восстановления связи.',
    completeChecks: 'Завершите проверку перед экзаменом.',
    switchContest: 'Перейдите в Chrome',
    switchDescription:
      'Войдите в свой аккаунт Fizmat Contest в Chrome, затем нажмите «Готов к экзамену». Контест откроется после запуска учителем.',
  },
  kz: {
    edition: 'ОҚУШЫ',
    joinEyebrow: 'БАҒДАРЛАМАЛАУ ЕМТИХАНЫ',
    joinTitle: 'Бастауға болады.',
    joinDescription: 'Мониторинг басталғанға дейін мұғалім бөлмесіне қосылыңыз.',
    studentName: 'Оқушының аты',
    namePlaceholder: 'Атыңызды енгізіңіз',
    codePlaceholder: 'Бөлме кодын енгізіңіз',
    roomCode: 'Бөлме коды',
    joinButton: 'Бөлмеге кіру',
    active: 'KOSH!RME мониторингі белсенді',
    yourExam: 'СІЗДІҢ ЕМТИХАНЫҢЫЗ',
    connection: 'Байланыс',
    extension: 'Chrome кеңейтімі',
    screen: 'Экран суретіне рұқсат',
    exam: 'Емтихан сессиясы',
    pairTitle: 'Chrome кеңейтімін қосыңыз',
    pairDescription:
      'Қолмен кіру үшін кодты көшіріп, кеңейтімді қосыңыз. fizmat.win арқылы кіргенде код қажет емес:',
    copy: 'Қайта көшіру',
    copied: 'Көшірілді',
    permissionTitle: 'Алдымен экран жазуға рұқсат беріңіз',
    permissionDescription:
      'Бөлмеге кірмес бұрын Жүйе баптаулары → Құпиялық және қауіпсіздік → Экран мен жүйелік аудионы жазу бөлімін ашыңыз. KOSH!RME қолданбасын қосып, қайта іске қосыңыз.',
    openSettings: 'Баптауларды ашу',
    consent:
      'Емтихан қойындысының мониторингіне және елеулі бұзушылық кезінде экран суретіне келісемін.',
    readyExam: 'Емтиханға дайынмын',
    openContest: 'Контестті ашу',
    stop: 'Мониторингті тоқтату',
    another: 'Басқа емтиханға қосылу',
    student: 'Оқушы',
    allowed: 'Рұқсат етілген',
    connected: 'Қосылды',
    disconnected: 'Байланыс жоқ',
    ready: 'Дайын',
    permissionRequired: 'Рұқсат қажет',
    inProgress: 'Емтихан жүріп жатыр',
    paused: 'Үзіліс',
    finished: 'Аяқталды',
    waitingTeacher: 'Мұғалімді күту',
    activeTitle: 'KOSH!RME белсенді',
    stoppedTitle: 'Мониторинг тоқтатылды',
    pausedTitle: 'Мониторинг үзілісте',
    readyTitle: 'Емтиханға дайын',
    systemCheck: 'Жүйені тексеру',
    activeStage: 'МОНИТОРИНГ БЕЛСЕНДІ',
    completeStage: 'ЕМТИХАН АЯҚТАЛДЫ',
    pausedStage: 'МОНИТОРИНГ ҮЗІЛІСТЕ',
    waitingStage: 'ДАЙЫН — МҰҒАЛІМДІ КҮТУ',
    checkStage: 'БАЙЛАНЫСТЫ ТЕКСЕРУ',
    keepOpen: 'Емтихан аяқталғанша қолданбаны жаппаңыз.',
    ended: 'Емтихан аяқталды. Мониторинг тоқтады.',
    pausedDescription: 'Мұғалім мониторингті уақытша тоқтатты. Ол автоматты түрде жалғасады.',
    prepared: 'Барлығы дайын. Мұғалім іске қосқанда мониторинг бәрінде бір уақытта басталады.',
    interrupted: 'Байланыс үзілді. Байланыс қалпына келгенде мониторинг жалғасады.',
    completeChecks: 'Емтихан алдында тексеруді аяқтаңыз.',
    switchContest: 'Chrome бетіне өтіңіз',
    switchDescription: 'Chrome ашық қалсын. Контест мұғалім іске қосқаннан кейін ашылады.',
  },
  en: {
    edition: 'STUDENT',
    joinEyebrow: 'PROGRAMMING EXAM',
    joinTitle: 'You can begin.',
    joinDescription: 'Connect to the teacher room before monitoring starts.',
    studentName: 'Student name',
    namePlaceholder: 'Enter your name',
    codePlaceholder: 'Enter room code',
    roomCode: 'Room code',
    joinButton: 'Join room',
    active: 'KOSH!RME monitoring is active',
    yourExam: 'YOUR EXAM',
    connection: 'Connection',
    extension: 'Chrome extension',
    screen: 'Screen capture permission',
    exam: 'Exam session',
    pairTitle: 'Connect the Chrome extension',
    pairDescription:
      'For manual room entry, copy this code into the extension. Entry through fizmat.win needs no code:',
    copy: 'Copy again',
    copied: 'Copied',
    permissionTitle: 'Allow screen recording first',
    permissionDescription:
      'Before joining a room, open System Settings → Privacy & Security → Screen & System Audio Recording. Enable KOSH!RME and restart the app.',
    openSettings: 'Open settings',
    consent: 'I agree to monitoring of the exam tab and screenshots for serious violations.',
    readyExam: 'Ready for exam',
    openContest: 'Open contest',
    stop: 'Stop monitoring',
    another: 'Join another exam',
    student: 'Student',
    allowed: 'Allowed',
    connected: 'Connected',
    disconnected: 'Disconnected',
    ready: 'Ready',
    permissionRequired: 'Permission required',
    inProgress: 'Exam in progress',
    paused: 'Paused',
    finished: 'Finished',
    waitingTeacher: 'Waiting for teacher',
    activeTitle: 'KOSH!RME active',
    stoppedTitle: 'Monitoring stopped',
    pausedTitle: 'Monitoring paused',
    readyTitle: 'Ready for exam',
    systemCheck: 'System check',
    activeStage: 'MONITORING ACTIVE',
    completeStage: 'EXAM FINISHED',
    pausedStage: 'MONITORING PAUSED',
    waitingStage: 'READY — WAITING FOR TEACHER',
    checkStage: 'CHECKING CONNECTION',
    keepOpen: 'Do not close the app until the exam ends.',
    ended: 'Exam finished. Monitoring stopped.',
    pausedDescription: 'The teacher paused monitoring. It will resume automatically.',
    prepared: 'Everything is ready. Monitoring starts for everyone when the teacher launches it.',
    interrupted: 'Connection interrupted. Monitoring will continue after reconnection.',
    completeChecks: 'Complete the checks before the exam.',
    switchContest: 'Switch to Chrome',
    switchDescription: 'Keep Chrome open. The contest opens when the teacher starts monitoring.',
  },
} as const;

function element<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
const savedLanguage = localStorage.getItem('koshirme.language') as Language;
let language: Language = savedLanguage === 'en' || savedLanguage === 'kz' ? savedLanguage : 'ru';
let current: DesktopState | null = null,
  busy = false,
  joiningAnother = false;
const t = (key: keyof typeof text.ru) => text[language][key];
const staticIds: Record<string, keyof typeof text.ru> = {
  'edition-label': 'edition',
  'join-eyebrow': 'joinEyebrow',
  'join-title': 'joinTitle',
  'join-description': 'joinDescription',
  'student-name-label': 'studentName',
  'exam-code-label': 'roomCode',
  'join-button-label': 'joinButton',
  'active-label': 'active',
  'your-exam-label': 'yourExam',
  'backend-label': 'connection',
  'extension-label': 'extension',
  'screen-label': 'screen',
  'exam-label': 'exam',
  'pair-title': 'pairTitle',
  'pair-description': 'pairDescription',
  'copy-pair-button': 'copy',
  'permission-title': 'permissionTitle',
  'permission-description': 'permissionDescription',
  'permission-button': 'openSettings',
  'consent-label': 'consent',
  'start-button-label': 'readyExam',
  'another-button': 'another',
};
function applyLanguage() {
  document.documentElement.lang = language;
  element<HTMLSelectElement>('language-select').value = language;
  for (const [id, key] of Object.entries(staticIds)) element(id).textContent = t(key);
  element<HTMLInputElement>('student-name').placeholder = t('namePlaceholder');
  element<HTMLInputElement>('exam-code').placeholder = t('codePlaceholder');
  if (current) render(current);
}
function check(id: string, ready: boolean, value: string) {
  const target = element(id);
  target.textContent = `${ready ? '✓' : '○'} ${value}`;
  target.className = ready ? 'good' : 'pending';
}
function render(state: DesktopState) {
  current = state;
  element('join-screen').hidden = !!state.session && !joiningAnother;
  element('session-screen').hidden = !state.session || joiningAnother;
  element('pair-code').textContent = state.pairingCode;
  element('pair-panel').hidden = state.extension || !!state.websiteConnected;
  element('permission-panel').hidden = state.permission === 'granted';
  element('active-banner').hidden = !state.monitoring;
  element('exam-title').textContent = state.exam?.title || '';
  element('student-display').textContent = state.session
    ? `${t('student')}: ${state.session.student_name}`
    : '';
  check('backend-check', state.backend, state.backend ? t('connected') : t('disconnected'));
  check('extension-check', state.extension, state.extension ? t('connected') : t('disconnected'));
  check(
    'screen-check',
    state.permission === 'granted',
    state.permission === 'granted' ? t('ready') : t('permissionRequired'),
  );
  check(
    'exam-check',
    !!state.exam?.active,
    state.exam?.active
      ? t('inProgress')
      : state.exam?.paused
        ? t('paused')
        : state.exam?.finished_at
          ? t('finished')
          : t('waitingTeacher'),
  );
  const ended = !!state.exam?.finished_at,
    paused = !!state.exam?.paused;
  const sessionStarted = state.consented || !!state.session?.ready;
  element('stage-title').textContent = state.monitoring
    ? t('activeTitle')
    : ended
      ? t('stoppedTitle')
      : paused
        ? t('pausedTitle')
        : state.session?.ready
          ? t('readyTitle')
          : t('systemCheck');
  element('stage-label').textContent = state.monitoring
    ? t('activeStage')
    : ended
      ? t('completeStage')
      : paused
        ? t('pausedStage')
        : state.session?.ready
          ? t('waitingStage')
          : t('checkStage');
  element('stage-description').textContent = state.monitoring
    ? t('keepOpen')
    : ended
      ? t('ended')
      : paused
        ? t('pausedDescription')
        : state.session?.ready
          ? t('prepared')
          : sessionStarted
            ? t('interrupted')
            : t('completeChecks');
  if (state.starting) {
    element('stage-title').textContent = t('switchContest');
    element('stage-description').textContent = t('switchDescription');
  }
  element('consent-panel').hidden =
    state.monitoring || ended || state.consented || !!state.websiteConnected;
  if (state.websiteConnected && !sessionStarted && !state.starting) {
    element('stage-description').textContent =
      language === 'ru'
        ? 'Подключение выполняется автоматически. Вернитесь на fizmat.win и нажмите «Начать контест».'
        : language === 'kz'
          ? 'Қосылу автоматты түрде орындалады. fizmat.win бетіне оралып, «Контестті бастау» түймесін басыңыз.'
          : 'Connecting automatically. Return to fizmat.win and click Start contest.';
  }
  element('another-button').hidden = !ended;
  element<HTMLButtonElement>('start-button').disabled =
    busy ||
    !state.backend ||
    !state.extension ||
    state.permission !== 'granted' ||
    !element<HTMLInputElement>('consent').checked;
  element<HTMLButtonElement>('join-button').disabled = busy;
  if (state.error) element('error').textContent = state.error;
}
async function run(action: () => Promise<void>) {
  busy = true;
  element('error').textContent = '';
  element<HTMLButtonElement>('join-button').disabled = true;
  if (current) render(current);
  try {
    await action();
  } catch (error) {
    element('error').textContent = String(error).replace(
      /^Error: Error invoking remote method '[^']+': Error: /,
      '',
    );
  } finally {
    busy = false;
    if (current) render(current);
  }
}
element<HTMLSelectElement>('language-select').addEventListener('change', (event) => {
  language = (event.target as HTMLSelectElement).value as Language;
  localStorage.setItem('koshirme.language', language);
  applyLanguage();
});
element('join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void run(async () => {
    await window.examguard.join({
      studentName: element<HTMLInputElement>('student-name').value,
      joinCode: element<HTMLInputElement>('exam-code').value.trim(),
    });
    joiningAnother = false;
  });
});
element('copy-pair-button').addEventListener('click', () => {
  void window.examguard.copyPairingCode().then(() => {
    element('copy-pair-button').textContent = t('copied');
    setTimeout(() => {
      element('copy-pair-button').textContent = t('copy');
    }, 1500);
  });
});
element('consent').addEventListener('change', () => current && render(current));
element('start-button').addEventListener('click', () => void run(() => window.examguard.start()));
element('permission-button').addEventListener(
  'click',
  () => void run(() => window.examguard.screenPermission()),
);
element('another-button').addEventListener('click', () => {
  joiningAnother = true;
  element<HTMLInputElement>('consent').checked = false;
  if (current) render(current);
});
window.examguard.onState(render);
void window.examguard.getState().then(render);
applyLanguage();
