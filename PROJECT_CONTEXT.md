Обновлённый `PROJECT_CONTEXT.md` с объединением всех данных и актуализацией до версии **8.0**. Включает описание бесконечного скролла, автоопределения чатов, стиль Shadcn, а также полную информацию о шифровании.

```markdown
# 📁 КОНТЕКСТ ПРОЕКТА: Web3 Messenger (XMTP Mode)

---
project: Web3 Messenger
version: 8.0.0
network: Polygon Mainnet
chain_id: 137
contract_address: 0xcFcA16C8c38a83a71936395039757DcFF6040c1E
message_contract_address: 0x906DCA5190841d5F0acF8244bd8c176ecb24139D
key_registry_address: 0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737
admin_address: 0xB19aEe699eb4D2Af380c505E4d6A108b055916eB
rpc_url: https://polygon-rpc.com
last_updated: 2026-04-12
author: Дима
status: 🟢 Production (v8.0 – Infinite Scroll, Auto-discovery, Shadcn UI)
---

## 🎯 ОБЩАЯ ИНФОРМАЦИЯ

| Параметр | Значение |
|----------|----------|
| **Проект** | Web3 Messenger (XMTP Mode) |
| **Тип** | Децентрализованный мессенджер / соцсеть |
| **Сеть** | Polygon Mainnet (Chain ID: 137) |
| **Контракт идентичности** | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` ✅ Верифицирован |
| **Контракт сообщений** | `0x906DCA5190841d5F0acF8244bd8c176ecb24139D` ✅ Верифицирован |
| **Контракт ключей** | `0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737` ✅ Верифицирован |
| **Админ (Owner)** | `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB` |
| **Целевая аудитория** | Массовый пользователь (UX как гибрид Telegram + WhatsApp) |
| **Ключевые принципы** | Приватность • Монетизация • Децентрализация • Контроль владельца |

---

## 👤 ПРЕФЕРЕНЦИИ ПОЛЬЗОВАТЕЛЯ (Дима)

```yaml
style: Default
instruction: |
  • Роль: универсальный и разносторонний помощник
  • Skills: тайм-менеджмент, рассылки, маркетинг, автоматизация, кодинг, дизайн, генерация медиа
  • Атмосфера: рабочая, но дружественная; очаровательная девушка, дружелюбно, остроумно, с теплом
  • Эмодзи: 😊 😉 ✨ 💪 🚀 🔐 💬
  • Язык: русский
code_preference: |
  • Предпочитает полные коды файлов для прямой замены (index.html, app.js, style.css)
  • Не фрагментарные правки, а готовые к копированию блоки
ui_preference: |
  • 3-колоночная структура (как Telegram Desktop): Папки → Список чатов → Окно диалога
  • Тёмная тема, строгий премиальный дизайн (Shadcn/ui inspired)
  • Адаптив под мобильные устройства
```

---

## 🏗️ АРХИТЕКТУРА

```
┌─────────────────────────────────────┐
│          КЛИЕНТ (Web/Mobile)        │
│ • MetaMask (подпись + адрес)        │
│ • Web Crypto API (RSA+AES шифрование)│
│ • localStorage (приватный RSA-ключ) │
│ • UI: Shadcn-стиль, infinite scroll │
└─────────────────────────────────────┘
⇅
┌─────────────────────────────────────┐
│          ОФФЧЕЙН РЕЛЕИ              │
│ • Доставка сообщений (WebSocket)    │
│ • Кэширование медиа + CDN           │
│ • Индексация + Push-нотификации     │
│ • Контроль инфраструктуры (владелец)│
└─────────────────────────────────────┘
⇅
┌─────────────────────────────────────┐
│          ОНЧЕЙН (Polygon)           │
│ • Identity Contract (UUPS Proxy)    │
│ • MessageStorage Contract           │ ← Хранилище сообщений (подписанных)
│ • KeyRegistry Contract              │ ← Хранилище публичных RSA-ключей
│ • Регистрация профилей              │
│ • Группы/каналы (NFT-членство)      │
│ • Key Escrow (мастер-ключ владельца)│
│ • Маршрутизация платежей            │
└─────────────────────────────────────┘
```

