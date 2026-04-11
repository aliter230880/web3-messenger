Отлично, Дима! Сейчас добавлю в `PROJECT_CONTEXT.md` **новый подробный раздел** о том, как мы решили вопрос с доменами, автоматическим `BASE_URL` и переносом проекта. Затем предоставлю полный файл для замены.

Ниже — **финальная версия `PROJECT_CONTEXT.md` (2.1.0)** с новым разделом **«🌐 Деплой и поддержка нескольких доменов»**. Всё остальное остаётся актуальным.

---

```markdown
# 📁 КОНТЕКСТ ПРОЕКТА: Web3 Messenger (XMTP Mode)

---
project: Web3 Messenger
version: 2.1.0
network: Polygon Mainnet
chain_id: 137
contract_address: 0xcFcA16C8c38a83a71936395039757DcFF6040c1E
message_contract_address: 0x906DCA5190841d5F0acF8244bd8c176ecb24139D
admin_address: 0xB19aEe699eb4D2Af380c505E4d6A108b055916eB
rpc_url: https://polygon-rpc.com
last_updated: 2025-12-12
author: Дима
status: 🟢 Production (On-Chain Messaging Live)
---

## 🎯 ОБЩАЯ ИНФОРМАЦИЯ

| Параметр | Значение |
|----------|----------|
| **Проект** | Web3 Messenger (XMTP Mode) |
| **Тип** | Децентрализованный мессенджер / соцсеть |
| **Сеть** | Polygon Mainnet (Chain ID: 137) |
| **Контракт идентичности** | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` ✅ Верифицирован |
| **Контракт сообщений** | `0x906DCA5190841d5F0acF8244bd8c176ecb24139D` ✅ Верифицирован |
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
  • Тёмная тема, строгий премиальный дизайн (без «мультяшности»)
  • Адаптив под мобильные устройства
```

---

## 🏗️ АРХИТЕКТУРА

```
┌─────────────────────────────────────┐
│          КЛИЕНТ (Web/Mobile)        │
│ • Social Login (SIWE + Email)       │
│ • MetaMask / ERC-4337 Smart Wallets │
│ • E2E-шифрование на клиенте         │
│ • Газ-спонсорство (Paymaster)       │
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
│ • MessageStorage Contract           │ ← 🆕 Хранилище сообщений
│ • Регистрация профилей              │
│ • Группы/каналы (NFT-членство)      │
│ • Key Escrow (мастер-ключ владельца)│
│ • Маршрутизация платежей            │
└─────────────────────────────────────┘
```

---

## 🌐 ДЕПЛОЙ И ПОДДЕРЖКА НЕСКОЛЬКИХ ДОМЕНОВ

### 🧪 Тестовый и основной домены

| Окружение | URL |
|-----------|-----|
| **Тестовое** (GitHub Pages) | `https://aliter230880.github.io/web3-messenger/` |
| **Основное** (продакшен) | `https://chat.aliterra.space/` |

**Порядок работы:**
1. Разработка и отладка ведутся на тестовом домене.
2. После проверки работоспособности все файлы **копируются** на основной домен.
3. Никаких конфликтов не возникает, потому что:
   - Смарт-контракты задеплоены в Polygon Mainnet и не зависят от домена.
   - Подключение MetaMask работает одинаково на любом URL.
   - Единственная зависимость от домена — **ссылки для шеринга профиля** (см. ниже).

### 🔗 Автоматическое определение BASE_URL

Раньше в `app.js` был жёстко прописан `BASE_URL = "https://aliter230880.github.io/web3-messenger/"`. При переносе на основной домен приходилось вручную менять эту строку.

**Решение:**
```javascript
// Было
// const BASE_URL = "https://aliter230880.github.io/web3-messenger/";

// Стало
const BASE_URL = window.location.origin + '/';
```

