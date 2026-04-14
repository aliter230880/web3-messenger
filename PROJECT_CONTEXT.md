# Web3 Messenger — PROJECT CONTEXT

## Общие сведения
Децентрализованный мессенджер в стиле Telegram с тёмным 3-колоночным UI. Работает на Polygon Mainnet через MetaMask (ethers.js v5). Все данные хранятся on-chain и в localStorage. Серверов нет — полностью клиентское приложение.

**Деплой:**
- GitHub Pages: `https://aliter230880.github.io/web3-messenger/`
- Кастомный домен: `https://chat.aliterra.space/`
- Replit: `artifacts/web3-messenger`

**Репозиторий:** `https://github.com/aliter230880/web3-messenger`

---

## Ключевые файлы
| Файл | Назначение |
|---|---|
| `index.html` | Главная страница, весь UI |
| `js/app.js` | Вся логика приложения (~2100 строк) |
| `css/style.css` | Стили |
| `contracts/Web3Messenger.sol` | Контракт сообщений |
| `contracts/KeyEscrow.sol` | Контракт Key Escrow (админ доступ к ключам) |
| `contracts/PublicKeyRegistry.sol` | Реестр E2E публичных ключей (скомпилирован, не задеплоен) |
| `contracts/SocialWalletRegistry.sol` | Реестр социальных кошельков (для будущего входа через соцсети) |

---

## Константы и адреса

| Параметр | Значение |
|---|---|
| ADMIN_ADDRESS | `0xB19aEe699eb4D2Af380c505E4d6A108b055916eB` |
| IDENTITY_CONTRACT | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` |
| MESSAGE_CONTRACT | `0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb` |
| ESCROW_CONTRACT | `0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53` |
| SocialWalletRegistry | `0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036` |
| PublicKeyRegistry | НЕ задеплоен (байткод готов) |
| Сеть | Polygon Mainnet (chainId: 137) |
| SHARE_BASE_URL | `https://chat.aliterra.space/` |
| URL параметр | `?contact=0x...` — автооткрытие чата |

---

## E2E Шифрование (v13 — текущая версия)

### Принцип работы
Шифрование основано на **Diffie-Hellman** через `nacl.box` (TweetNaCl):

1. **Генерация ключей:** При логине пользователь подписывает MetaMask-сообщение `"Web3Messenger-E2E-KeyPair-v1"` → SHA-256 хеш подписи → `nacl.box.keyPair.fromSecretKey()` → детерминистическая keypair
2. **Общий секрет:** `nacl.box.before(peerPublicKey, mySecretKey)` → 32-байтный shared secret
3. **Шифрование:** `nacl.secretbox(message, nonce, sharedSecret)`
4. **Дешифровка:** `nacl.secretbox.open(ciphertext, nonce, sharedSecret)`

### Формат зашифрованных сообщений (v13)

| Байт 0 | Структура | Описание |
|---|---|---|
| `0x01` | `[01][pubkey:32][nonce:24][ciphertext]` | Ключ собеседника ещё не известен, вкладываем свой |
| `0x02` | `[02][pubkey:32][nonce:24][ciphertext]` | Ключ известен, но всё равно вкладываем свой |
| другое | `[nonce:24][ciphertext]` | Старый формат (обратная совместимость) |

### Обмен ключами (без PublicKeyRegistry)
Публичные ключи пользователей **встраиваются прямо в зашифрованные сообщения** (первые 33 байта). При получении сообщения:
1. Извлекается публичный ключ отправителя (байты 1-32)
2. Сохраняется в `localStorage` (`w3m_peer_pub_<addr>`)
3. Вычисляется DH shared secret → расшифровка

### Хранение ключей в localStorage
| Ключ | Значение |
|---|---|
| `w3m_peer_pub_<addr>` | Hex-строка публичного ключа собеседника (64 символа) |
| `w3m_own_pub_<addr>` | Hex-строка собственного публичного ключа |

### Fallback (обратная совместимость)
Если DH-ключ не найден, используется старая схема PBKDF2:
```
sorted = [myAddr, peerAddr].sort().join(':')
chatKey = HMAC-SHA256(masterKey, sorted)
```
**Ограничение:** Старая схема работает только если оба пользователя знают один и тот же masterKey (только для локальных сообщений одного пользователя).

### Кеширование
`sharedKeyCache` — in-memory кеш DH shared secrets по адресу собеседника. Сбрасывается при получении нового публичного ключа.

---

## Key Escrow (админ-доступ к сообщениям)

### Контракт KeyEscrow (`0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53`)
Позволяет админу читать любые сообщения:

1. **Админ** подписывает `"Web3Messenger-Admin-Escrow-KeyPair-v1"` → nacl keypair
2. Публичный ключ админа записывается в контракт: `setAdminPublicKey(pubKey)`
3. **Пользователь** при логине шифрует свой masterKey публичным ключом админа: `nacl.box(masterKey, nonce, adminPubKey, userSecretKey)`
4. Зашифрованный ключ сохраняется: `escrowContract.depositKey(encryptedKey)`
5. **Админ** может извлечь ключ любого пользователя, расшифровать его и прочитать переписку

