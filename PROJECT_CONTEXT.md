# Web3 Messenger — PROJECT CONTEXT (Актуально: апрель 2026)

---

## Что это такое

Децентрализованный мессенджер в стиле Telegram. Тёмный 3-колоночный UI. Работает на Polygon Mainnet через MetaMask (ethers.js v5). Все сообщения хранятся on-chain, метаданные профилей — on-chain + localStorage. **Нет серверов, нет backend** — полностью клиентское SPA.

**Бренд:** AliTerra  
**Автор/Админ:** `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB`

---

## Деплои и адреса

| Среда | URL |
|---|---|
| GitHub Pages | `https://aliter230880.github.io/web3-messenger/` |
| Кастомный домен | `https://chat.aliterra.space/` |
| IPFS | CID `QmSUND3Zta1hgVFb6wp1mPnZwqVJiKRZCLrmr8oVu7iBDN` |
| Unstoppable Domain | `aliterra.privacy` → `aliterra.privacy.link` |
| Replit dev | `artifacts/web3-messenger` (workflow: web) |
| GitHub репо | `https://github.com/aliter230880/web3-messenger` |

---

## Ключевые файлы

| Файл в репо | Назначение |
|---|---|
| `index.html` | Весь UI (42.9 KB) |
| `js/app.js` | Вся логика (~2530 строк, 134 KB) |
| `css/style.css` | Стили, тёмная тема, Telegram-layout |
| `js/web3.js` | Дополнительные Web3 утилиты |
| `js/xmtp.js` | Заготовка XMTP интеграции (не активна) |
| `contracts/KeyEscrow.sol` | Контракт Key Escrow |
| `contracts/PublicKeyRegistry.sol` | Реестр E2E публичных ключей |
| `contracts/SocialWalletRegistry.sol` | Реестр соцсетей-кошельков |
| `contracts/Identity.sol` | Контракт профилей/никнеймов |
| `PROJECT_CONTEXT.md` | Этот файл |

---

## Адреса смарт-контрактов (Polygon Mainnet, chainId: 137)

| Константа | Адрес | Статус |
|---|---|---|
| `ADMIN_ADDRESS` | `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB` | Постоянный |
| `IDENTITY_CONTRACT` | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` | Активен, верифицирован |
| `DEFAULT_MESSAGE_CONTRACT` | `0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb` | Активен, верифицирован |
| `DEFAULT_ESCROW_CONTRACT` | `0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53` | Активен, верифицирован |
| `SocialWalletRegistry` | `0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036` | Задеплоен, не интегрирован |
| `OLD_MESSAGE_CONTRACT` | `0x906DCA5190841d5F0acF8244bd8c176ecb24139D` | Устаревший, авто-миграция |
| `PublicKeyRegistry` | — | Не задеплоен (байткод готов в app.js) |
| `SHARE_BASE_URL` | `https://chat.aliterra.space/` | — |

---

## Архитектура приложения

### Стек технологий
- **Frontend:** Vanilla JS (без фреймворков), HTML, CSS
- **Blockchain:** ethers.js v5.7.2 (CDN)
- **Криптография:** TweetNaCl 1.0.3 (CDN) — nacl.box, nacl.secretbox
- **Хранилище:** localStorage (профиль, ключи, кеш) + Polygon on-chain (сообщения)
- **Шрифты:** Inter (Google Fonts)

### 3-колоночный UI (Telegram-стиль)
```
[Левая панель]     [Средняя панель]    [Правая панель]
 Папки/фильтры      Список чатов         Окно чата
 Аватар юзера       Превью сообщений     Поле ввода
 Настройки          Поиск контактов      Шифрование
```

### Поток работы пользователя
1. Открыть приложение → MetaMask автоподключение
2. Проверка Polygon Mainnet (chainId 137), иначе — автопереключение
3. Если аккаунт новый → модалка регистрации (никнейм + пароль)
4. Если существующий → модалка логина (пароль)
5. Производный E2E keypair (deterministic от MetaMask подписи)
6. Auto-deposit ключей в escrow (фоновая транзакция)
7. Чат-лист загружается, polling каждые 5 сек

---

