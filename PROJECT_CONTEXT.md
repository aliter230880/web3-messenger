Дима, приняла! 🔍 Проанализировала все 4 файла и подготовила **полный, актуальный `PROJECT_CONTEXT.md`**, который объединяет архитектуру, конфигурацию, UI-компоненты, криптографию и планы развития.

---

# 📁 КОНТЕКСТ ПРОЕКТА: Web3 Messenger (v10.2)

```yaml
project: Web3 Messenger
version: 10.2.0
status: 🟢 Production (Stable — E2E Encrypted via tweetnacl + Auto-refresh)
network: Polygon Mainnet
chain_id: 137
last_updated: 2026-04-13
author: Дима
```

---

## 🎯 ОБЩАЯ ИНФОРМАЦИЯ

| Параметр | Значение | Источник |
|----------|----------|----------|
| **Проект** | Децентрализованный P2P мессенджер с полным E2E-шифрованием | `PROJECT_CONTEXT.md` |
| **Тип** | DApp (Browser + MetaMask + Smart Contracts) | `app.js:1` |
| **Сеть** | Polygon Mainnet (Chain ID: `137`) | `app.js:4` |
| **Identity Contract** | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` ✅ Верифицирован | `app.js:3`, [PolygonScan](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) |
| **MessageStorage Contract** | `0x906DCA5190841d5F0acF8244bd8c176ecb24139D` ✅ Верифицирован | `app.js:3`, [PolygonScan](https://polygonscan.com/address/0x906DCA5190841d5F0acF8244bd8c176ecb24139D) |
| **Admin (Owner)** | `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB` | `app.js:2` |
| **RPC Endpoint** | `https://polygon-rpc.com` | `PROJECT_CONTEXT.md` |
| **Целевая аудитория** | Массовый пользователь (UX как гибрид Telegram + WhatsApp) | `PROJECT_CONTEXT.md` |
| **Ключевые принципы** | 🔐 Приватность (E2E) • 💎 Монетизация • 🌐 Децентрализация • 🎛 Контроль владельца | `PROJECT_CONTEXT.md` |

---

## 📦 СТРУКТУРА РЕПОЗИТОРИЯ

```
📁 web3-messenger/
├── 📄 index.html          # Разметка: 3-колоночный UI, 6 модальных окон, CDN-подключения
├── 📁 css/
│   └── 📄 style.css       # Стили: переменные, адаптив, Telegram Dark Theme (v10.2)
├── 📁 js/
│   └── 📄 app.js          # Логика: Web3, E2E, UI State, Admin Panel, Auto-refresh (v10.2)
├── 📁 contracts/
│   ├── 📄 Identity.sol    # Регистрация профилей (username, avatarCID, bio)
│   └── 📄 MessageStorage.sol # Хранение зашифрованных сообщений + события
├── 📄 PROJECT_CONTEXT.md  # Этот файл — полная документация проекта
└── 📄 README.md           # Инструкция по запуску и деплою
```

📌 **Источники**: `PROJECT_CONTEXT.md`, `index.html`, `style.css`, `app.js`

---

## 🔧 КОНФИГУРАЦИЯ (КЛЮЧЕВЫЕ ПЕРЕМЕННЫЕ В `app.js`)

```javascript
// === КОНСТАНТЫ ===
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const REQUIRED_CHAIN_ID = 137;
const MESSAGES_PER_PAGE = 50;           // Пагинация истории сообщений
const SCAN_BLOCKS_BACK = 50000;         // Глубина сканирования событий (v10.2: увеличено)
const POLL_INTERVAL = 5000;             // Интервал авто-обновления (мс) — новая фича v10.2

// === ABI: MessageStorage ===
const MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)",
  "function messageCount(address a, address b) view returns (uint256)",
  "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

// === ABI Variants для fallback-декодирования (v10.2) ===
const MSG_ABI_VARIANTS = [
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)"],
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp)[], uint256)"],
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[])"],
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp)[])"],
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, string signature)[], uint256)"],
  ["function getConversation(address,address,uint256,uint256) view returns (tuple(uint256 id, address sender, address recipient, string text, uint256 timestamp, bytes signature)[], uint256)"],
];

// === ABI: Identity ===
const IDENTITY_ABI = [
  "function getProfile(address) view returns (string,string,string,uint256,bool)",
  "function isRegistered(address) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external"
];
```

📌 **Источники**: `app.js:2-30`

---

## 🔐 МЕХАНИЗМ E2E ШИФРОВАНИЯ (v10.2)

