# Автоматический возврат Chrome — Desktop 0.1.5, 11 октября 2026

macOS ARM64 0.1.5 подписан Developer ID, приложение и DMG приняты Apple; strict/deep codesign, Gatekeeper, stapler и hdiutil verify прошли. Финальный DMG notarization ID: `26c3c366-9177-41bb-9407-2110981ed97a`, SHA-256 `86e11b763ea67b6afa8a0c2068947b837e5953acf9ae4ad0c9a4cb32ecd2d71a`. Windows EXE собран без Authenticode-подписи; запуск на реальном Windows не проверялся.

Исправления находятся в Desktop и сохраняют протокол с неизменёнными Chrome 0.2.8 и 0.2.9. Возврат выполняется также при cooldown/ошибке захвата и offline `show_violation`. Пока собирается снимок, возврат отложен; после получения изображения он не ждёт завершения загрузки/status request. На macOS добавлена активация Chrome через LaunchServices. Windows helper восстанавливает свёрнутое окно Chrome и вызывает Win32 SetForegroundWindow; проверка на реальном Windows пока не выполнена.

После разрыва localhost-подключения активная сессия ждёт 2 секунды и один раз запускает Chrome с адресом контеста. Повторные callback одного разрыва не открывают новые вкладки; переподключения ограничены 30 секундами между запусками. Пауза/завершение/истечение lease отменяют отложенный запуск. Pending команды LocalServer сразу отклоняются при отключении расширения.

Проверки: 35 unit tests прошли. Четыре настоящих macOS/Chromium E2E прошли: восстановление свёрнутого окна без дополнительной вкладки; открытие адреса контеста после закрытия последнего окна Chrome; Desktop со строго неизменённым 0.2.8 и с 0.2.9 — Ready → Start → минимизация и автоматический возврат → закрытие вкладки и восстановление одного контеста → Pause → Resume → Delete. Для снимков в E2E подменён `desktopCapturer.getSources` на синтетическое изображение; реальный пользовательский рабочий стол не снимался. Использовались отдельные временные профили Chromium и локальный Cloudflare/D1; production экзамены не создавались. Typecheck всех workspace и E2E прошёл; собранный Windows payload x64 имеет версию 0.1.5 и побайтово совпадающий с `out/main/index.js` основной код.

Для Mac `signIgnore` исключает только `.lproj/locale.pak` из индивидуального codesign. Это данные локализации, которые остаются запечатаны подписью Electron Framework; все исполняемые файлы подписываются, strict/deep verify и Apple notarization обязательны. Не удаляются языки и не отключаются проверки.

# Уточнение профилей Chrome — 11 октября 2026

Панель учителя теперь описывает `CHROME_FOCUS_LOST` как «Окно экзамена потеряло фокус», с пояснением о возможном другом профиле, окне или приложении. Это уточнение имеющегося сигнала, а не новый детектор конкретного профиля. Тип события, риск +25 и протокол 0.2.8 не изменены.

Генератор `scripts/prepare-exam-chrome-policy.mjs` создаёт файлы Windows/Mac/Linux с `BrowserSignin=2` и точным email в `RestrictSigninToPattern`. Базовые шаблоны используют постоянный опубликованный ID расширения. Документация исправлена: `BrowserAddPersonEnabled=false` запрещает создание новых профилей, но не использование существующих. Для школьных устройств нужны установка администратором и один подготовленный профиль в отдельной обычной учётной записи ОС. Политики не применялись на личном Mac и не проверялись на управляемом школьном устройстве.

`npm test`: 23 теста прошли, включая сериализацию политик для трёх ОС, точное ограничение email с точкой/плюсом, отклонение regex/injection и запрет перезаписи существующих файлов. Typecheck/build сайта прошли. Код Desktop и расширения в этом уточнении не изменялся.

# Публикация завершена — 11 октября 2026

Production Worker/site опубликованы на `koshirme.stream`; первый deployment ID этого прогона — `8416e850-b7ca-4875-b218-cd2d56828e5a`. API health и публичные инструкции проверены. Новых DB migrations нет, существующий протокол Chrome 0.2.8 сохранён.