### Админ-панель (вкладка Key Escrow)
- Развернуть E2E Registry (PublicKeyRegistry)
- Escrow Admin ключ
- Развернуть KeyEscrow
- Развернуть Social Registry
- Установить адрес контракта вручную
- Поиск пользователя по адресу
- Чтение переписки через escrow

---

## SocialWalletRegistry (`0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036`)

Контракт для будущей интеграции входа через соцсети (thirdweb-подобная модель):

### Поддерживаемые провайдеры (enum AuthProvider)
`Email(0), Google(1), Discord(2), Telegram(3), Apple(4), X(5), Facebook(6), GitHub(7), Phone(8), Passkey(9), Guest(10)`

### Ключевые функции
| Функция | Описание |
|---|---|
| `hashIdentity(provider, identifier)` | Хеширует `keccak256(provider + ":" + identifier)` |
| `registerWallet(hash, addr, provider, recoveryHash)` | Регистрация кошелька (admin/operator) |
| `recoverWallet(hash, newAddr, recoveryProof)` | Восстановление доступа |
| `setRecoveryHash(hash, newHash)` | Установка recovery-хеша |
| `deactivateWallet(hash)` / `reactivateWallet(hash)` | Блокировка/разблокировка |
| `getWallet(hash)` / `getWalletByAddress(addr)` | Поиск |
| `setOperator(addr, bool)` | Назначение оператора |
| `transferAdmin(newAdmin)` | Передача прав |

### Статус
- **Задеплоен** на Polygon Mainnet
- **Верифицирован** частично на Sourcify
- **Не используется** пока в логике мессенджера — задел на будущее
- Компилятор: solc v0.8.28, optimization: yes (200 runs), EVM: cancun

---

## Контракты — сводка

| Контракт | Адрес | Статус | Верификация |
|---|---|---|---|
| Identity (profiles) | `0xcFcA16C8c38a83a71936395039757DcFF6040c1E` | Активен | PolygonScan |
| Web3Messenger (сообщения) | `0xA07B784e6e1Ca3CA00084448a0b4957005C5ACEb` | Активен | PolygonScan |
| KeyEscrow | `0x20AFA1D1d8c25ecCe66fe8c1729a33F2d82BBA53` | Активен | PolygonScan |
| SocialWalletRegistry | `0xC2c66A1eBe0484c8a91c4849680Bcd77ada4E036` | Задеплоен, не используется | Sourcify (partial) |
| PublicKeyRegistry | — | Не задеплоен (байткод готов) | — |

---

## UI / UX

### Структура интерфейса
3-колоночный layout (Telegram-стиль):
1. **Левая панель** — папки/фильтры, аватар пользователя
2. **Средняя панель** — список чатов с превью последних сообщений
3. **Правая панель** — окно чата с сообщениями

### Тёмная тема
CSS-переменные: `--bg-dark`, `--bg-darker`, `--bg-lighter`, `--accent` (фиолетовый), `--text-main`, `--text-muted`

### Функции UI
- MetaMask подключение + автопереключение на Polygon
- Регистрация/логин с паролем (PBKDF2)
- Контакты: добавление по адресу, QR-код, шаринг ссылкой
- Сообщения: отправка on-chain (Polygon), E2E шифрование
- Админ-панель: Key Escrow, деплой контрактов, статистика
- Никнеймы из Identity-контракта
- Значок подписи EIP-191 на подписанных сообщениях

---

## GitHub Push

### Метод
Через GitHub REST API v3 (Contents API):
1. GET файл → получить SHA
2. PUT файл → обновить с новым content (base64) и SHA

### Подключение
GitHub integration через Replit Connections:
```js
const conns = await listConnections('github');
const token = conns[0].settings.access_token;
```

---

## Предпочтения пользователя
- Язык общения: **русский**
- Формат файлов: **полная замена** (не патчи)
- Все файлы **универсальные** — без серверных зависимостей
- Деплой контрактов: **1 кнопкой** через админ-панель
- Верификация: через PolygonScan (API ключ устарел, V2 миграция нужна) или Sourcify

---

## Известные ограничения
1. **Старые сообщения** (до v13) зашифрованные разными masterKey — не расшифровываются между разными пользователями
2. **PublicKeyRegistry** не задеплоен — обмен ключами идёт через встроенные в сообщения публичные ключи
3. **PolygonScan API** — V1 deprecated, нужна миграция на Etherscan V2 API
4. **Gas** — каждое сообщение = транзакция на Polygon (~0.001 MATIC)
5. **SocialWalletRegistry** — задеплоен, но не интегрирован в логику приложения

---

## Версионирование шифрования
| Версия | Описание |
|---|---|
| v1-v11 | PBKDF2 per-user masterKey, локальное шифрование |
| v12 | DH через nacl.box + PublicKeyRegistry (on-chain ключи) |
| v13 | DH + встроенные pubkey в сообщения (работает без registry) |
