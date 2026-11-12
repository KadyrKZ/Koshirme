import type { ExtensionStatus } from '@koshirme/protocol';
type Language = 'ru' | 'en' | 'kz';
const messages = {
  ru: {
    guide: 'Инструкция',
    examLabel: 'ЭКЗАМЕН',
    noExam: 'Экзамен не подключён',
    openApp: 'Откройте приложение KOSH!RME и войдите в комнату.',
    desktop: 'Приложение',
    monitoring: 'Мониторинг',
    pair: 'Подключить приложение',
    secret: 'Код из приложения',
    secretPlaceholder: 'Введите код из приложения',
    connect: 'Подключить вручную',
    autoPair: 'Вставить код и подключить',
    pairHelp: 'Если автоподключение недоступно, введите 8-значный код из приложения.',
    clipboardInvalid:
      'В буфере нет pair-кода. Скопируйте код в приложении или введите его вручную.',
    clipboardDenied: 'Автовставка недоступна. Введите код из приложения вручную.',
    reconnect: 'Переподключить',
    connected: 'Подключено',
    disconnected: 'Нет связи',
    active: 'АКТИВЕН',
    stopped: 'ОСТАНОВЛЕН',
    protected: 'Защищено',
    attention: 'Внимание',
    idle: 'Ожидание',
    starting: 'Расширение запускается. Откройте окно ещё раз.',
  },
  kz: {
    guide: 'Нұсқаулық',
    examLabel: 'ЕМТИХАН',
    noExam: 'Емтихан қосылмаған',
    openApp: 'KOSH!RME қолданбасын ашып, бөлмеге кіріңіз.',
    desktop: 'Қолданба',
    monitoring: 'Мониторинг',
    pair: 'Қолданбаны қосу',
    secret: 'Қолданбадағы код',
    secretPlaceholder: 'Қолданбадағы кодты енгізіңіз',
    connect: 'Қолмен қосу',
    autoPair: 'Кодты қойып, қосу',
    pairHelp: 'Автоматты қосылу қолжетімсіз болса, қолданбадағы 8 таңбалы кодты енгізіңіз.',
    clipboardInvalid:
      'Алмасу буферінде қосылу коды жоқ. Қолданбадағы кодты көшіріңіз немесе қолмен енгізіңіз.',
    clipboardDenied: 'Автоматты қою қолжетімсіз. Қолданбадағы кодты қолмен енгізіңіз.',
    reconnect: 'Қайта қосу',
    connected: 'Қосылды',
    disconnected: 'Байланыс жоқ',
    active: 'БЕЛСЕНДІ',
    stopped: 'ТОҚТАТЫЛДЫ',
    protected: 'Қорғалған',
    attention: 'Назар аударыңыз',
    idle: 'Күту',
    starting: 'Кеңейтім іске қосылуда. Терезені қайта ашыңыз.',
  },
  en: {
    guide: 'Instructions',
    examLabel: 'EXAM',
    noExam: 'No exam connected',
    openApp: 'Open KOSH!RME and join a room.',
    desktop: 'Desktop app',
    monitoring: 'Monitoring',
    pair: 'Connect app',
    secret: 'Code from app',
    secretPlaceholder: 'Enter the code from the app',
    connect: 'Connect manually',
    autoPair: 'Paste code and connect',
    pairHelp: 'If automatic connection is unavailable, enter the 8-character code from the app.',
    clipboardInvalid:
      'No pairing code was found in the clipboard. Copy it in the app or enter it manually.',
    clipboardDenied: 'Automatic paste is unavailable. Enter the code from the app manually.',
    reconnect: 'Reconnect',
    connected: 'Connected',
    disconnected: 'Disconnected',
    active: 'ACTIVE',
    stopped: 'STOPPED',
    protected: 'Protected',
    attention: 'Attention',
    idle: 'Waiting',
    starting: 'Extension is starting. Open the app again.',
  },
} as const;
function element<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
let language: Language = 'ru';
const t = (key: keyof typeof messages.ru) => messages[language][key];
function indicator(id: string, good: boolean) {
  const target = element(id);
  target.textContent = good ? t('connected') : t('disconnected');
  target.className = good ? 'good' : 'bad';
}
function renderStatic() {
  element('brand-title').textContent = language === 'kz' ? 'Көшірме' : 'KOSH!RME';
  element('guide-link').textContent = t('guide');
  element('exam-label').textContent = t('examLabel');
  element('desktop-label').textContent = t('desktop');
  element('monitoring-label').textContent = t('monitoring');
  element('pair-summary').textContent = t('pair');
  element('secret-label').textContent = t('secret');
  element<HTMLInputElement>('secret').placeholder = t('secretPlaceholder');
  element('auto-pair-button').textContent = t('autoPair');
  element('connect-button').textContent = t('connect');
  element('pair-help').textContent = t('pairHelp');
  element('reconnect').textContent = t('reconnect');
}
async function update() {
  try {
    const status = (await chrome.runtime.sendMessage({ type: 'get_status' })) as ExtensionStatus;
    element('exam').textContent = status.examTitle || t('noExam');
    element('allowed').textContent = status.allowedUrls.length
      ? status.allowedUrls.map((url) => new URL(url).hostname + new URL(url).pathname).join(' · ')
      : t('openApp');
    indicator('desktop', status.desktop);
    indicator('monitoring', status.monitoring);
    element('monitoring').textContent = status.monitoring ? t('active') : t('stopped');
    element('badge').textContent =
      status.monitoring && status.desktop
        ? t('protected')
        : status.monitoring
          ? t('attention')
          : t('idle');
    element('error').textContent = status.error || '';
    if (status.desktop) element<HTMLDetailsElement>('pairing').open = false;
  } catch {
    element('error').textContent = t('starting');
  }
}
async function pair(secret: string) {
  await chrome.runtime.sendMessage({ type: 'pair', secret });
  await update();
}
element('pair-form').addEventListener('submit', (event) => {
  event.preventDefault();
  void pair(element<HTMLInputElement>('secret').value.trim().toUpperCase());
});
element('auto-pair-button').addEventListener('click', () => {
  void (async () => {
    const input = element<HTMLInputElement>('secret');
    try {
      const granted = await chrome.permissions.request({ permissions: ['clipboardRead'] });
      if (!granted) throw new Error('permission');
      const secret = (await navigator.clipboard.readText()).trim().toUpperCase();
      if (!/^[A-Z0-9]{8}$/.test(secret)) {
        element('error').textContent = t('clipboardInvalid');
        input.focus();
        return;
      }
      input.value = secret;
      await pair(secret);
    } catch {
      element('error').textContent = t('clipboardDenied');
      input.focus();
    }
  })();
});
element('reconnect').addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'reconnect' }).then(update);
});
element<HTMLSelectElement>('language').addEventListener('change', (event) => {
  language = (event.target as HTMLSelectElement).value as Language;
  void chrome.storage.local.set({ language });
  renderStatic();
  void update();
});
void chrome.storage.local.get('language').then((saved) => {
  language = saved.language === 'en' || saved.language === 'kz' ? saved.language : 'ru';
  element<HTMLSelectElement>('language').value = language;
  renderStatic();
  void update();
});
setInterval(() => void update(), 1000);
