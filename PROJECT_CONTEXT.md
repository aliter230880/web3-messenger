Дима, приняла! 🔍 Проанализировала все 4 файла и подготовила **единый, максимально полный и актуальный `PROJECT_CONTEXT.md`**. Он объединяет всю архитектуру, криптографию (включая нюансы v15), контракты, UI и логику админки.

Этот файл служит **Единым Источником Истины** для твоего проекта.

---

# 📁 КОНТЕКСТ ПРОЕКТА: Web3 Messenger (v15)

```yaml
project: Web3 Messenger
version: 15.0.0
status: 🟢 Production (Advanced E2E, Key Escrow, Social Registry)
network: Polygon Mainnet
chain_id: 137
last_updated: 2026-04-13
author: Дима
```

---

## 🎯 ОБЩАЯ ИНФОРМАЦИЯ

| Параметр | Значение | Источник |
|----------|----------|----------|
| **Проект** | Децентрализованный P2P мессенджер (Client-Side DApp) | `PROJECT_CONTEXT.md` |
| **Тип** | Serverless DApp (HTML/CSS/JS + Smart Contracts) | `app.js` |
| **Сеть** | Polygon Mainnet (Chain ID: `137`) | `app.js` |
| **Admin (Owner)** | `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB` | `app.js:2` |
| **Identity Contract** | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` ✅ | `app.js`, [PolygonScan](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) |
| **Message Contract (New)** | `0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb` 🆕 | `app.js:DEFAULT_MESSAGE_CONTRACT` |
| **Message Contract (Old)** | `0x906DCA5190841d5F0acF8244bd8c176ecb24139D` ⚠️ | `app.js:OLD_MESSAGE_CONTRACT` (поддержка сохранена) |
| **Key Escrow Contract** | `0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53` | `app.js:DEFAULT_ESCROW_CONTRACT` |
| **Social Registry** | `0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036` | `app.js` |
| **Репозиторий** | [github.com/aliter230880/web3-messenger](https://github.com/aliter230880/web3-messenger) | `PROJECT_CONTEXT.md` |

---

## 🏗️ АРХИТЕКТУРА И СТЕК

**Структура репозитория:**
```text
📁 web3-messenger/
├── 📄 index.html          # Структура UI (3 колонки, модалки)
├── 📁 css/
│   └── 📄 style.css       # Стили (Telegram Dark Theme v15)
├── 📁 js/
│   └── 📄 app.js          # Логика (Web3, E2E v13, Admin, Polling)
├── 📁 contracts/          # Solidity контракты (Identity, Messenger, Escrow, Social)
└── 📄 PROJECT_CONTEXT.md  # Текущий файл
```

**Технологии:**
*   **Frontend:** Vanilla JS (ES6+), HTML5, CSS3 (Variables).
*   **Web3:** `ethers.js` v5.7.2 (Provider, Signer, Contract, Interface).
*   **Crypto:** `tweetnacl` v1.0.3 (`nacl.box`, `nacl.secretbox`), `Web Crypto API` (PBKDF2, HMAC).
*   **Деплой:** GitHub Pages / Replit / Custom Domain.

---

## 🔐 КРИПТОГРАФИЯ (E2E v13)

### 1. Ключевая инфраструктура
*   **Master Key:** Деривация из пароля через `PBKDF2` (100k итераций, SHA-256). Используется для локальной шифровки сессионных данных.
*   **E2E KeyPair:** Детерминированная генерация пары ключей (DH) через подпись сообщения `"Web3Messenger-E2E-KeyPair-v1"` → SHA-256 хеш → `nacl.box.keyPair.fromSecretKey`.
*   **Обмен ключами:** Публичные ключи либо региструются в `PublicKeyRegistry`, либо **встраиваются в зашифрованные сообщения** (Fallback).

### 2. Формат сообщения (CipherText)
Входящие сообщения декодируются последовательно (каскадная расшифровка):
1.  **Формат v13 (DH + Встроенный PubKey):** `[0x01/0x02][pubkey:32][nonce:24][ciphertext]`. Позволяет расшифровать без реестра.
2.  **Формат v13 (Advanced):** `[0x03][pubkey:32][nonce:24][dh_box_len:2][dh_box][addr_box]`. Гибрид DH и адресного ключа.
3.  **Address Key (Fallback):** Ключ на основе `SHA256(addr1:addr2)`.
4.  **Legacy (Old):** Старые сообщения, зашифрованные PBKDF2-ключом (поддержка сохранена).

### 3. Безопасность
*   Сессионные ключи кэшируются в `sharedKeyCache` (Map) для производительности.
*   Пароли и MasterKey **никогда** не покидают устройство (хранятся только хеши или в памяти).

---

## ⚙️ ЛОГИКА ПРИЛОЖЕНИЯ (`app.js`)

### 🔹 Устойчивость к контрактам
Функция `fetchConversation` реализует **Resilient Decoding**:
1.  Пытается использовать ABI контракта.
2.  Если ошибка, перебирает массив `MSG_ABI_VARIANTS` (разные версии сигнатур).
3.  Если всё еще ошибка, использует `parseRawMessages` — парсинг "сырых" байт ответа контракта для извлечения текста и адресов вручную.
4.  Автоматически определяет тип контракта (New vs Old) по адресу.

### 🔹 Авто-обновление (Polling)
*   `POLL_INTERVAL`: 5000 мс (5 сек).
*   Проверяет новые сообщения (`checkNewMessages`) и сканирует события (`discoverChats`) батчами по 10 000 блоков.
*   Уведомления (Toasts) при входящих сообщениях в неактивном чате.

### 🔹 UI Фичи
*   **Аватары:** Поддержка градиентов и **кастомных SVG-аватаров** (24 варианта), выбор в профиле.
*   **Никнеймы:** Авто-резолвинг имен из `Identity.sol` кэшируется в `nicknameCache`.
*   **Шеринг:** Генерация ссылки `?contact=0x...` для приглашения собеседника.

---

## 👑 АДМИН-ПАНЕЛЬ (Admin Dashboard)

Доступна только для `ADMIN_ADDRESS`. Включает:

1.  **Key Escrow (Восстановление доступа):**
    *   Генерация Admin KeyPair.
    *   Просмотр зашифрованных ключей пользователей.
    *   **Расшифровка переписки:** Админ может восстановить MasterKey пользователя и прочитать историю любого чата.
    *   Экспорт Key Archive (JSON) со всеми ключами.
2.  **Управление контрактами:**
    *   Деплой новых контрактов (Message, Escrow, Registry) прямо из интерфейса.
    *   Смена адресов контрактов "на лету".
3.  **Монетизация:**
    *   Установка статусов: Free, Premium, VIP, Enterprise.
4.  **Broadcast:**
    *   Подписанная отправка системных уведомлений всем пользователям.

---

## 🎨 UI/UX КОМПОНЕНТЫ (`index.html` + `style.css`)

*   **Дизайн:** Telegram Dark Mode.
*   **Layout:** 3 колонки (Sidebar, ChatList, ChatArea).
*   **Адаптивность:** Мобильная версия (<680px) скрывает список чатов при открытом диалоге.
*   **Модальные окна:**
    *   `#register-modal` / `#login-modal`: Вход и генерация ключей.
    *   `#profile-modal`: Редактирование имени, выбор SVG-аватара.
    *   `#share-modal`: QR-код профиля, ссылки на соцсети (TG, WA, X, FB).
    *   `#admin-modal`: Вкладки Escrow, Контракты, Статистика, Broadcast.