---

## 🌐 ДЕПЛОЙ И ПОДДЕРЖКА НЕСКОЛЬКИХ ДОМЕНОВ

| Окружение | URL |
|-----------|-----|
| **Тестовое** (GitHub Pages) | `https://aliter230880.github.io/web3-messenger/` |
| **Основное** (продакшен) | `https://chat.aliterra.space/` |

**Автоматический `BASE_URL`**:
```javascript
const BASE_URL = window.location.origin + '/';
```
QR-коды, реферальные ссылки и кнопки «Поделиться» всегда ведут на актуальный домен.

---

## 📦 СТРУКТУРА РЕПОЗИТОРИЯ

```
📁 web3-messenger/
├── 📄 index.html
├── 📁 css/
│   └── 📄 style.css
├── 📁 js/
│   └── 📄 app.js
├── 📁 contracts/
│   ├── 📄 Identity.sol
│   ├── 📄 IdentityProxy.sol
│   ├── 📄 MessageStorage.sol
│   └── 📄 KeyRegistry.sol          # Контракт для хранения публичных ключей
├── 📄 PROJECT_CONTEXT.md
├── 📄 .gitignore
└── 📄 README.md
```

---

## 🔧 КОНФИГУРАЦИЯ (КЛЮЧЕВЫЕ ПЕРЕМЕННЫЕ)

```javascript
// js/app.js — Глобальные константы (v8.0)
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const KEY_REGISTRY_ADDRESS = "0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737";
const CHAIN_ID = 137;
const RPC_URL = "https://polygon-rpc.com";
const BASE_URL = window.location.origin + '/';
const MESSAGES_PER_PAGE = 30;        // для бесконечного скролла
const SCAN_BLOCKS_BACK = 10000;      // глубина сканирования новых сообщений

// ABI Identity
const IDENTITY_ABI = [
  "function isRegistered(address) view returns (bool)",
  "function registerProfile(string, string, string) external",
  "function getProfile(address) view returns (string, string, string, uint256, bool)"
];

// ABI MessageStorage
const MESSAGE_ABI = [
  "function sendMessage(address, string, bytes) external",
  "function getConversation(address, address, uint256, uint256) view returns (tuple(...)[] sent, tuple(...)[] received)",
  "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

// ABI KeyRegistry
const KEY_REGISTRY_ABI = [
  "function setPublicKey(bytes calldata) external",
  "function getPublicKey(address) external view returns (bytes memory)"
];
```

---

## ✍️ ПОДПИСЬ СООБЩЕНИЙ КОШЕЛЬКОМ

1. Пользователь вводит текст
2. Вызывается `signer.signMessage(text)` → подпись (65 байт)
3. Подпись сохраняется вместе с сообщением в контракте
4. В UI отображается значок 🔐

**Ключевой фрагмент:**
```javascript
async function signMessage(text) {
  return await signer.signMessage(text);
}
```

---

## 🆕 РЕАЛЬНАЯ ОТПРАВКА СООБЩЕНИЙ (ON-CHAIN STORAGE)

### 📜 Контракт `MessageStorage.sol`

**Адрес:** `0x906DCA5190841d5F0acF8244bd8c176ecb24139D`  
**Функции:**
- `sendMessage(address recipient, string text, bytes signature)`
- `getConversation(address userA, address userB, uint256 start, uint256 count)`
- Событие `MessageSent`

### 🔄 Процесс отправки и получения

1. Отправитель вызывает `sendMessage` с подписанным текстом.
2. Сообщение сохраняется в блокчейне.
3. Получатель вызывает `getConversation` и получает массив сообщений.
4. **Бесконечный скролл:** при прокрутке вверх подгружаются старые сообщения (пагинация через `startIndex`).

---

