import type { EventType } from '../types';
import type { Language } from './i18n';
const labels: Record<Language, Record<EventType, string>> = {
  ru: {
    PAGE_HIDDEN: 'Страница Contest скрыта',
    NEW_TAB: 'Открыта новая вкладка',
    TAB_CHANGED: 'Уход со вкладки экзамена',
    GOOGLE_LENS_ATTEMPT: 'Попытка открыть Google Lens',
    BROWSER_UI_ATTEMPT: 'Попытка открыть Lens, Gemini или панель Chrome',
    CHROME_FOCUS_LOST: 'Окно экзамена потеряло фокус',
    DESKTOP_GUARD_DISCONNECTED: 'Приложение ученика отключено',
    STUDENT_DISCONNECTED: 'Ученик отключился',
    RETURN_TO_EXAM: 'Возврат к экзамену',
    STUDENT_RECONNECTED: 'Ученик перезашёл',
    TEACHER_SCREENSHOT: 'Снимок по запросу учителя',
  },
  kz: {
    PAGE_HIDDEN: 'Contest беті жасырылды',
    NEW_TAB: 'Жаңа қойынды ашылды',
    TAB_CHANGED: 'Емтихан қойындысынан шығу',
    GOOGLE_LENS_ATTEMPT: 'Google Lens ашу әрекеті',
    BROWSER_UI_ATTEMPT: 'Lens, Gemini немесе Chrome панелін ашу әрекеті',
    CHROME_FOCUS_LOST: 'Емтихан терезесі фокусты жоғалтты',
    DESKTOP_GUARD_DISCONNECTED: 'Оқушы қолданбасы ажыратылды',
    STUDENT_DISCONNECTED: 'Оқушы ажыратылды',
    RETURN_TO_EXAM: 'Емтиханға оралды',
    STUDENT_RECONNECTED: 'Оқушы қайта кірді',
    TEACHER_SCREENSHOT: 'Мұғалім сұраған экран суреті',
  },
  en: {
    PAGE_HIDDEN: 'Contest page hidden',
    NEW_TAB: 'New tab opened',
    TAB_CHANGED: 'Exam tab changed',
    GOOGLE_LENS_ATTEMPT: 'Attempted to open Google Lens',
    BROWSER_UI_ATTEMPT: 'Attempted to open Lens, Gemini, or Chrome UI',
    CHROME_FOCUS_LOST: 'Exam window lost focus',
    DESKTOP_GUARD_DISCONNECTED: 'Student app disconnected',
    STUDENT_DISCONNECTED: 'Student disconnected',
    RETURN_TO_EXAM: 'Returned to exam',
    STUDENT_RECONNECTED: 'Student reconnected',
    TEACHER_SCREENSHOT: 'Teacher-requested screenshot',
  },
};
export const eventLabel = (type: EventType, language: Language) => labels[language][type];
const focusDetails: Record<Language, string> = {
  ru: 'Возможен переход в другой профиль Chrome, другое окно или приложение. Расширение видит только свой профиль, поэтому это событие не определяет, куда именно перешёл ученик. Проверьте снимок экрана.',
  kz: 'Оқушы басқа Chrome профиліне, басқа терезеге немесе қолданбаға ауысуы мүмкін. Кеңейтім тек өз профилін көреді, сондықтан бұл оқиға оқушының нақты қайда ауысқанын анықтамайды. Экран суретін тексеріңіз.',
  en: 'The student may have switched to another Chrome profile, window, or app. The extension sees only its own profile, so this event does not identify the destination. Review the screenshot.',
};
export const eventDetail = (type: EventType, language: Language) =>
  type === 'CHROME_FOCUS_LOST' ? focusDetails[language] : null;
export function riskClass(score: number) {
  return score < 20 ? 'green' : score < 50 ? 'yellow' : score < 80 ? 'orange' : 'red';
}
export function relativeTime(timestamp: string, now = Date.now(), language: Language = 'ru') {
  const seconds = Math.max(0, Math.floor((now - new Date(timestamp).getTime()) / 1000));
  if (language === 'kz')
    return seconds < 60
      ? `${seconds} сек бұрын`
      : seconds < 3600
        ? `${Math.floor(seconds / 60)} мин бұрын`
        : `${Math.floor(seconds / 3600)} сағ бұрын`;
  return seconds < 60
    ? `${seconds} сек назад`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)} мин назад`
      : `${Math.floor(seconds / 3600)} ч назад`;
}