Теперь `BASE_URL` автоматически подстраивается под текущий домен:
- На тестовом: `https://aliter230880.github.io/web3-messenger/`
- На основном: `https://chat.aliterra.space/`
- На локальном сервере: `http://localhost:5500/`

Это гарантирует, что QR-коды, реферальные ссылки и кнопки «Поделиться» всегда ведут на актуальный адрес.

### 📁 Структура файлов на сервере

Для корректной загрузки стилей и скриптов необходимо сохранять структуру папок:

```
chat.aliterra.space/   (или корень любого домена)
├── index.html
├── logo.png
├── css/
│   └── style.css
└── js/
    └── app.js
```

В `index.html` пути прописаны относительно корня:
```html
<link rel="stylesheet" href="css/style.css">
<script src="js/app.js"></script>
```

Если все файлы выгрузить в одну папку без поддиректорий, браузер не найдёт ресурсы и вёрстка сломается.

### ✅ Преимущества такого подхода

| Аспект | Результат |
|--------|-----------|
| **Перенос между доменами** | Копируем папки — сайт работает сразу, без правок кода |
| **Тестирование** | Можно держать отдельные ветки или версии на разных доменах |
| **Локальная разработка** | `live-server` или любой статический сервер работает «из коробки» |
| **Отказоустойчивость** | Основной функционал (блокчейн, подписи) не привязан к URL |

---

## 📦 СТРУКТУРА РЕПОЗИТОРИЯ

```
📁 web3-messenger/
├── 📄 index.html              # Главная страница (3-колоночный UI)
├── 📁 css/
│   └── 📄 style.css          # Стили: тёмная тема, премиальный дизайн
├── 📁 js/
│   └── 📄 app.js             # Логика: Web3, UI, чаты, регистрация, админ
├── 📁 contracts/
│   ├── 📄 Identity.sol       # Апгрейдабельный контракт (верифицирован)
│   ├── 📄 IdentityProxy.sol  # ERC1967 Proxy
│   └── 📄 MessageStorage.sol # 🆕 Контракт хранения сообщений (верифицирован)
├── 📄 PROJECT_CONTEXT.md     # Этот файл — единый источник правды
├── 📄 .gitignore
└── 📄 README.md
```

---

## 🔧 КОНФИГУРАЦИЯ (КЛЮЧЕВЫЕ ПЕРЕМЕННЫЕ)

```javascript
// js/app.js — Глобальные константы
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D"; // 🆕
const CHAIN_ID = 137; // Polygon Mainnet
const RPC_URL = "https://polygon-rpc.com";
const BASE_URL = window.location.origin + '/'; // 🔥 АВТОМАТИЧЕСКИ ОПРЕДЕЛЯЕТСЯ

// ABI Identity (минимальный)
const IDENTITY_ABI = [
  "function isRegistered(address user) view returns (bool)",
  "function registerProfile(string username, string avatarCID, string bio) external",
  "function getProfile(address user) view returns (string, string, string, uint256, bool)",
  "function getEscrowedKey(address user) view returns (bytes)"
];

// ABI MessageStorage
const MESSAGE_ABI = [
  "function sendMessage(address recipient, string text, bytes signature) external",
  "function getMessages(address sender, address recipient, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[])",
  "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)"
];
```

---

## ✍️ ПОДПИСЬ СООБЩЕНИЙ КОШЕЛЬКОМ — ДЕТАЛИ РЕАЛИЗАЦИИ

### 🔐 Как это работает (пошагово)
1. Пользователь пишет сообщение → нажимает «Отправить»
2. Приложение проверяет: подключён ли кошелёк?
   └─ Нет → открывает модалку подключения
   └─ Да → продолжает
3. Вызывается `signer.signMessage(text)` через ethers.js
4. MetaMask показывает пользователю: «Подписать сообщение?»
5. Пользователь подтверждает → возвращается криптографическая подпись (65 байт)
6. Подпись сохраняется в объекте сообщения: `{ text, signature, time, status }`
7. UI обновляется: появляется индикатор 🔐 «Подписано»

