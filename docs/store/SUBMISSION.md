# KOSH!RME Desktop для Microsoft Store

Продукт Partner Center `9NF81445616W` имеет тип MSIX/PWA. Его идентичность подтверждена на странице Product identity. Отображаемое имя пакета `KOSHIRME` совпадает с зарезервированным именем. Имя `MaratulyKadyr.KOSHIRME`, издатель `CN=EA66D633-6C63-45D2-86BE-440D652A6688`, отображаемое имя `Maratuly Kadyr`, PFN `MaratulyKadyr.KOSHIRME_dhvjgzjbfrr56`.

## Сборка

В Windows x64 установите Node.js 24, Python 3.12 и .NET Framework 4.8. Из корня репозитория запустите:

```powershell
npm ci
npm run typecheck
npm test
npm run dist:store --workspace @koshirme/student-desktop
```

Результат — `apps/student-desktop/release/store/KOSHIRME-0.1.9-x64-store.appx` и файл SHA-256. Для CI перенесите `docs/workflows/build-windows-store.yml` в `.github/workflows/build-windows-store.yml` через браузер GitHub под владельцем или отправьте Git с OAuth-токеном с правом `workflow`. Затем откройте Actions → Build Microsoft Store package → Run workflow. Тесты Windows запускаются до упаковки.

Lock-файл фиксирует electron-builder 26.15.3. В нём есть AppX target, отдельного MSIX target в Windows packager нет. Partner Center принимает `.appx` для данной заявки. Store подписывает одобренный пакет и распространяет обновления. Существующая подписанная сборка NSIS использует отдельную конфигурацию. Пакет требует Windows 10 build 19041 или новее и x64. [Загрузка пакетов в Partner Center](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages)

Манифест объявляет `runFullTrust` для обычного Win32-процесса Electron и поставляемого Win32-помощника. Установленная программа читает метаданные видимых окон своей сессии, отправляет штатные запросы закрытия, восстанавливает окно Chrome, принимает локальное подключение расширения и обращается к сервису по HTTPS. Ей требуется обычная учётная запись. Протокол `koshirme://` регистрируется через манифест. Store-конфигурация отключает метаданные electron-updater. Камера, микрофон и автозапуск в манифесте отсутствуют.

## Описание RU

KOSH!RME Desktop помогает школам проводить онлайн-контесты с контролем соблюдения правил. Установите приложение и расширение KOSH!RME для Google Chrome. Откройте назначенный контест на fizmat.win и подтвердите запуск приложения и согласие на мониторинг. Перед стартом сохраните работу в других приложениях. Коширме проверяет доступ к экрану при запуске и закрывает мешающие приложения после подтверждения.

Во время активной попытки расширение проверяет переключение вкладок, потерю фокуса окна Chrome и другие события, предусмотренные правилами контеста. При серьёзном нарушении Desktop может создать снимок экрана и передать его в панель уполномоченного преподавателя. Камера и микрофон не используются. Активный мониторинг приостанавливается вместе с контестом и заканчивается при его завершении. Для поддержки обратитесь к организатору контеста или напишите на kadyr.mind2002@gmail.com.

## Description EN

KOSH!RME Desktop helps schools supervise online contests. Install the desktop app and the KOSH!RME extension for Google Chrome. Open your assigned contest on fizmat.win, allow the site to open the app, and consent to monitoring. Save work in other apps before starting. KOSH!RME checks screen access when it opens and closes competing apps after confirmation.

During an active attempt, the extension checks tab switches, loss of Chrome window focus, and other events covered by contest rules. When a serious violation is recorded, the desktop app can capture a screenshot and send it to the authorized teacher dashboard. The app uses neither the camera nor the microphone. Active monitoring pauses with the contest and ends when it finishes. For support, contact your contest organizer or email kadyr.mind2002@gmail.com.

## Сипаттама KK

KOSH!RME Desktop мектептерге онлайн контест ережелерінің сақталуын бақылауға көмектеседі. Қолданбаны және Google Chrome браузеріне арналған KOSH!RME кеңейтімін орнатыңыз. fizmat.win сайтында берілген контесті ашып, қолданбаны іске қосуға және бақылауға келісіңіз. Бастамас бұрын басқа қолданбалардағы жұмысыңызды сақтаңыз. Көшірме ашылғанда экранға қол жеткізуді тексереді және растаудан кейін басқа қолданбаларды жабады.

Белсенді талпыныс кезінде кеңейтім қойындылардың ауысуын, Chrome терезесінің фокустан шығуын және контест ережелеріне қатысты басқа оқиғаларды тексереді. Елеулі бұзушылық тіркелсе, қолданба экран суретін түсіріп, оны рұқсаты бар мұғалімнің панеліне жібере алады. Камера мен микрофон қолданылмайды. Контест тоқтатылғанда бақылау үзіліп, контест аяқталғанда аяқталады. Көмек алу үшін контест ұйымдастырушысына немесе kadyr.mind2002@gmail.com мекенжайына хабарласыңыз.

## Notes for certification

KOSH!RME is a full-trust Win32 Electron app. During a consented contest, it checks visible apps in the Windows session, sends standard WM_CLOSE requests, and can restore Chrome focus. It starts the packaged helper with the current user's privileges. The Chrome extension communicates through an authenticated localhost WebSocket. A screenshot can be sent to an authorized teacher after a serious event during an active attempt. Use a test desktop with no personal data.

Test with a designated sample contest, a reviewer-only account, Google Chrome, and the KOSH!RME extension. Start from the contest page, approve the protocol launch and monitoring, switch tabs to trigger test evidence, and finish the test attempt. Provide the sample URL and disposable reviewer credentials in the private certification notes once available. Verify install, cold and warm protocol activation, first-time screen check, pause, resume, disconnect, restart, uninstall, update from a qualifying version, and Store installation on Windows 11 with Smart App Control. Keep product screenshots from a real test session with synthetic names.

## Конфиденциальность

[Политика Desktop, расширения и веб-панели](https://koshirme.stream/privacy-store.html) опубликована по подтверждённым сведениям оператора. Технические поля и условия доступа для Microsoft описаны выше. Годовой срок относится к снимкам и журналам мониторинга.