## Аутентификация и ключи

### Уровень 1: Пароль + MasterKey
```
password → PBKDF2(SHA-256, 100000 iter, salt=addr) → masterKey (32 байта)
```
Хранится только хеш пароля в localStorage (`w3m_accounts`). masterKey держится в памяти.

### Уровень 2: E2E KeyPair
```
MetaMask.signMessage("Web3Messenger-E2E-KeyPair-v1") → sig (hex string)
SHA-256(sig) → secretKey (32 байта)
nacl.box.keyPair.fromSecretKey(secretKey) → { publicKey, secretKey }
```
**Детерминистично:** одинаковый кошелёк → одинаковая keypair при каждом логине.  
**Кеш:** подпись шифруется через `nacl.secretbox(sig, nonce, masterKey)` и сохраняется в `w3m_e2e_sig_<addr>`. При следующем логине MetaMask-попап не показывается.

### Уровень 3: Admin Escrow KeyPair
```
MetaMask.signMessage("Web3Messenger-Admin-Escrow-KeyPair-v1") → adminSig
SHA-256(adminSig) → adminSecretKey
nacl.box.keyPair.fromSecretKey(adminSecretKey) → adminKeyPair
```
Только для адреса `ADMIN_ADDRESS`. Используется для расшифровки escrow-ключей.

---

## E2E Шифрование — текущий статус (v15)

### Схема шифрования (v15, апрель 2026)

**Шифрование:**
```
addrKey = SHA-256([myAddr, peerAddr].sort().join(':web3m:'))
nonce = randomBytes(24)
ciphertext = nacl.secretbox(msg, nonce, addrKey)
blob = [0x01][e2eKeyPair.publicKey:32][nonce:24][ciphertext]
message = base64(blob)
```

**Дешифрование — порядок попыток:**
1. **Для 0x03 формата (устаревший dual):** DH попытка → addr key попытка
2. **Для 0x01/0x02 форматов:**
   - Попытка DH: `nacl.box.before(embeddedSenderPubKey, mySecretKey)` 
   - Попытка addr key: `SHA-256(sorted_addresses)`
   - Попытка DH из кеша: `getSharedSecret(peer)`
   - Legacy HMAC: `HMAC-SHA256(masterKey, sorted_addresses)` (обратная совместимость)

### Версии формата сообщений

| Версия байт | Формат | Шифрование | Расшифровка |
|---|---|---|---|
| `0x01` | `[01][pubkey:32][nonce:24][ct]` | Address Key | addr key ✓ (любая версия кода) |
| `0x02` | `[02][pubkey:32][nonce:24][ct]` | DH shared | требует совпадения DH ключей |
| `0x03` | `[03][pubkey:32][nonce:24][dhLen:2][dhCT][addrCT]` | DH + addr key | оба варианта |
| Legacy | `[nonce:24][ct]` | HMAC-SHA256 | masterKey нужен |

**Текущий** при отправке: `0x01` (address key + embedded pubkey). Гарантирует расшифровку у обоих сторон.

### Хранение ключей в localStorage

| Ключ | Значение |
|---|---|
| `w3m_accounts` | JSON: `{ addr: { username, keyHash, createdAt, avatarId } }` |
| `w3m_e2e_sig_<addr>` | Зашифрованная MetaMask-подпись (для кеша keypair) |
| `w3m_own_pub_<addr>` | Hex публичный ключ пользователя |
| `w3m_peer_pub_<addr>` | Hex публичный ключ собеседника |
| `w3m_peer_avatar_<addr>` | avatarId собеседника (0-23) |
| `w3m_msg_contract` | Адрес контракта сообщений (если изменён) |
| `w3m_escrow_contract` | Адрес эскроу контракта |
| `w3m_pubkey_registry` | Адрес PublicKeyRegistry |
| `w3m_contacts` | JSON: массив контактов `[{ address, nickname, added }]` |
| `w3m_chats_<addr>` | JSON: кешированные данные чата |
| `w3m_nickname_<addr>` | Кешированный никнейм (TTL через timestamp) |

---

## Key Escrow (Архив ключей)

### Назначение
Позволяет администратору восстановить доступ и прочитать любую переписку.