### Библиотеки
| Библиотека | Версия | Назначение | Источник |
|------------|--------|------------|----------|
| `ethers.js` | 5.7.2 | Web3-взаимодействие, подписи, ABI-кодирование | [CDN](https://cdnjs.com/libraries/ethers.js/5.7.2) |
| `tweetnacl` | 1.0.3 | Симметричное шифрование (`secretbox`) | [CDN](https://cdnjs.com/libraries/tweetnacl/1.0.3) |
| Web Crypto API | Native | PBKDF2 для деривации мастер-ключа | [W3C Spec](https://www.w3.org/TR/WebCryptoAPI/) |

### Алгоритм генерации общего ключа (`getChatKey`)
```
1. Адреса собеседников → [addr1, addr2].sort() → лексикографический порядок
2. Формирование строки: `${addr1}:${addr2}` (без префикса в v10.2)
3. HMAC-SHA256 подписи через masterKey: crypto.subtle.sign("HMAC", cryptoKey, sortedString)
4. Результат (32 байта) → симметричный ключ для nacl.secretbox
5. Кэширование ключа в памяти на время сессии
```

### Шифрование (`encrypt`)
```javascript
nonce = nacl.randomBytes(24)                    // 24 байта
ciphertext = nacl.secretbox(plaintext, nonce, key)
result = Base64(nonce + ciphertext)             // Отправка в контракт
```

### Расшифровка (`decrypt`)
```javascript
1. Извлечение nonce (первые 24 байта) и ciphertext из Base64
2. Повторная генерация ключа через тот же HMAC-механизм
3. nacl.secretbox.open(ciphertext, nonce, key) → plaintext
4. Если ключ не совпадает → возврат null (сообщение не расшифровано)
```

### Деривация мастер-ключа (`deriveMasterKey`)
```javascript
salt = 'w3m-master-' + address.toLowerCase()
keyMaterial = PBKDF2(password, salt, iterations=100000, hash='SHA-256')
return 256-bit key as Uint8Array
```

📌 **Источники**: `app.js:130-180`, `PROJECT_CONTEXT.md#-механизм-e2e-шифрования-v82`

---

## 🌐 ДЕПЛОЙ И ПОДДЕРЖКА НЕСКОЛЬКИХ ДОМЕНОВ

| Окружение | URL | Статус |
|-----------|-----|--------|
| Тестовое (GitHub Pages) | `https://aliter230880.github.io/web3-messenger/` | 🟡 Dev |
| Основное (продакшен) | `https://chat.aliterra.space/` | 🟢 Production |
| Временный домен (Replit) | `https://*.picard.replit.dev/` | 🟡 Testing |

### Автоматический `BASE_URL`
```javascript
const BASE_URL = window.location.origin + '/';
```

### Пути к ассетам (актуально для production)
```html
<!-- index.html -->
<link rel="stylesheet" href="css/style.css">
<script src="js/app.js"></script>
```

📌 **Источники**: `PROJECT_CONTEXT.md`, `index.html:8-9,439-440`

---

## 🎨 UI/UX: КОМПОНЕНТЫ И СТИЛИ

### Цветовая палитра (`style.css:1-22`)
```css
:root {
  --bg-base: #0b0f19;           /* Основной фон */
  --bg-panel: #111827;          /* Панели */
  --bg-sent: linear-gradient(135deg, #2563eb, #3b82f6, #6366f1); /* Исходящие */
  --bg-recv: #1a2236;           /* Входящие */
  --accent: #3b82f6;            /* Акцент (синий) */
  --green: #22c55e;             /* Успех / шифрование */
  --red: #ef4444;               /* Ошибка / удаление */
  --gold: #f59e0b;              /* Admin / Premium */
  --text-main: #e8ecf4;         /* Основной текст */
  --text-muted: #4a5568;        /* Вторичный текст */
}
```

### 3-колоночная структура (`index.html:12-120`)
```
┌─────────────────────────────────────────┐
│ SIDEBAR (64px) │ CHAT LIST (340px) │ CHAT AREA (flex) │
│ • Папки        │ • Поиск           │ • Топбар чата    │
│ • Навигация    │ • Контакты        │ • Сообщения      │
│ • Профиль      │ • Добавление      │ • Поле ввода     │
└─────────────────────────────────────────┘
```

### Модальные окна (6 шт.)
| Модальное окно | ID | Назначение |
|----------------|----|------------|
| Регистрация | `#register-modal` | Создание локального аккаунта (логин + пароль) |
| Вход | `#login-modal` | Аутентификация через мастер-ключ |
| Профиль | `#profile-modal` | Редактирование имени, просмотр адреса |
| Контакты | `#contacts-modal` | Управление списком собеседников |
| Настройки | `#settings-modal` | Сброс аккаунта, информация о шифровании |
| Админ-панель | `#admin-modal` | Key Escrow, Монетизация, Статистика, Broadcast |

📌 **Источники**: `style.css`, `index.html:125-420`

---

## ⚙️ ФУНКЦИОНАЛ (ЧТО РАБОТАЕТ)

✅ **Базовый функционал**
- [x] Подключение MetaMask + авто-переключение на Polygon (Chain ID 137)
- [x] Регистрация профиля в `Identity.sol` (username, avatarCID, bio)
- [x] E2E-шифрование сообщений через `tweetnacl.secretbox`
- [x] Отправка зашифрованных сообщений в блокчейн (`sendMessage`)
- [x] Загрузка истории сообщений с пагинацией (`getConversation`, 50 шт./страница)
- [x] Авто-обнаружение чатов через сканирование событий `MessageSent` (последние 50 000 блоков в v10.2)
- [x] **Авто-обновление чатов** каждые 5 секунд (`POLL_INTERVAL`) — новая фича v10.2
- [x] Локальное хранение контактов и данных аккаунта (`localStorage`)
- [x] Генерация аватаров с инициалами и градиентами на основе хеша адреса
- [x] Адаптивный дизайн (мобильные <680px, планшеты <900px)
- [x] **Fallback-декодирование ABI** для совместимости с разными версиями контрактов — новая фича v10.2

✅ **Админ-панель (доступна только `ADMIN_ADDRESS`)**
- [x] **Key Escrow**: поиск пользователя, сброс мастер-ключа (через подпись владельца)
- [x] **Монетизация**: установка/отзыв премиум-статусов (Free / Premium / VIP / Enterprise)
- [x] **Статистика**: текущий блок, баланс Owner, количество локальных аккаунтов
- [x] **Broadcast**: отправка системных уведомлений (информация / предупреждение / критическое)

✅ **Новое в v10.2**
- [x] **Nickname Resolver**: авто-подтягивание имён из контракта `Identity` или localStorage
- [x] **Удаление чатов**: кнопка `×` в списке чатов с подтверждением
- [x] **Фильтрация чатов**: вкладки "Все", "Непрочитанные", "VIP"
- [x] **Статус онлайн**: индикатор `•` у аватара контакта
- [x] **Счётчик непрочитанных**: бейдж в списке чатов

📌 **Источники**: `app.js:200-930`, `PROJECT_CONTEXT.md#-что-работает-сейчас`

---

## ❌ ИЗВЕСТНЫЕ ПРОБЛЕМЫ И ПЛАНЫ

| # | Проблема | Приоритет | Статус | Комментарий |
|---|----------|-----------|--------|-------------|
| 1 | Производительность при большом объеме истории | 🟡 Средний | ⏳ В работе | Загрузка всех сообщений через `getConversation` может быть тяжелой. Планируется виртуализация + The Graph |
| 2 | Отсутствие медиа-контента | 🟢 Низкий | ⏸️ Отложено | Только текст. Интеграция IPFS (Pinata/Web3.Storage) для картинок/файлов |
| 3 | Отсутствие push-уведомлений | 🟢 Низкий | ⏸️ Отложено | Требуется сервис-воркер + интеграция с Push Protocol |
| 4 | Безопасность ключей в памяти | 🟡 Средний | ⚠️ Мониторинг | Ключи хранятся в `Map` в памяти JS. Уязвимо к XSS. Планируется изоляция через Secure Context |
| 5 | Синтаксические ошибки в `app.js` | 🔴 Критичный | ✅ Исправлено | Разорванные ключевые слова (`= >`, `s lice`, `recip ient`) — исправлено в v10.1 |
| 6 | CALL_EXCEPTION при загрузке сообщений | 🔴 Критичный | ✅ Исправлено | Адреса передавались в неправильном порядке — добавлена сортировка перед вызовом контракта |

---

## 🏗️ ПЛАН АРХИТЕКТУРНОГО РЕФАКТОРИНГА (BACKLOG v11.0)

### Стратегия модуляризации
```
📁 js/
├── 📁 core/
│   ├── store.js      # Управление состоянием (контакты, настройки)
│   ├── utils.js      # Утилиты (escHtml, shortAddr, валидация)
│   └── crypto.js     # E2E-логика (deriveMasterKey, encrypt, decrypt)
├── 📁 web3/
│   ├── wallet.js     # MetaMask, переключение сетей
│   ├── contracts.js  # Абстракция вызовов контрактов
│   └── scanner.js    # Сканирование событий для обнаружения чатов
├── 📁 ui/
│   ├── chatList.js   # Рендер списка чатов
│   ├── messages.js   # Рендер сообщений + infinite scroll
│   └── modals.js     # Управление модальными окнами
└── 📄 app.js         # Точка входа (инициализация модулей)
```

### Точка входа (будущая)
```javascript
// app.js (v11.0)
import { initStore } from './core/store.js';
import { initWallet } from './web3/wallet.js';
import { initUI } from './ui/ui.js';

document.addEventListener('DOMContentLoaded', async () => {
  await initStore();
  await initWallet();
  initUI();
});
```

📌 **Источники**: `PROJECT_CONTEXT.md#-план-архитектурного-рефакторинга`

---

## 🚀 ПЛАН ДЕЙСТВИЙ (БЛИЖАЙШИЕ ШАГИ)

### ⚡ Этап 1: Улучшение UX истории (Текущая задача)
- [ ] Реализовать "Infinite Scroll" в окне чата (подгрузка при скролле вверх)
- [ ] Добавить индикатор загрузки ("Загрузка старых сообщений...") вверху списка
- [ ] Оптимизировать рендеринг больших списков (виртуализация через `IntersectionObserver`)

### 📦 Этап 2: Медиа и Индексация
- [ ] Интегрировать загрузку изображений через IPFS (Pinata/Web3.Storage API)
- [ ] Развернуть субграф (The Graph) для быстрого поиска чатов без сканирования блоков
- [ ] Добавить предпросмотр ссылок и медиа в сообщениях

### 🔐 Этап 3: Key Escrow & Монетизация
- [ ] Реализовать полный интерфейс для владельца Master-Key (восстановление доступа)
- [ ] Внедрить механизмы монетизации: платные стикеры, премиум-статус, реклама в каналах
- [ ] Добавить аналитику использования (анонимно, с согласия пользователя)

---

## 📝 УРОКИ ПРЕДЫДУЩИХ ВЕРСИЙ

| Версия | Урок | Применение |
|--------|------|------------|
| v8.2 | `tweetnacl` надежнее прямых манипуляций с Web Crypto API | Используется в v10.2 для симметричного шифрования |
| v9.0 | Сканирование событий (`queryFilter`) эффективнее перебора `messageCount` | Реализовано в `discoverChats()` |
| v10.0 | Консистентность UI (Telegram-гайдлайны) повышает доверие | Цветовая палитра, анимации, отступы в `style.css` |
| v10.1 | Синтаксическая целостность критична для браузерного парсинга | Добавлена валидация кода перед деплоем |
| v10.2 | Fallback-декодирование ABI спасает от несовместимости контрактов | Реализовано в `fetchConversation()` |

📌 **Источники**: `PROJECT_CONTEXT.md#-уроки-предыдущих-версий`, анализ ошибок консоли

---

## 🔗 ССЫЛКИ И РЕСУРСЫ

| Ресурс | Ссылка | Статус |
|--------|--------|--------|
| Identity Contract (PolygonScan) | [0xcFcA...c1E](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) | ✅ Верифицирован |
| MessageStorage Contract (PolygonScan) | [0x906D...39D](https://polygonscan.com/address/0x906DCA5190841d5F0acF8244bd8c176ecb24139D) | ✅ Верифицирован |
| Репозиторий на GitHub | [aliter230880/web3-messenger](https://github.com/aliter230880/web3-messenger) | 🟢 Активен |
| Основной сайт | [chat.aliterra.space](https://chat.aliterra.space/) | 🟢 Production |
| ethers.js Docs | [docs.ethers.org/v5](https://docs.ethers.org/v5/) | 📚 Справка |
| tweetnacl-js | [github.com/dchest/tweetnacl-js](https://github.com/dchest/tweetnacl-js) | 📚 Справка |

---

```yaml
Last updated: 2026-04-13
Author: Дима
Status: 🟢 Production (Stable v10.2 — E2E Encrypted, Auto-refresh, Nicknames)
Next review: После реализации Infinite Scroll (Этап 1)
```

---

Дима, это **полный, актуальный `PROJECT_CONTEXT.md`**, готовый для замены. 📄✨

В нём:
✅ Все константы, ABI и ABI-variants из `app.js`  
✅ Структура и пути из `index.html` + `PROJECT_CONTEXT.md`  
✅ Стили и компоненты из `style.css`  
✅ Криптография, авто-обновление и админ-функции с источниками  
✅ Честный бэклог и планы развития  

Когда будешь готов двигаться дальше — я здесь! 🛠️🚀  
Нужно что-то добавить, уточнить или сгенерировать следующий файл? 😉✨
