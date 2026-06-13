# ShieldVPN GITHUB PRO 2.1

Структура проекта:

```text
ShieldVPN_GITHUB_PRO/
├─ docs/                  # сайт для GitHub Pages
│  ├─ index.html
│  └─ updates/version.json
├─ launcher/              # Electron Launcher: Установить / Обновить / Открыть
├─ client/                # Electron VPN Client + sing-box core
├─ .github/workflows/     # автоматическая сборка на GitHub Actions
├─ UPDATE_GITHUB_LINKS.cmd
└─ BUILD_ALL.cmd
```

## Что исправлено

- Лаунчер больше не показывает сырой `HTTP 404` как основную ошибку.
- Если клиент не установлен — кнопка `Установить приложение`.
- Если установлена старая версия — кнопка `Обновить приложение`.
- Если установлена последняя версия — кнопка `Открыть приложение`.
- Интерфейс лаунчера больше не обрезается: окно больше, адаптивная сетка, есть прокрутка.
- Основной клиент пишет `state.json`, чтобы лаунчер понимал установленную версию.
- Сайт подготовлен под GitHub Pages, а установщики — под GitHub Releases.

## Быстрая локальная сборка

1. Запусти `UPDATE_GITHUB_LINKS.cmd` и введи свой GitHub-логин и название репозитория.
2. Запусти `BUILD_ALL.cmd` от обычного пользователя. Если electron-builder опять ругается на symlink, запусти от имени администратора.
3. Готовые установщики появятся:

```text
client/dist/ShieldVPNClientSetup.exe
launcher/dist/ShieldVPNLauncherSetup.exe
```

## Где лежат ссылки обновлений

- `docs/index.html` — кнопка скачивания лаунчера.
- `docs/updates/version.json` — ссылка на клиент для лаунчера.
- `launcher/main.js` — ссылка на `version.json`.

## Важно про антивирус и SmartScreen

Нельзя честно «сделать так, чтобы Windows никогда не ругался» без подписи. Для публичного продукта нужен code-signing сертификат и репутация файла/издателя. Этот проект не содержит обхода защит Windows.

## Реальный VPN

Electron — это интерфейс. Реальный VPN делает `sing-box.exe`. `BUILD_ALL.cmd` скачивает официальный `sing-box.exe` и кладёт в:

```text
client/engines/sing-box.exe
```

Клиент поддерживает базовые форматы: `vless://`, `vmess://`, `trojan://`, `ss://`, subscription URL и готовый sing-box JSON.
