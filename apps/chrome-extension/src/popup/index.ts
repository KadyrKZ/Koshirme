import type { ExtensionStatus } from '@koshirme/protocol';
const copy = {
  ru: {
    guide: 'Инструкция',
    examLabel: 'КОНТЕСТ',
    noExam: 'Контест не подключён',
    help: 'Откройте свой контест на fizmat.win. Приложение и расширение подключатся автоматически — коды не нужны.',
    desktop: 'Приложение',
    monitoring: 'Мониторинг',
    yes: 'Подключено',
    no: 'Нет связи',
    active: 'ВКЛЮЧЁН',
    stopped: 'ОЖИДАНИЕ',
    protected: 'Защищено',
    idle: 'Ожидание',
    error: 'Расширение запускается…',
  },
  kz: {
    guide: 'Нұсқаулық',
    examLabel: 'КОНТЕСТ',
    noExam: 'Контест қосылмаған',
    help: 'fizmat.win сайтында өз контестіңізді ашыңыз. Қолданба мен кеңейтім автоматты қосылады, код қажет емес.',
    desktop: 'Қолданба',
    monitoring: 'Мониторинг',
    yes: 'Қосылды',
    no: 'Байланыс жоқ',
    active: 'ҚОСУЛЫ',
    stopped: 'КҮТУ',
    protected: 'Қорғалған',
    idle: 'Күту',
    error: 'Кеңейтім іске қосылуда…',
  },
  en: {
    guide: 'Instructions',
    examLabel: 'CONTEST',
    noExam: 'No contest connected',
    help: 'Open your contest on fizmat.win. The app and extension connect automatically. No pairing codes.',
    desktop: 'Desktop app',
    monitoring: 'Monitoring',
    yes: 'Connected',
    no: 'Disconnected',
    active: 'ACTIVE',
    stopped: 'WAITING',
    protected: 'Protected',
    idle: 'Waiting',
    error: 'Extension is starting…',
  },
};
let language: keyof typeof copy = 'ru';
const el = (id: string) => document.getElementById(id)!;
async function update() {
  const t = copy[language];
  el('brand-title').textContent = language === 'kz' ? 'Көшірме' : 'KOSH!RME';
  el('guide-link').textContent = t.guide;
  el('exam-label').textContent = t.examLabel;
  el('desktop-label').textContent = t.desktop;
  el('monitoring-label').textContent = t.monitoring;
  try {
    const status = (await chrome.runtime.sendMessage({ type: 'get_status' })) as ExtensionStatus;
    el('exam').textContent = status.examTitle || t.noExam;
    el('allowed').textContent = status.examTitle
      ? status.allowedUrls.map((url) => new URL(url).hostname + new URL(url).pathname).join(' · ')
      : t.help;
    el('desktop').textContent = status.desktop ? t.yes : t.no;
    el('desktop').className = status.desktop ? 'good' : 'bad';
    el('monitoring').textContent = status.monitoring ? t.active : t.stopped;
    el('monitoring').className = status.monitoring ? 'good' : 'bad';
    el('badge').textContent = status.monitoring && status.desktop ? t.protected : t.idle;
    el('error').textContent = status.error || '';
  } catch {
    el('error').textContent = t.error;
  }
}
el('language').addEventListener('change', (event) => {
  language = (event.target as HTMLSelectElement).value as keyof typeof copy;
  void chrome.storage.local.set({ language });
  void update();
});
void chrome.storage.local.get('language').then((saved) => {
  language = saved.language === 'en' || saved.language === 'kz' ? saved.language : 'ru';
  (el('language') as HTMLSelectElement).value = language;
  void update();
});
setInterval(() => void update(), 1000);