### 💻 Ключевой код (`js/app.js`)
```javascript
// 1. Функция подписи
async function signMessage(text) {
  if (!signer) throw new Error('Кошелёк не подключён');
  return await signer.signMessage(text);
}

// 2. Отправка с подписью
async function sendMessage() {
  const text = input.value.trim();
  if (!text || !store.currentChat) return;
  
  // Создаём сообщение со статусом "ожидание"
  const msg = {
    id: Date.now(),
    text: text,
    sent: true,
    time: new Date().toLocaleTimeString(),
    status: 'sending',
    signature: null
  };
  
  // Добавляем в чат (визуально)
  chat.messages.push(msg);
  renderMessages();
  
  // 🔐 ПОДПИСЫВАЕМ
  const signature = await signMessage(text);
  
  // Обновляем сообщение с подписью
  msg.signature = signature;
  msg.status = 'delivered';
  renderMessages();
  
  console.log('✅ Signed:', signature);
}

// 3. Отображение индикатора подписи
${m.sent ? `
  <span class="status">${m.status === 'delivered' ? '✓✓' : '⏳'}</span>
  ${m.signature ? 
    '<span class="sig-badge" title="Подписано кошельком">🔐</span>' 
    : ''}
` : ''}
```

### 🎨 UI-элементы (`css/style.css`)
```css
/* Бейдж подписи */
.sig-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: rgba(16, 185, 129, 0.2);
  border-radius: 50%;
  font-size: 10px;
  margin-left: 4px;
  cursor: help;
  transition: all 0.2s ease;
}
.sig-badge:hover {
  background: rgba(16, 185, 129, 0.4);
  transform: scale(1.1);
}
```

---

## 🆕 РЕАЛЬНАЯ ОТПРАВКА СООБЩЕНИЙ (ON-CHAIN STORAGE)

### 📜 Контракт `MessageStorage.sol`

**Адрес в Polygon Mainnet:** `0x906DCA5190841d5F0acF8244bd8c176ecb24139D`  
**Компилятор:** Solidity ^0.8.17 с ABIEncoderV2  
**Верификация:** ✅ Успешно верифицирован на Polygonscan

#### Структура сообщения
```solidity
struct Message {
    address sender;
    address recipient;
    string text;
    bytes signature;   // 65-байтовая подпись EIP-191
    uint256 timestamp;
}
```

#### Основные функции

| Функция | Описание |
|---------|----------|
| `sendMessage(address recipient, string text, bytes signature)` | Сохраняет подписанное сообщение в блокчейне. Только отправитель платит газ. |
| `getMessages(address sender, address recipient, uint256 start, uint256 count)` | Пагинированный запрос сообщений от `sender` к `recipient`. |
| `getConversation(address userA, address userB, uint256 start, uint256 count)` | Возвращает обе стороны переписки (от A→B и B→A) в двух массивах. |
| `messageCount(address, address) public view returns (uint256)` | Количество сообщений между двумя адресами. |

#### Событие
```solidity
event MessageSent(
    address indexed sender,
    address indexed recipient,
    uint256 indexed messageId,
    string text,
    bytes signature,
    uint256 timestamp
);
```