### Поток данных Escrow (v2, апрель 2026)
```
1. Admin публикует adminPublicKey в контракт (setAdminPublicKey)
2. Пользователь при логине:
   - Формирует payload: [0x02][masterKey:32][e2eSecretKey:32] (65 байт)
   - ephemeralKP = nacl.box.keyPair()
   - encrypted = nacl.box(payload, nonce, adminPubKey, ephemeralKP.secretKey)
   - blob = [ephemeralKP.publicKey:32][nonce:24][encrypted]
   - Транзакция: escrowContract.depositKey(blob)
3. Admin может:
   - escrowContract.getKey(userAddr) → blob
   - Расшифровать: nacl.box.open(encrypted, nonce, ephemeralPubKey, adminSecretKey)
   - Получить masterKey + e2eSecretKey пользователя
```

### Форматы payload в escrow

| Версия | Структура | Источник |
|---|---|---|
| v1 (старый) | `[masterKey:32]` | до апреля 2026 |
| v2 (текущий) | `[0x02][masterKey:32][e2eSecretKey:32]` = 65 байт | апрель 2026 |

### Функция Export Key Archive
Новая кнопка в админ-панели (вкладка Escrow):
- Читает `getUserCount()` из контракта
- Батчами читает `getUsers(start, count)` и `getKey(addr)` для каждого
- Расшифровывает каждый ключ через adminKeyPair
- Скачивает JSON файл:
```json
{
  "version": 2,
  "exportedAt": "ISO timestamp",
  "exportedBy": "adminAddr",
  "contractAddress": "escrowAddr",
  "chainId": 137,
  "totalUsers": 42,
  "users": [
    {
      "address": "0x...",
      "status": "decrypted",
      "keyVersion": 2,
      "masterKeyHex": "0x...",
      "e2eSecretKeyHex": "0x...",
      "e2ePublicKeyHex": "0x..."
    }
  ]
}
```

### Чтение переписки через Escrow
`adminReadConversation(targetAddr, peerAddr)`:
1. `getKey(targetAddr)` → расшифровать → masterKey + e2eSecretKey (v2)
2. Попытки расшифровки сообщений по порядку:
   - DH: `nacl.box.before(peerPub, e2eSecretKey)` (если peerPub в реестре)
   - Address Key: `SHA-256([targetAddr, peerAddr].sorted)`
   - HMAC legacy: `HMAC-SHA256(masterKey, sorted_addrs)`

---

## Аватары и профили

### 24 дефолтных SVG-аватара
- 12 мужских (0-11) + 12 женских (12-23)
- Хранятся как inline data URI в `DEFAULT_AVATARS` массиве
- Пикер в модалке профиля: сетка 4x6

### Функции
- `renderAvatarCircle(id, size)` → возвращает `<img>` с data URI
- `pickAvatar(id)` → выбор аватара в пикере
- `getPeerAvatarId(addr)` → из `w3m_peer_avatar_<addr>` localStorage
- `account.avatarId` хранится в `w3m_accounts`

### Никнеймы
- Приоритет: Identity-контракт → localStorage → shortAddr
- Кеш в `w3m_nickname_<addr>` с TTL
- Никнейм отображается в чат-листе (без адреса)

---

## Контакты и чаты

### Добавление контакта
1. По адресу 0x... вручную
2. По URL `?contact=0x...` (автооткрытие чата)
3. QR-код (шеринг ссылки)

### Шеринг
- Кнопка Share → модалка с QR + ссылкой
- `SHARE_BASE_URL + ?contact=<myAddr>`
- Кнопки: Telegram, WhatsApp, X (Twitter), Facebook

### Папки/фильтры
Левая панель: All / Unread / Groups / Bots (задел, UI готов)

### Поллинг
`POLL_INTERVAL = 5000ms` — каждые 5 сек проверка новых сообщений через `messageCount()`.

---

## Контракт сообщений (NEW_MESSAGE_ABI)

```solidity
// Адрес: 0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb
function sendMessage(address recipient, string text) external
function getConversation(address userA, address userB, uint256 startIndex, uint256 count) 
    view returns (tuple(address sender, address recipient, string text, uint256 timestamp)[], uint256)
function messageCount(address a, address b) view returns (uint256)
event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)
event ChatDiscovered(address indexed user, address indexed peer)
```