## 🔐 ШИФРОВАНИЕ СООБЩЕНИЙ (ГИБРИДНОЕ RSA + AES) – ДЕТАЛИ РЕАЛИЗАЦИИ

### 📜 Контракт `KeyRegistry.sol`

**Адрес в Polygon Mainnet:** `0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737`  
**Компилятор:** Solidity ^0.8.17  
**Верификация:** ✅ Успешно верифицирован на Polygonscan

```solidity
contract KeyRegistry {
    mapping(address => bytes) public publicKeys;
    event PublicKeySet(address indexed user, bytes publicKey);

    function setPublicKey(bytes calldata publicKey) external {
        require(publicKey.length > 0, "Empty key");
        publicKeys[msg.sender] = publicKey;
        emit PublicKeySet(msg.sender, publicKey);
    }

    function getPublicKey(address user) external view returns (bytes memory) {
        return publicKeys[user];
    }
}
```

### 🔑 Генерация и хранение ключей пользователя

При первом входе пользователя:

1. Генерируется пара RSA-OAEP (2048 бит) с помощью **Web Crypto API**.
2. Приватный ключ экспортируется в формате JWK и сохраняется в `localStorage`.
3. Публичный ключ экспортируется в формате `spki`, преобразуется в hex и отправляется в `KeyRegistry`.

```javascript
const keyPair = await crypto.subtle.generateKey(
  { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
  true, ["encrypt", "decrypt"]
);

const publicKeyHex = "0x" + Array.from(new Uint8Array(publicKeyBytes)).map(b => b.toString(16).padStart(2,'0')).join('');
await keyRegistry.setPublicKey(publicKeyHex);
```

### 🔒 Гибридное шифрование (отправка)

1. Получаем публичный RSA-ключ получателя из `KeyRegistry`.
2. Генерируем одноразовый AES-GCM ключ и случайный IV.
3. Шифруем текст сообщения алгоритмом AES-GCM.
4. Шифруем AES-ключ публичным RSA-ключом получателя.
5. Формируем JSON-объект: `{ ciphertext, encryptedKey, iv }` и отправляем его в `MessageStorage` (вместе с подписью).

```javascript
const encrypted = await hybridEncrypt(plaintext, recipient);
const encryptedJSON = JSON.stringify(encrypted);
const signature = await signMessage(encryptedJSON);
await msgContract.sendMessage(recipient, encryptedJSON, signature);
```

### 🔓 Расшифровка (получение)

1. Получаем зашифрованный JSON из контракта.
2. Парсим объект, извлекаем `encryptedKey`, `iv`, `ciphertext`.
3. С помощью своего приватного RSA-ключа (из `localStorage`) расшифровываем AES-ключ.
4. Расшифровываем сообщение алгоритмом AES-GCM.

```javascript
const encrypted = JSON.parse(message.text);
const plaintext = await hybridDecrypt(encrypted);
```

### 🧪 Проверка подписи

Подпись ставится поверх **зашифрованного JSON**, что гарантирует целостность и авторство зашифрованных данных. Получатель может верифицировать подпись, кликнув по значку 🔐.

---

## 🚀 НОВОЕ В ВЕРСИИ 8.0

### 🔄 Бесконечный скролл (Infinite Scroll)
- При прокрутке вверх автоматически подгружаются более старые сообщения.
- Используется `getConversation` с параметрами `startIndex` и `count = 30`.
- Состояние пагинации хранится в `store.pagination[chatId]`.

### 🔍 Автоопределение новых чатов
- Функция `scanForNewSenders()` сканирует события `MessageSent` за последние `SCAN_BLOCKS_BACK` блоков.
- Для каждого нового отправителя создаётся чат, даже если он не добавлен в контакты.
- Выполняется при старте и каждые 30 секунд.

### 🎨 UI в стиле Shadcn/ui
- Полностью переработанный CSS с использованием HSL-переменных.
- Плавные анимации, кольца фокуса, современные тени и скругления.
- Улучшенные модальные окна и тосты (как sonner).