Windows EXE 0.1.4 собран с NSIS toolset 1.2.1 (NSIS 3.12): валидный PE installer с x64 payload, версия в app.asar 0.1.4, main code совпадает с проверенной сборкой. Полное скачивание опубликованного EXE даёт SHA-256 `b8c4213007af9b1a870be7620719f9b5f073ee0319b4dde2282443d984ea9421`. Authenticode-подписи нет; работа на физическом Windows не проверялась.

macOS ARM64 0.1.4: Developer ID signature, app notarization, app Gatekeeper/stapler, DMG notarization/stapler/Gatekeeper и hdiutil verify пройдены. SHA-256 итогового DMG — `8204500397911f11c8473490943945e6b7b85c4ca0d443d5eb1d4e399c08b265`. Нативное подписанное приложение запускается до экрана Join и закрывается; экзамен в этом запуске не создавался и реальный screenshot не снимался.

Chrome 0.2.9 загружен в существующую карточку `mcfibeppldfkaahnjdpbcfpbncemolnp` и отправлен на review под аккаунтом владельца. Подтверждение: `artifacts/release-20261011/chrome-review.png`. Автоматическая публикация после review включена, освобождение от проверки не запрашивалось. Публичная магазинная версия остаётся 0.2.8 до одобрения Google.

ZIP расширения и Windows-source доступны с сайта; контрольные суммы сверены с локальными файлами. Старые артефакты не удалялись.

---

## Предыдущая попытка подготовки, до успешной публикации

# Релиз 11 октября 2026 — Desktop 0.1.4 / Chrome 0.2.9

Подготовлены исходники Desktop 0.1.4, Chrome 0.2.9, backend/site и архив для сборки Windows. Сохранены REST endpoints, DTO и localhost/WebSocket frames; обязательной проверки версии расширения нет. Новых D1 migrations в релизе нет.

## Проверки

- `npm test`: 21/21, включая завершение во время Ready/capture, offline lease, повторные открытия и переиспользование загружающейся вкладки.
- `npm run typecheck`: все workspaces и E2E проходят.
- Production builds admin-web, Chrome, Electron и Cloudflare dry-run проходят.
- Python backend: 7/7, включая уведомление об окончании до удаления комнаты.
- Неизменённый архив Chrome 0.2.8 совпадает с публичным ZIP: SHA-256 `6ee70e8eb9498c7760b601076b10054083cabb4b35f349f3eaa03c5279bc15c5`.
- В локальном Cloudflare Worker/D1/R2/Durable Objects проверены настоящий Electron 0.1.4 + Chrome 0.2.8 и 0.2.9: Ready → Start → Pause → Resume → Delete; Desktop выходит, network rules удаляются. Для старого клиента в проверке страницы использовано обновление разрешённой вкладки после старта.
- Настоящий Electron: Finish, Delete, ручное закрытие после Pause. Настоящие MV3 0.2.8/0.2.9: события, запрос снимка в имитацию Desktop, offline buffering, отключение после Finish. Реальные пользовательские screenshots этим прогоном не снимались.
- Версии package-lock согласованы; offline npm validation проходит.

## Что ещё не опубликовано

Cloudflare deployment завершился `fetch failed` при обращении к API: production backend/site этим прогоном не обновлены. Подготовленные ZIP доступны локально. Команды публикации с Windows приведены в [WINDOWS.md](WINDOWS.md).

Mac signing дважды остановился на `A timestamp was expected but was not found`; соединение с `timestamp.apple.com` уходит в timeout. Рабочий Developer ID и профиль notarization есть, но новый проверенный DMG 0.1.4 не выпущен. Прежний подписанный 0.1.3 не заменён.

API credentials Chrome Web Store отсутствуют: ZIP 0.2.9 подготовлен, на review не отправлен. Существующий магазинный клиент продолжает работать; ручная загрузка в ту же карточку описана в WINDOWS.md.

Windows EXE нужно собрать и проверить на Windows по [инструкции](WINDOWS.md); этот Mac-прогон не подтверждает работу на настоящем Windows. Windows-скрипт исправляет путь устаревшей версии, использует npm.cmd, проверяет ошибки native-команд и создаёт SHA-256. Добавлен Windows GitHub Actions workflow.