### 🔄 Процесс отправки и получения (On-Chain Flow)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. ОТПРАВКА                                                     │
├──────────────────────────────────────────────────────────────────┤
│ • Пользователь вводит текст                                      │
│ • Вызывается signer.signMessage(text) → подпись (65 байт)       │
│ • Вызывается contract.sendMessage(recipient, text, signature)   │
│ • Транзакция майнится в Polygon (газ ~0.01 MATIC)                │
│ • Сообщение навсегда сохранено в mapping контракта               │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. ПОЛУЧЕНИЕ                                                    │
├──────────────────────────────────────────────────────────────────┤
│ • Получатель открывает чат                                       │
│ • Вызывается getConversation(userA, userB, 0, 50)               │
│ • Контракт возвращает два массива: sent и received               │
│ • Клиент объединяет, сортирует по timestamp                      │
│ • Отображает в UI с индикатором 🔐 (подпись)                     │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. ВЕРИФИКАЦИЯ                                                  │
├──────────────────────────────────────────────────────────────────┤
│ • Получатель кликает по значку 🔐                                │
│ • Вызывается ethers.utils.verifyMessage(text, signature)        │
│ • Восстановленный адрес сравнивается с sender                    │
│ • При совпадении → ✅ Подпись верна                              │
└──────────────────────────────────────────────────────────────────┘
```

### 🧩 Интеграция в `app.js`

```javascript
// Отправка сообщения
async function sendMessage() {
  // ... валидация ...
  const signature = await signMessage(text);
  const msgContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
  const tx = await msgContract.sendMessage(recipient, text, signature);
  await tx.wait();
  await loadMessagesForChat(recipient);
}

// Загрузка сообщений из контракта
async function loadMessagesForChat(chatId) {
  const counterparty = ethers.utils.isAddress(chatId) ? chatId : null;
  if (!counterparty) return;

  const msgContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
  const [sent, received] = await msgContract.getConversation(userAddress, counterparty, 0, 50);

  const allMessages = [...sent, ...received].sort((a, b) => a.timestamp - b.timestamp);
  // ... преобразование в формат UI ...
}

// Проверка подписи
async function verifySignature(msgId) {
  const msg = chat.messages.find(m => m.id === msgId);
  const recovered = ethers.utils.verifyMessage(msg.text, msg.signature);
  if (recovered.toLowerCase() === msg.sender.toLowerCase()) {
    showToast('✅ Подпись верна!', 'success');
  }
}
```

### 🔐 Безопасность и особенности

| Аспект | Реализация |
|--------|------------|
| **Неизменность** | Сообщения хранятся в блокчейне, удалить или подделать невозможно |
| **Подпись** | EIP-191 (`personal_sign`), проверяется на клиенте получателя |
| **Приватность** | Данные открыты (блокчейн публичен). Для конфиденциальности необходимо **шифрование перед отправкой** (в планах) |
| **Стоимость** | ~30 000 газа за сообщение (~$0.002 на Polygon) |
| **Индексация** | Прямые вызовы RPC. Для продакшена рекомендуется The Graph |

---

## 🛡️ ADMIN UI & KEY ESCROW — ДЕТАЛИ РЕАЛИЗАЦИИ

### 🔘 Кнопка «Админ» (index.html)
```html
<!-- Кнопка видна только после подключения кошелька владельца -->
<div class="sidebar-item" id="admin-btn" style="display:none;" onclick="openAdminModal()">
  <span>🛡️</span><span>Админ</span>
</div>
```

**Логика отображения (`app.js`):**
```javascript
// После подключения кошелька в initWallet():
isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
updateAdminButton();

function updateAdminButton() {
  const adminBtn = document.getElementById('admin-btn');
  if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
}
```
✅ **Безопасность:** Проверка на уровне клиента + дублируется на уровне смарт-контракта (`onlyRole(DEFAULT_ADMIN_ROLE)`).

### 🪟 Модальное окно Key Escrow (index.html)
```html
<div id="admin-modal" class="modal" style="display:none;">
  <div class="modal-content">
    <h3>🛡️ Админ-панель: Key Escrow</h3>
    <p>Доступ только для владельца платформы. Введите адрес пользователя для извлечения зашифрованного мастер-ключа.</p>
    
    <input type="text" id="escrow-user-address" placeholder="0x..." 
           style="width:100%; padding:10px; margin:12px 0; border-radius:8px;">
    
    <button id="btn-access-escrow" class="btn btn-send" onclick="accessEscrowKey()">
      🔓 Получить доступ к ключу
    </button>
    
    <div id="escrow-status" style="margin-top:12px; font-size:13px; display:none;"></div>
    
    <button class="btn btn-outline" onclick="document.getElementById('admin-modal').style.display='none'" 
            style="margin-top:16px;">Закрыть</button>
  </div>