---

## 🛡️ ADMIN UI & KEY ESCROW

Админ-панель доступна только владельцу (`ADMIN_ADDRESS`). Функция `accessEscrowKey()` позволяет извлечь зашифрованный мастер-ключ пользователя (в текущей версии – заглушка, в будущем будет интегрирована с контрактом).

---

## ✅ ЧТО РАБОТАЕТ (Status: ✅ Done)

- [x] Подключение MetaMask
- [x] Регистрация профиля в Identity
- [x] 3-колоночный UI (Shadcn-стиль)
- [x] 🔐 Подпись сообщений кошельком
- [x] 🆕 Отправка сообщений в блокчейн (MessageStorage)
- [x] 🆕 Загрузка сообщений из блокчейна
- [x] 🆕 Верификация подписи получателем
- [x] 🔐 **Гибридное шифрование (RSA + AES)**
- [x] 🔐 **Контракт KeyRegistry для хранения публичных ключей**
- [x] 🔐 **Автоматическая генерация RSA-ключей при первом входе**
- [x] 🛡️ Admin UI
- [x] Шеринг профиля, QR-коды
- [x] Поиск по чатам, контакты
- [x] Кнопка обновления чата
- [x] 🔥 **Бесконечный скролл (пагинация истории)**
- [x] 🔍 **Автоопределение новых чатов через события**

---

## ❌ ИЗВЕСТНЫЕ ПРОБЛЕМЫ (Priority Queue)

| # | Проблема | Приоритет | Локация |
|---|----------|-----------|---------|
| 1 | Нет индикатора 🔒 для зашифрованных сообщений | 🟡 Средний | `renderMessages` |
| 2 | Нет загрузки медиа (только текст) | 🟢 Низкий | `input-container` |
| 3 | Реальная интеграция `getEscrowedKey()` с контрактом | 🟡 Средний | `accessEscrowKey()` |

---

## 🎨 UI/UX СПЕЦИФИКАЦИИ

- **Тема:** Тёмная, HSL-переменные (`--background: 0 0% 7%`, `--primary: 217 91% 60%`).
- **Структура:** сайдбар (80px) → панель чатов (340px) → область сообщений (flex).
- **Анимации:** `fadeIn`, `slideDown`, `modalSlide`.
- **Адаптив:** скрытие/сужение панелей на мобильных.

---

## 🚀 СЛЕДУЮЩИЕ ШАГИ (Next Actions)

### 🔥 Приоритет 1 (Сейчас)
- [ ] Добавить индикатор 🔒 для зашифрованных сообщений
- [ ] Интегрировать загрузку медиа (IPFS)

### ⚡ Приоритет 2 (Неделя)
- [ ] Реализовать систему донатов
- [ ] Индексация через The Graph (для ускорения загрузки чатов)

### 📦 Приоритет 3 (Бэклог)
- [ ] Групповые чаты (NFT-членство)
- [ ] Push-уведомления через WebSocket

---

## 🔗 ССЫЛКИ И РЕСУРСЫ

| Ресурс | Ссылка |
|--------|--------|
| Identity (PolygonScan) | [0xcFcA...](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) |
| MessageStorage (PolygonScan) | [0x906D...](https://polygonscan.com/address/0x906DCA5190841d5F0acF8244bd8c176ecb24139D) |
| KeyRegistry (PolygonScan) | [0x075D...](https://polygonscan.com/address/0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737) |
| Репозиторий на GitHub | [aliter230880/web3-messenger](https://github.com/aliter230880/web3-messenger) |
| Основной сайт | [chat.aliterra.space](https://chat.aliterra.space/) |

---
**Last updated:** 2026-04-12  
**Автор:** Дима  
**Статус:** 🟢 Production (v8.0 – Infinite Scroll, Auto-discovery, Shadcn UI)
```

Теперь `PROJECT_CONTEXT.md` содержит всю актуальную информацию о проекте, включая новые фичи версии 8.0. 😊🔐