---

# Проверка обновления — 1 октября 2026 года

Платформа переведена на `https://koshirme.stream`. Cloudflare Worker опубликован с Custom Domain, публичные Google/Cloudflare DNS возвращают записи домена. HTTPS API отвечает 200 с действительным сертификатом; локальный DNS может ещё хранить прежний отрицательный ответ.

## Выполненные проверки

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | Все приложения, общий протокол и E2E проходят |
| `npm run build` | Веб-панель, расширение и Electron собраны |
| Cloudflare build/deploy | Worker опубликован на новом домене, старый адрес сохранён |
| `npm test` | 5/5: HTTPS, приватность URL, границы разрешённых страниц |
| Backend `pytest -q` | 6/6, включая ссылки fizmat.win, отсутствие обязательных URL и остановку комнаты |
| Backend `ruff check` | Пройдено |
| `npx playwright test` | 5/5 активных тестов: панель, узкий экран, Electron, настоящий MV3, контекстное меню |
| Локальный Cloudflare smoke | Вход, WebSocket, готовность, запуск, событие, защищённый JPEG, завершение |
| Локальная проверка Cloudflare API | Любые HTTPS-ссылки, дубликаты, неверные ссылки/даты/JSON, страница ожидания |
| `npm audit` после обновления зависимостей | 0 известных уязвимостей |
| macOS ARM64 packaging | `KOSHIRME-0.1.2-arm64.dmg` и ZIP созданы без подписи и notarization |

Основные исправления: сервер отвергает комнаты без ссылок; три поля используют одинаковую проверку; данные комнаты обновляются при навигации; данные аккаунта сбрасываются при выходе; статусы учеников немедленно обновляются при запуске/паузе; завершённую комнату нельзя поставить на паузу; новые версии установщиков доступны через download route; страница ожидания использует канонический адрес `/waiting` с учётом перенаправления Cloudflare; ошибочный JSON возвращает 400. Расширение разрешает локальный API только на loopback-адресах и поддерживает валидируемый порт сопряжения для разработки. Исправлены занятый фиксированный порт и устаревший снимок состояния в тестовой имитации Desktop.

Проверены экран создания комнаты на ширине 1440 и 390 px, нативное окно Electron. В интерфейсе убраны запрошенные подписи и упоминания привязки к конкретной платформе. Добавлены ссылка на fizmat.win, копирование кода и число готовых учеников.

## Границы этого прогона

Нативный тест `RUN_NATIVE_CAPTURE=1` пропущен: рабочий экран пользователя повторно не снимался. JPEG в тестах — тестовое изображение. Windows installer и работа на физическом Windows-ПК в этом прогоне не проверялись; Windows использует тот же обновлённый renderer. В Python-тестах остаются два предупреждения об устаревающих API тестовых библиотек, ошибок нет. Старые установленные приложения требуют обновления для получения нового дизайна и встроенного адреса.

---

# Предыдущая проверка (20 сентября 2026 года)

Проверено повторно 20 сентября 2026 года на macOS 26.5.2, Apple Silicon. Это результаты выполненных команд, а не обещание работы на любой конфигурации.

## Сборка и запуск

| Проверка | Результат |
| --- | --- |
| `npm run typecheck` | Пройдено: все workspaces и E2E tests, TypeScript strict |
| `npm run build` | Пройдено: Vue production, MV3 extension, Electron main/preload/renderer |
| `npm test` | 3/3: границы одного и нескольких разрешённых URL, удаление credentials/query/fragment |
| `npm audit` | 0 известных vulnerabilities на момент проверки |
| Backend `ruff check app migrations tests` | Пройдено |
| Backend `pytest -q` в локальной venv | 5/5, включая 3 URL, pause/resume/delete; два deprecation warnings тестовых библиотек |
| Backend `python -m pytest -q` в отдельном Docker-контейнере | 3/3, Python 3.12.14; те же два deprecation warnings, production DB не изменялась |
| Docker backend + PostgreSQL | Healthy, FastAPI на Python 3.12.14, PostgreSQL 17 |
| `GET /api/health` | 200, `status=ok` |
| `docker compose exec backend alembic check` | `No new upgrade operations detected` |
| Docker Admin | Production nginx, `/exams` доступен на порту 8080 |
| `npm run dev:desktop` | Автоматическая установка бинарника, Vite renderer 5174, настоящее Electron-окно |
| macOS packaging | Созданы `KOSHIRME-0.1.0-arm64.dmg` и `KOSHIRME-0.1.0-x64.dmg`, без signing/notarization |