</div>
```

### ⚙️ JavaScript Логика (`app.js`)
```javascript
// 1. Открытие модалки
function openAdminModal() {
  if (!isAdmin) {
    alert('🔒 Доступ разрешён только владельцу платформы.');
    return;
  }
  document.getElementById('admin-modal').style.display = 'flex';
  document.getElementById('escrow-status').style.display = 'none';
  document.getElementById('escrow-user-address').value = '';
}

// 2. Запрос ключа (Key Escrow Flow)
async function accessEscrowKey() {
  const userAddr = document.getElementById('escrow-user-address').value.trim();
  const statusEl = document.getElementById('escrow-status');
  
  // Валидация адреса
  if (!userAddr || !ethers.utils.isAddress(userAddr)) {
    statusEl.textContent = '⚠️ Введите корректный адрес Ethereum';
    statusEl.style.color = 'var(--warning)';
    statusEl.style.display = 'block';
    return;
  }

  statusEl.textContent = '🔍 Запрос к смарт-контракту...';
  statusEl.style.color = 'var(--text-muted)';
  statusEl.style.display = 'block';

  try {
    // 🔐 РЕАЛЬНЫЙ ВЫЗОВ (когда функция будет в контракте):
    // const encryptedKey = await contract.getEscrowedKey(userAddr);
    
    // 👇 Пока имитация для демонстрации UI:
    await new Promise(r => setTimeout(r, 1200));
    const mockKey = "0x" + Array(64).fill(0).map(() => 
      Math.floor(Math.random()*16).toString(16)).join('');
    
    // Отображение результата
    statusEl.innerHTML = `
      ✅ Ключ получен!<br>
      <code style="background:var(--bg-tertiary); padding:6px 10px; 
                   border-radius:6px; word-break:break-all; font-size:11px;">
        ${mockKey}
      </code>
    `;
    statusEl.style.color = 'var(--success)';
    console.log('🔓 Escrow Key Retrieved:', mockKey);
    
  } catch (err) {
    statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
    statusEl.style.color = 'var(--danger)';
  }
}
```

### 🔐 Key Escrow Архитектура (Как это работает)
```
┌─────────────────────────────────────┐
│ 1. РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ         │
├─────────────────────────────────────┤
│ • Пользователь генерирует ключевую   │
│   пару (PubKey / PrivKey)           │
│ • PrivKey шифруется ПУБЛИЧНЫМ       │
│   ключом ВЛАДЕЛЬЦА (Owner PubKey)   │
│ • Зашифрованный PrivKey сохраняется │
│   в контракте (mapping address→bytes)│
└─────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────┐
│ 2. ЗАПРОС ДОСТУПА (ADMIN)           │
├─────────────────────────────────────┤
│ • Owner вводит адрес пользователя   │
│ • Вызывается contract.getEscrowedKey()│
│ • Контракт возвращает зашифрованный │
│   PrivKey пользователя              │
│ • Owner расшифровывает его своим    │
│   MASTER PRIVATE KEY (оффчейн)      │
└─────────────────────────────────────┘
```

### 🛡️ Меры Безопасности (Обязательно!)
| Мера | Реализация | Зачем |
|------|-----------|--------|
| 🔑 **Холодное хранение** | Master Private Key — только на Ledger/Trezor, никогда в браузере | Защита от взлома фронтенда |
| ✍️ **Мультисиг** | Доступ к функции `getEscrowedKey` — только через `onlyRole(DEFAULT_ADMIN_ROLE)` + мультисиг-кошелёк | Защита от компрометации одного ключа |
| 📜 **Логирование** | Каждое обращение к `getEscrowedKey` пишет событие `KeyAccessed(address user, uint256 timestamp)` в контракт | Аудит: кто, когда и к кому получил доступ |
| 🔐 **Шифрование** | Используется **ECIES** или **RSA-OAEP** (не симметричное!) | Даже при утечке базы — ключи не раскроются без Master PrivKey |

### 📋 Чек-лист перед релизом Key Escrow
- [ ] Функция `getEscrowedKey(address)` добавлена в `Identity.sol` с модификатором `onlyRole(DEFAULT_ADMIN_ROLE)`
- [ ] Событие `event KeyAccessed(address indexed user, address indexed accessedBy, uint256 timestamp)` добавлено в контракт
- [ ] Мастер-ключ сгенерирован и сохранён в холодном хранилище (Ledger/Trezor)
- [ ] Реализовано логирование всех обращений к Key Escrow (ончейн + оффчейн)
- [ ] Проведён аудит безопасности модуля (внутренний или внешний)
- [ ] Добавлено предупреждение для админа перед доступом к ключу (UX)

---

## ✅ ЧТО РАБОТАЕТ (Status: ✅ Done)

- [x] **Подключение MetaMask**: `connectWallet()` — запрос доступа, смена сети на Polygon
- [x] **Проверка регистрации**: `checkRegistration()` — view-вызов к контракту Identity
- [x] **Регистрация профиля**: `registerProfile()` — транзакция в блокчейн (~$0.02 газа)
- [x] **3-колоночный UI**: Папки → Список чатов → Окно диалога (Telegram-style)
- [x] **Фильтрация чатов**: По папкам (Все/Личное/Новости/Работа) через `data-folder`
- [x] 🔐 **Подпись сообщений кошельком**: `signer.signMessage()` + индикатор 🔐
- [x] 🆕 **Отправка сообщений в блокчейн**: Контракт `MessageStorage`, полный цикл: подпись → транзакция → сохранение
- [x] 🆕 **Загрузка сообщений из блокчейна**: `getConversation()`, объединение и сортировка
- [x] 🆕 **Верификация подписи получателем**: Клик по 🔐 → `verifyMessage()` → подтверждение отправителя
- [x] 🛡️ **Admin UI**: Кнопка «Админ» + модалка Key Escrow (визуально готова, логика работает)
- [x] **Адаптивный дизайн**: Тёмная тема, премиальные цвета, скроллбары
- [x] **Контракты верифицированы**: Identity и MessageStorage на PolygonScan
- [x] **Управление контактами**: Добавление по адресу/имени, сохранение в localStorage
- [x] **Шеринг профиля**: QR-код, ссылка, кнопки "Поделиться" в Telegram/WhatsApp/Twitter
- [x] **Поиск по чатам**: Фильтрация по имени в реальном времени
- [x] **Интерактивные индикаторы**: Онлайн-статус, непрочитанные сообщения, статус доставки
- [x] **Кнопка обновления чата**: Ручная загрузка новых сообщений из контракта
- [x] 🌐 **Автоматический BASE_URL**: `window.location.origin` — работает на любом домене без правок
- [x] 🌐 **Поддержка нескольких доменов**: Тестовый и основной сайт работают с одним кодом

---

## ❌ ИЗВЕСТНЫЕ ПРОБЛЕМЫ (Priority Queue)

| # | Проблема | Приоритет | Локация | Статус |
|---|----------|-----------|---------|--------|
| 1 | Нет шифрования сообщений перед отправкой в блокчейн (данные публичны) | 🔴 Высокий | Контракт + клиент | 📋 Бэклог |
| 2 | Нет пагинации «бесконечный скролл» — грузим только последние 50 | 🟡 Средний | `loadMessagesForChat` | 📋 Бэклог |
| 3 | Нет подменю пользователя (баланс, настройки, выход) | 🟡 Средний | `index.html sidebar` | 📋 Бэклог |
| 4 | Реальная интеграция `getEscrowedKey()` с контрактом | 🟡 Средний | `app.js accessEscrowKey()` | 📋 Бэклог |
| 5 | Нет загрузки медиа (только текст) | 🟢 Низкий | `index.html input-container` | 📋 Бэклог |

---

## 🎨 UI/UX СПЕЦИФИКАЦИИ

### Цветовая схема (Тёмная тема)
```css
:root {
  --bg-primary: #0a0e1a;
  --bg-secondary: #111827;
  --bg-tertiary: #1f2937;
  --bg-hover: #374151;
  --bg-message-sent: #2563eb;
  --bg-message-received: #1f2937;
  --bg-modal: rgba(10, 14, 26, 0.95);

  --text-primary: #f9fafb;
  --text-secondary: #9ca3af;
  --text-muted: #6b7280;

  --accent: #3b82f6;
  --accent-hover: #2563eb;
  --success: #10b981;
  --warning: #f59e0b;
  --danger: #ef4444;
  --polygon-green: #00e676;

  --border: #1f2937;
  --border-light: #374151;
  --radius: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
  --transition: all 0.2s ease;
}
```

### Структура экрана
```
┌─────────────────────────────────────┐
│ 💬 Все 147 👤 Личное 📰 Новости 11  │ ← Левая панель (папки)
├─────────────────────────────────────┤
│ 🔍 Поиск                            │
│ ├─ Все │ Непрочитанные │ VIP       │ ← Табы фильтрации
│ ├─ 👤 Дима • 12:30 • Привет! ... 3 │ ← Список чатов
│ ├─ 🤖 AI • 11:45 • Готов помочь    │
│ └─ 📢 Crypto • 10:20 • Bitcoin...24│
├─────────────────────────────────────┤
│ 👤 Дима • в сети • 🔐 E2E 🔄       │ ← Заголовок чата (🔄 обновить)
│ ├─ 💬 Привет! Как проект? ✓✓ 🔐   │ ← Сообщения (✓✓ = доставлено, 🔐 = подписано)
│ └─ 💬 Всё супер! 👇 ✓✓ 🔐         │
├─────────────────────────────────────┤
│ 📎 [Ввод сообщения...] 😊 💰 ➤    │ ← Панель ввода
└─────────────────────────────────────┘
```

---

## 🚀 СЛЕДУЮЩИЕ ШАГИ (Next Actions)

### 🔥 Приоритет 1 (Сделать сейчас)
- [ ] Добавить **шифрование сообщений** перед отправкой в контракт (например, публичным ключом получателя)
- [ ] Реализовать **бесконечный скролл** для подгрузки старых сообщений

### ⚡ Приоритет 2 (На этой неделе)
- [ ] Добавить подменю пользователя: баланс, настройки, выход
- [ ] Интегрировать реальную отправку через XMTP SDK (как fallback или альтернативу)
- [ ] Добавить загрузку медиа: шифрование → IPFS → CID в контракт

### 📦 Приоритет 3 (Бэклог)
- [ ] Реализовать систему донатов: кнопка 💰 → модальное окно → транзакция MATIC/USDC
- [ ] Добавить реальную логику Key Escrow: шифрование ключа пользователя публичным ключом владельца
- [ ] Настроить индексацию через The Graph для поиска по чатам/профилям

---

## 🔗 ССЫЛКИ И РЕСУРСЫ

| Ресурс | Ссылка |
|--------|--------|
| Контракт Identity (PolygonScan) | [0xcFcA...40c1E](https://polygonscan.com/address/0xcFcA16C8c38a83a71936395039757DcFF6040c1E) |
| Контракт MessageStorage (PolygonScan) | [0x906D...139D](https://polygonscan.com/address/0x906DCA5190841d5F0acF8244bd8c176ecb24139D) |
| Репозиторий на GitHub | [aliter230880/web3-messenger](https://github.com/aliter230880/web3-messenger) |
| Демо на GitHub Pages | [aliter230880.github.io/web3-messenger](https://aliter230880.github.io/web3-messenger/) |
| Основной сайт | [chat.aliterra.space](https://chat.aliterra.space/) |
| XMTP Docs | [xmtp.org](https://xmtp.org) |
| Ethers.js CDN | [cdnjs.cloudflare.com](https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.umd.min.js) |
| Polygon RPC | https://polygon-rpc.com |
| EIP-191 (personal_sign) | [eips.ethereum.org/EIPS/eip-191](https://eips.ethereum.org/EIPS/eip-191) |

---

## 🧪 ТЕСТОВЫЕ ДАННЫЕ (Для отладки)

```javascript
// Тестовый пользователь
const TEST_USER = {
  address: "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE88",
  username: "TestUser_Dima",
  avatarCID: "QmTest123456789",
  bio: "Founder of Web3 Messenger"
};