---

## 📋 ПЛАН РАЗВИТИЯ (ROADMAP)

### 🟢 Сделано (v10 - v15)
*   [x] E2E шифрование (DH + Fallback).
*   [x] Админ-панель с полным доступом к данным (Key Escrow).
*   [x] Поддержка двух версий контракта сообщений (Old/New ABI).
*   [x] SVG-аватары и профиль пользователя.
*   [x] Авто-определение новых чатов и уведомления.

### 🟡 В работе / Планируется
*   [ ] **Infinite Scroll:** Подгрузка истории сообщений при скролле вверх.
*   [ ] **Медиа:** Отправка картинок/файлов через IPFS (Pinata).
*   [ ] **Push-уведомления:** Интеграция сервис-воркера.
*   [ ] **Голосовые сообщения:** Запись и шифрование аудио.

---

## ⚠️ ИЗВЕСТНЫЕ ОГРАНИЧЕНИЯ
1.  **Gas Fees:** Каждое сообщение — транзакция в сети Polygon (~0.001 MATIC).
2.  **Совместимость:** Сообщения, зашифрованные старыми версиями (v1-v11) *разными* пользователями, могут не расшифроваться без общего MasterKey (локальный баг старых версий).
3.  **Безопасность:** Ключи хранятся в `localStorage` и памяти JS. Уязвимо к XSS-атакам на устройстве пользователя.

---

## 🔗 ПОЛЕЗНЫЕ ССЫЛКИ

*   **Docs:** [ethers.org/v5](https://docs.ethers.org/v5/), [tweetnacl-js](https://github.com/dchest/tweetnacl-js)
*   **Contracts:** [Identity](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) | [Messages](https://polygonscan.com/address/0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb) | [Escrow](https://polygonscan.com/address/0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53)

---

```yaml
Last updated: 2026-04-13
Author: Дима
Status: 🟢 Production Ready (v15)
Next Review: После внедрения Infinite Scroll и Media Support
```

---

Дима, этот файл **полностью готов** к использованию в качестве `PROJECT_CONTEXT.md`. Он отражает реальное состояние кода (v15) с учетом всех последних правок. 📄✨

Скопируй и замени содержимое файла. Если нужно что-то добавить — я на связи! 🛠️🚀