**Особенности:**
- `messageCount(A, B)` = симметрично (сортирует адреса внутри)
- `getConversation` возвращает пагинированный массив + общее количество
- Старый контракт `0x906D...` мигрируется автоматически
- `isNewContract` флаг определяет какой ABI использовать

---

## Контракт Key Escrow (ESCROW_ABI)

```solidity
// Адрес: 0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53
function depositKey(bytes encryptedKey) external
function getKey(address user) view returns (bytes)
function getAdminPublicKey() view returns (bytes)
function setAdminPublicKey(bytes pubKey) external
function getUserCount() view returns (uint256)
function getUsers(uint256 start, uint256 count) view returns (address[])
function isRegistered(address) view returns (bool)
function transferAdmin(address newAdmin) external
event KeyDeposited(address indexed user, uint256 timestamp)
```

---

## Контракт PublicKeyRegistry (PUBKEY_REGISTRY_ABI)

```solidity
// НЕ задеплоен! Байткод готов в app.js как PUBKEY_REGISTRY_BYTECODE
function registerKey(bytes32 key) external      // регистрация E2E pubkey
function getKey(address user) view returns (bytes32)
function hasKey(address user) view returns (bool)
event KeyRegistered(address indexed user, uint256 timestamp)
```

**Статус:** Байткод компилирован, кнопка деплоя в админ-панели готова. При деплое адрес сохраняется в `w3m_pubkey_registry` localStorage.

---

## SocialWalletRegistry (не интегрирован)

```solidity
// Адрес: 0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036
// Компилятор: solc v0.8.28, optimization 200 runs, EVM: cancun
```

Провайдеры: `Email(0), Google(1), Discord(2), Telegram(3), Apple(4), X(5), Facebook(6), GitHub(7), Phone(8), Passkey(9), Guest(10)`

**Задел для:** входа через соцсети без seed phrase, wallet recovery через email/Telegram и т.д. Верифицирован на Sourcify (partial).

---

## Админ-панель (только для ADMIN_ADDRESS)

### Вкладка Key Escrow — разделы:

1. **Escrow Admin Key** — `deriveAndSetAdminKey()` → подпись MetaMask → pubkey в контракт
2. **Развернуть KeyEscrow** — деплой нового контракта (с bytecode)
3. **Развернуть E2E Registry** — деплой PublicKeyRegistry
4. **Развернуть Social Registry** — деплой SocialWalletRegistry
5. **Установить контракт вручную** — ввод адреса
6. **Чтение переписки** — два адреса → расшифровка через escrow
7. **Export Key Archive** ← НОВОЕ — выгрузка всех ключей в JSON
8. **Сброс пароля** — поиск пользователя → сброс доступа

---

## Известные проблемы и ошибки

### 🔴 Критические (были)

| Проблема | Версия | Решение |
|---|---|---|
| Получатель видит зашифрованный текст (0x02) | v12-v14 | v14: address key fallback; v15: всегда шифровать addr key |
| DH не совпадает у sender/receiver | v12-v14 | v15: убрали DH из шифрования, оставили только как fallback при расшифровке |
| Старые сообщения не читались после смены кода | v13 | v15: cascading fallback (DH → addr key → HMAC → legacy) |

### 🟡 Умеренные

| Проблема | Статус |
|---|---|
| Browser cache мешает получить новый код | Исправлено в v15: `?v=15` cache-bust + `no-cache` meta headers |
| MetaMask попап при каждом логине | Исправлено: кеш подписи через nacl.secretbox в localStorage |
| GitHub API 409 конфликт SHA | Workaround: всегда свежий GET SHA перед PUT |
| PolygonScan API V1 deprecated | Не критично (верификация через Sourcify) |

### 🟢 Архитектурные ограничения (не баги)