Cloudflare D1 migration `0003_exam_controls.sql` применена к production: 9/9 прежних комнат получили `allowed_urls`, данные сохранены. Worker `koshirme` опубликован, `/api/health` и оба DMG download route отвечают HTTP 200. Headless production-проверка подтвердила KOSH!RME branding, переключение на казахский и отсутствие ошибок страницы.

Версии production Python dependencies зафиксированы в `apps/backend/requirements.lock`, npm dependencies — в корневом `package-lock.json`. Electron 44.3.0. Запуск `.app` из macOS installer отдельно не проверялся; нативные тесты запускали собранный `out/main/index.js` тем же Electron.

Dev launcher дополнительно проверен из окружения с `ELECTRON_RUN_AS_NODE=1`: wrapper удаляет этот флаг, Electron сообщает `KOSH!RME window ready`. Ручной дополнительный осмотр окна через Computer Use не выполнен: у инструмента отсутствовало разрешение Accessibility. Это отдельное разрешение инструмента, не Screen Recording permission KOSH!RME.

## End-to-end

После изменения интерфейсов повторно пройдены: dashboard **2/2**, реальный MV3 **1/1**, Electron **1/1** и полный native capture **1/1** с `RUN_NATIVE_CAPTURE=1`.

1. Teacher UI: создание и старт экзамена, живое событие/Toast/timeline, защищённый JPEG, PrimeVue Dialog, Finish, запрет событий после Finish.
2. Dashboard на узком viewport без горизонтального переполнения.
3. Настоящий Electron: Join, System Check, pairing, отклонение website Origin, проверка screen permission, Finish. Этот тест не снимает экран.
4. Настоящий MV3: `NEW_TAB`, `PAGE_HIDDEN`, `TAB_CHANGED`, запрос capture в Desktop, `RETURN_TO_EXAM`, `DESKTOP_GUARD_DISCONNECTED`, прекращение событий после Finish.
5. Полный нативный поток: явный Start в Electron → разрешённая вкладка без нарушений → смена вкладки → JPEG от `desktopCapturer` → backend → teacher Dialog. Отдельно проверено переключение фокуса в Electron и screenshot события `CHROME_FOCUS_LOST`. После Finish новые события не создаются.

В последнем полном прогоне просмотрен настоящий JPEG **57433 bytes, 1728×1080**; проверены JPEG signature, лимиты размера и dimensions. Permission уже был предоставлен ОС; тест не менял системные разрешения.

Локальная тестовая запись, пока сохранена текущая БД:

```text
/exam/4d558930-d645-47b9-a9b5-a24c326c9801/student/8b8103c0-6a1e-4ff0-b80e-0d8f12fc75d9
```

Тесты используют отдельные временные профили Chromium и локальные HTML fixtures по разрешённому origin. Реальный Yandex Contest не изменяется. Тестовые экзамены завершаются, но сохраняются в PostgreSQL для проверки результатов.

Для честной проверки видимости браузер тестов запускается отдельно, а Playwright подключается с `noDefaults: true`: обычный Playwright включает focus emulation и оставляет страницы видимыми после смены вкладки. Это особенность тестового окружения, не логика продукта. См. [официальный API Playwright](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults).

## Что ещё обязательно проверить вручную

