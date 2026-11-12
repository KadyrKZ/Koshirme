# Chrome Enterprise policy for exam computers

These machine-level templates harden Chrome on dedicated exam computers. They affect all Chrome profiles on a machine:

- force-install KOSH!RME and prevent the student from disabling it;
- block every other Chrome extension (including ChatGPT context-menu extensions);
- disable all covered Chrome generative-AI features, Gemini, and AI Mode;
- disable Google Lens page-content sharing, the Google Search side panel, and all Lens entry points;
- disable Incognito, Guest, and creation of new Chrome profiles;
- block `chrome://extensions`, settings, flags, inspection pages, DevTools, printing,
  and ending extension processes from Chrome Task Manager.

## Before deployment

The templates use the published KOSH!RME extension ID `mcfibeppldfkaahnjdpbcfpbncemolnp` and the Chrome Web Store update URL. They install the currently approved store version; they do not require the pending 0.2.9 update. For a different private package, replace the ID and update URL. Windows and macOS only accept force-installed off-store extensions on properly managed/enrolled devices.

## Переключение в существующий профиль Chrome

`BrowserAddPersonEnabled=false` запрещает **создание новых профилей**, но не закрывает доступ к уже существующим. Поэтому базовые шаблоны сами по себе не закрывают обход через меню «Профили». Расширение видит окна своего профиля; уход в другой профиль фиксируется как `CHROME_FOCUS_LOST`, без имени нового профиля. Название события в панели учителя — «Окно экзамена потеряло фокус». Само событие также может означать переход в другое приложение: для проверки используйте снимок экрана.

Для управляемого школьного Windows/Mac подготовьте отдельную обычную учётную запись ОС и **один** профиль Chrome, заранее вошедший в Google-аккаунт ученика. Затем сгенерируйте настройки, разрешающие только этот аккаунт:

```powershell
node scripts/prepare-exam-chrome-policy.mjs --email student@school.kz --out exam-policy-student
```

Запускайте из корня `examguard` с установленным Node.js; замените email на аккаунт ученика. Папка результата должна ещё не существовать. Скрипт только создаёт файлы и не применяет политики на компьютере, где его запускают:

- `koshirme-chrome.reg` — Windows, импорт администратором или развёртывание через GPO/Intune;
- `KOSH!RME-Chrome.mobileconfig` — Mac, установка через MDM;
- `koshirme-chrome.json` — Linux Chrome 145+, установка в каталог managed policies.

В этих файлах добавлены `BrowserSignin=2` и `RestrictSigninToPattern` с точным email. Первая политика требует входа в Chrome, вторая не разрешает другие первичные Google-аккаунты. **Два профиля с одним разрешённым аккаунтом эта политика не различает**: в экзаменационной учётной записи должен быть только один подготовленный профиль. Не используйте шаблон с целым доменом, если требуется ограничить вход одним учеником.

Полностью перезапустите Chrome. Проверьте `chrome://policy`: значения обеих политик и статус `OK`. Затем попробуйте открыть заранее существовавший профиль с другим аккаунтом, неподписанный профиль, Guest и Incognito — пользоваться ими должно быть невозможно. Переключение между разрешёнными и заблокированными профилями проверяйте на отдельном тестовом школьном устройстве. Политики действуют на весь Chrome, поэтому не устанавливайте их на личный Mac преподавателя с рабочими профилями.

Для отмены администратор возвращает предыдущие значения политик через тот же GPO/MDM, затем перезапускает Chrome. Профили и пользовательские данные удалять не требуется.

На личных ноутбуках без системного управления остаются обнаружение потери фокуса, снимок экрана и возврат к экзамену. Полное запрещение других браузеров и приложений требует ограничений ОС/киоск-режима. Обновление расширения само по себе не блокирует другие профили.

Источники: [BrowserAddPersonEnabled](https://chromeenterprise.google/policies/browser-add-person-enabled/), [Google: принудительный вход и ограничение аккаунтов](https://support.google.com/chrome/a/answer/7572556?hl=en).

## macOS (recommended: MDM)

Import `macos/KOSH!RME-Chrome.mobileconfig` into Jamf, Mosyle, Intune, or another MDM and assign it to the exam Macs. A configuration profile installed by MDM is preferable to editing preference files locally because Chrome can verify that the settings are managed.

After installation, fully restart Chrome and verify the policy status in `chrome://policy` or the management console. The templates block Chrome settings and extension management pages; the policy diagnostics page remains available.

## Windows

Run `windows/koshirme-chrome.reg` as Administrator (or deploy equivalent settings through GPO/Intune), then restart Chrome. For single-account restrictions, use the generated file described above.

## Linux

Copy `linux/koshirme-chrome.json` to `/etc/opt/chrome/policies/managed/koshirme-chrome.json`, then restart Chrome.

## Required verification

On an active exam page:

1. Right-click must not open a context menu, including inside an iframe.
2. Menu key and Shift+F10 must not open it either.
3. `chrome://extensions`, Chrome settings, flags, and DevTools must be blocked. KOSH!RME must remain force-installed without a Remove/Disable control.
4. ChatGPT or other unapproved extensions must be absent.
5. `GenAiDefaultSettings`, `GeminiSettings`, `AIModeSettings`, `SearchContentSharingSettings`,
   `GoogleSearchSidePanelEnabled`, `LensOverlaySettings`, `LensRegionSearchEnabled`, and
   `LensDesktopNTPSearchEnabled` must be shown as managed with the disabled values.

These browser controls cannot prevent a student from using a phone, another computer, a virtual machine, Remote Desktop, or an AI application outside Chrome. Dedicated non-admin OS accounts, MDM/kiosk controls, and room supervision are still required.