| Ограничение | Причина |
|---|---|
| Address key — публичный (SHA-256 от адресов) | Без DH иначе нельзя гарантировать расшифровку |
| Старые сообщения (до v14) в 0x02 формате не читаются получателем | Зашифрованы DH ключом, который больше не совпадает |
| Каждое сообщение = транзакция (~0.001 MATIC) | Polygon on-chain storage |
| SocialWalletRegistry не интегрирован в UI | Задел на будущее |
| PublicKeyRegistry не задеплоен | Нет необходимости пока DH не используется |

---

## Версионирование шифрования

| Версия | Когда | Описание |
|---|---|---|
| v1–v11 | 2023-2024 | PBKDF2 per-user, только локальное |
| v12 | ранний 2025 | nacl.box DH + PublicKeyRegistry (on-chain ключи) |
| v13 | 2025 | DH + embedded pubkey в сообщениях (без registry) |
| v14 | апрель 2026 | Address key fallback `SHA-256(sorted_addrs:web3m:...)` |
| v14.1 | апрель 2026 | Dual 0x03 формат (DH + addr key) — не сработал из-за кеша |
| **v15** | **апрель 2026** | **Всегда addr key (0x01) + cascading fallback при расшифровке** |

---

## Полный список файлов в GitHub репо

```
index.html          — UI (42.9 KB), script src="js/app.js?v=15"
js/app.js           — Логика (134 KB), v15
js/web3.js          — Web3 утилиты
js/xmtp.js          — XMTP заготовка
css/style.css       — Стили (35.9 KB), link href="css/style.css?v=15"
favicon.png         — Иконка
logo.png            — Логотип AliTerra
contracts/
  Identity.sol
  IdentityProxy.sol
  IdentityV2.sol
  KeyEscrow.sol
  KeyRegistry.sol
  MessageStorage.sol
  PublicKeyRegistry.sol
  SimpleIdentity.sol
  SocialWalletRegistry.sol
  Deployer.sol
  interfaces/IIdentity.sol
  verify_input.json
  verify_escrow_input.json
  verify_social_input.json
scripts/deploy.js
hardhat.config.js
package.json
PROJECT_CONTEXT.md  — этот файл
```

---

## GitHub Push — механизм

```js
// Replit GitHub integration
const conns = await listConnections('github');
const token = conns[0].settings.access_token;

// Всегда свежий SHA
const getRes = await fetch(`https://api.github.com/repos/aliter230880/web3-messenger/contents/${path}?ref=main`);
const { sha } = await getRes.json();

// PUT с content (base64) + sha
await fetch(`https://api.github.com/repos/aliter230880/web3-messenger/contents/${path}`, {
  method: 'PUT',
  body: JSON.stringify({ message, content: base64, sha, branch: 'main' })
});
```

**Важно:** Параллельный push одного файла двумя процессами → 409 конфликт SHA. Решение: последовательный push.

---

## IPFS Деплой

**Текущий CID:** `QmSUND3Zta1hgVFb6wp1mPnZwqVJiKRZCLrmr8oVu7iBDN`  
**Сервис:** Pinata  
**Unstoppable Domain:** `aliterra.privacy` → настроен на IPFS hash  
**Публичный URL:** `https://aliterra.privacy.link`  
**Staging папка:** `/tmp/ipfs-messenger/` (синхронизируется вручную перед деплоем)

**Деплой нового CID:**
1. Синхронизировать файлы в `/tmp/ipfs-messenger/`
2. Загрузить папку на Pinata → получить новый CID
3. Обновить IPFS hash в Unstoppable Domains (console.unstoppabledomains.com)

---

## Архитектурные решения (заметки)

### HybridMessenger + IdentityV2 (апрель 2026)
Два новых контракта подготовлены для гибридной XMTP-архитектуры (андроид-версия мессенджера запросила). Скомпилированы solc 0.8.35, байткод встроен в `js/app.js`, кнопки деплоя добавлены в админ-панель (секция «Гибридная архитектура (XMTP)»).

**HybridMessenger** — хранит SHA-256 хэши XMTP-сообщений on-chain для верификации. Адрес после деплоя → `w3m_hybrid_messenger` в localStorage.  
**IdentityV2** — улучшенный реестр профилей: уникальные никнеймы, 24 аватара (0-23), поиск по никнейму, `adminSetProfile` для миграции. Адрес после деплоя → `w3m_identity_v2` в localStorage.