- Chrome, установленный школой, реальный Yandex Contest и школьная сеть: [полный checklist](MANUAL_TESTING.md).
- Windows 10/11: installer, Screen Capture, Alt+Tab, минимизация, firewall.
- macOS: первый запрос permission, отказ/отзыв разрешения, packaged/signed app, Cmd+Tab и минимизация вручную. Автотест переключал настоящее OS-приложение программно, а не нажимал клавиши Cmd+Tab.
- Несколько физических дисплеев, разные DPI/scaling, подключение/отключение монитора, secure desktop/DRM.
- Отключение сети на уровне ОС, sleep/wake, выключение компьютера, длительный экзамен и много учеников.
- Signing/notarization, установщики DMG/NSIS на целевых устройствах и политика хранения screenshots перед школьным внедрением.

## Важные границы

Это не tamper-proof kiosk. Общий teacher key предназначен для контролируемого MVP; для публичного сервера нужны полноценная авторизация и HTTPS. Backend работает в одном процессе. Capture требует работающих Desktop/сети/permission; для близких high events действует cooldown 2 секунды, для disconnect screenshot недоступен. Risk score — индикатор, не доказательство списывания.


## Публикация 4 октября 2026

- Fizmat Contest: production D1 migration 0005 применена после приватного резервного экспорта; fizmat.win опубликован. Полный `npm test`: 48/48, включая реальные Docker-запуски C++, Python и Java, авторизацию, типы задач и удаление.
- KOSH!RME: backend и кабинет опубликованы на koshirme.stream. Инструкция `/guide.html` содержит восемь реальных снимков production-сайтов, Electron и Chrome Extension. Снимки сделаны на временных демонстрационных аккаунтах, затем данные удалены. Скрипт: `FizmatContest/scripts/capture-published-guide.mjs`.
- Проверка инструкции в настоящем Chromium при ширине 1440 и 390: HTTP 200, все восемь изображений загружаются, горизонтального переполнения и pageerror нет; публичные Telegram и email присутствуют.
- Chrome Extension 0.2.8: название «KOSH!RME · Көшірме», казахское короткое имя, инструкция, ссылки сайтов и контакты. Архив опубликован; обратное скачивание совпало с локальным SHA-256 `6ee70e8eb9498c7760b601076b10054083cabb4b35f349f3eaa03c5279bc15c5`. Chrome Web Store в этом выпуске не обновлялся.
- Windows x64 0.1.3: установщик опубликован без Authenticode-подписи; обратное скачивание 111364005 байт совпало с SHA-256 `dd5cc6723a09b7d6e668ae6b14126eb2f5267e2134678b2dedae19a980a73191`. Выполнение установщика и новый порядок захвата на реальном Windows не проверялись.


### macOS 0.1.3 — 5 октября 2026 (Алматы)

- Keychain profile `koshirme-notary` успешно использован без чтения и публикации пароля. Приложение подписано Developer ID Application команды T66KB5XLQ2. Apple приняла приложение: submission `3244fa72-4ad5-4177-825a-2dc75c0ae8ba`.
- `codesign --verify --deep --strict`, Gatekeeper execute и `stapler validate` приложения прошли. Реальный подписанный packaged executable запущен в отдельном временном профиле; отображается экран входа, версия 0.1.3. Мониторинг и захват экрана в этом smoke test не запускались.
- Сам DMG дополнительно подписан, принят Apple (submission `4a767b33-e7cb-4b2e-9de4-dcd374161454`) и stapled. `spctl --assess --type open --context context:primary-signature` вернул `accepted`, `source=Notarized Developer ID`. `stapler validate` и `hdiutil verify` прошли.
- Финальный SHA-256 DMG: `b620f9000a6ea68a30fa870c80c09c8db0044ae011cc0381f86dd6b8ca6876e8`. Архитектура ARM64 / Apple Silicon; Intel DMG в этом выпуске не создавался.
- Для следующих сборок включено `dmg.sign: true`; сценарий `dist:mac` при APPLE_KEYCHAIN_PROFILE также отправляет DMG в Apple, прикрепляет билет и проверяет Gatekeeper самого образа.

- Финальная публикация KOSH!RME: Worker `66440fb8-4617-48e1-99da-b7513f076fdf`. DMG скачан обратно с публичного URL: 126677897 байт, SHA-256 полностью совпал. Инструкция с macOS-ссылками повторно проверена при ширине 1440 и 390: HTTP 200, корректная подпись кнопки подключения и дата, переполнения и pageerror нет.