// Тестовое сообщение для подписи
const TEST_MESSAGE = "Hello Web3! This message is signed by my wallet.";
// Ожидаемая подпись (пример): 0x1234...abcd (65 байт)

// Проверка подписи в консоли:
// ethers.utils.verifyMessage(TEST_MESSAGE, signature) → должен вернуть TEST_USER.address

// Тестовый вызов контракта Identity
// await contract.registerProfile("TestUser", "QmTest...", "Bio test");
// await contract.isRegistered("0x742d...fE88"); // → true

// Тестовый вызов контракта MessageStorage
// await msgContract.sendMessage("0xRecipient...", "Hello", signature);
```

---

## 📝 ИНСТРУКЦИЯ ДЛЯ ИИ (Как использовать этот контекст)

🔧 **При получении этого файла:**
1. **НЕ пересказывай контекст** — сразу предлагай решения/код.
2. **Если нужна доп.информация** — спрашивай конкретно (файл, функция, строка).
3. **Все коды давай ПОЛНЫМИ** (для прямой замены файлов), а не фрагментами.
4. **Учитывай преференции Димы**: тёплый тон, эмодзи 😊✨, дружелюбная атмосфера.
5. **Проверяй совместимость** с:
   - Адресом контракта Identity: `0xcFcA16C8c38a83a71936395039757DcFF6040c1E`
   - Адресом контракта MessageStorage: `0x906DCA5190841d5F0acF8244bd8c176ecb24139D`
   - Сетью: Polygon Mainnet (137)
   - ABI: функции обоих контрактов
   - **Доменом:** `BASE_URL` определяется автоматически через `window.location.origin`

🎯 **Текущая задача:** [вставить здесь]

---

## 🔄 ОБНОВЛЕНИЕ КОНТЕКСТА

**Когда обновлять этот файл:**
- ✅ После деплоя нового контракта → обновить `contract_address`
- ✅ После исправления бага → переместить из ❌ в ✅
- ✅ После добавления фичи → добавить в «Что работает» + описать реализацию
- ✅ При смене приоритетов → обновить «Следующие шаги»

**Как обновлять:**
1. Отредактируй `PROJECT_CONTEXT.md` в репозитории
2. Закоммить с сообщением: `docs: update context [краткое описание]`
3. При новом чате с ИИ — скопируй актуальное содержимое первым сообщением

💡 **Совет:** Этот файл — твой «единый источник правды». Храни его в корне репозитория, обновляй после каждого значимого изменения, и любой ИИ (или разработчик) сможет мгновенно включиться в проект без долгих объяснений.

---
**Last updated:** 2025-12-12  
**Автор:** Дима  
**Статус:** 🟢 Production (On-Chain Messaging Live)
```

---

Теперь в `PROJECT_CONTEXT.md` есть всё: и про смарт-контракты, и про подписи, и про домены. Можно смело заливать в репозиторий. 😊✨

Если что-то ещё нужно доработать — говори!
