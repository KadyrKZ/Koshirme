# Запуск задания Codex

Репозиторий: https://github.com/KadyrKZ/Koshirme (приватный).

На Windows откройте клонированный проект в Codex и отправьте: «Прочитай docs/codex/WINDOWS.md и выполни задание до конца».
На Mac: «Прочитай docs/codex/MACOS.md и выполни задание до конца».

Подготовительные скрипты (из корня Koshirme):

- Windows: `powershell -NoProfile -File scripts/prepare-native-check.ps1`
- Mac: `bash scripts/prepare-native-check.sh`

Скрипты устанавливают зависимости, запускают автоматические тесты, собирают desktop и проверяют health обоих реальных серверов. Они не закрывают программы и не заменяют физическое испытание.

Desktop + расширение находятся в этом репозитории. Чтобы собирать сервер и сайт вместе, клонируйте https://github.com/KadyrKZ/FizmatContest в соседнюю папку FizmatContest, а этот репозиторий разместите как anti/examguard рядом с ней. Подробности: FizmatContest/docs/CLONE_WITH_KOSHIRME.md.

Ключи, пароли, cookies, БД, node_modules и сборки не входят в исходники. Проверку проводите с тестовыми аккаунтами на чистом рабочем столе.