Исправлены баги исходных контрактов: убран upgradeable proxy pattern (мешал деплою одной кнопкой), добавлена авторизация в `clearOldHashes`, avatarId приведён к 0-23.

### XMTP vs текущий on-chain подход (апрель 2026)
**XMTP лучше для пользователя:** быстро (без ожидания майнинга), бесплатно (нет gas), battle-tested E2E (стандарт MLS), interoperability с другими dApp.  
**Текущий on-chain вариант лучше:** полный контроль (нет нод третьей стороны), admin Key Escrow (в XMTP невозможно), сообщения вечны на Polygon.  
**Решение-компромисс:** совместить — XMTP для реальных сообщений, on-chain только для метаданных и регистрации профилей. Приоритет: реализовать позже, когда будет время на рефакторинг.

---

## Планы и следующие шаги

### Приоритет 1 (Шифрование)
- [ ] Решить корневую причину несовпадения DH ключей
- [ ] Когда DH заработает стабильно — вернуть dual 0x03 формат
- [ ] Задеплоить PublicKeyRegistry для надёжного обмена ключами on-chain
- [ ] Возможно: использовать `nacl.box` напрямую вместо `nacl.box.before + nacl.secretbox`

### Приоритет 2 (Функциональность)
- [ ] Групповые чаты (контракт поддерживает)
- [ ] Интеграция SocialWalletRegistry в UI (вход через Telegram/Email)
- [ ] Read receipts (прочтено)
- [ ] Push уведомления (Web Push API)
- [ ] Вложения (IPFS для файлов)
- [ ] Голосовые сообщения

### Приоритет 3 (Инфраструктура)
- [ ] Обновить IPFS (задеплоить v15)
- [ ] Обновить PolygonScan API с V1 на V2 (Etherscan API)
- [ ] Автоматический IPFS деплой при каждом GitHub push (GitHub Actions)
- [ ] Верификация всех контрактов на PolygonScan

---

## Предпочтения пользователя

| Параметр | Значение |
|---|---|
| Язык общения | Русский |
| Формат файлов | Полная замена (не патчи) |
| Серверные зависимости | Нет (всё клиентское) |
| Деплой контрактов | Одной кнопкой в UI |
| GitHub push | Через Replit GitHub integration (token из listConnections) |
| Верификация | PolygonScan (V2) или Sourcify |

---

## Технические детали (для разработчика)

### Polling механизм
```js
POLL_INTERVAL = 5000     // мс
MESSAGES_PER_PAGE = 50   // сообщений на страницу
SCAN_BLOCKS_BACK = 50000 // для истории событий
```

### Обнаружение типа контракта
```js
isNewContract = true  // если getConversation() успешен с NEW_MESSAGE_ABI
isNewContract = false // иначе fallback на OLD_MESSAGE_ABI
```

### fetchConversation — мультиформат ABI
Поддерживает 14 вариантов tuple-структур для максимальной совместимости со старыми контрактами.

### getAddressKey (v15 основной ключ)
```js
async function getAddressKey(peer) {
    const sorted = [userAddress.toLowerCase(), peer.toLowerCase()].sort().join(':web3m:');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted));
    return new Uint8Array(hash);
}
// SHA-256("0xaaaa:web3m:0xbbbb") = то же у обоих пользователей
```

### escrowDepositKey — v2 payload
```js
// При логине, если e2eKeyPair доступен:
payload = [0x02, ...masterKey.slice(0,32), ...e2eKeyPair.secretKey]  // 65 байт
// Шифруется nacl.box с adminPubKey из контракта
// Транзакция: escrowContract.depositKey(blob)
```

### parseRecoveredPayload
```js
function parseRecoveredPayload(decrypted) {
    if (decrypted.length === 65 && decrypted[0] === 0x02) {
        return { masterKey: decrypted.slice(1,33), e2eSecretKey: decrypted.slice(33,65), version: 2 };
    }
    return { masterKey: decrypted, e2eSecretKey: null, version: 1 };
}
```

---

*Последнее обновление: апрель 2026. Текущая версия кода: v15.*
