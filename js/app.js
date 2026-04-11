// Web3 Messenger - App Logic v7.4
// ✅ Auto-refresh current chat every 10s
// ✅ Background discovery of new conversations (every 30s)
// ✅ Persistent chat deletion
// ✅ Fallback to unencrypted message if recipient has no public key
// ✅ Smooth account change handling

console.log('🚀 Web3 Messenger v7.4 loaded');

if (typeof ethers === 'undefined') {
    console.error('❌ ethers.js не загружен! Проверьте CDN в index.html');
}

// ─── Глобальные переменные ──────────────────────────────────────────────────
let provider, signer, userAddress;
let isAdmin = false;
let currentUsername = '';
const ADMIN_ADDRESS    = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const KEY_REGISTRY_ADDRESS = "0x075Da61CCaaC73279CCc49097B8e5fDcF6dd8737";
const BASE_URL = window.location.origin + '/';

// ABI MessageStorage
const MESSAGE_ABI = [
    "function sendMessage(address recipient, string text, bytes signature) external",
    "function getMessages(address sender, address recipient, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[])",
    "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)",
    "function messageCount(address, address) view returns (uint256)"
];

// ABI KeyRegistry
const KEY_REGISTRY_ABI = [
    "function setPublicKey(bytes calldata publicKey) external",
    "function getPublicKey(address user) external view returns (bytes memory)"
];

// ─── Хранилище контактов ────────────────────────────────────────────────────
const contactsStore = {
    list: [],
    load() {
        try {
            const saved = localStorage.getItem('web3messenger_contacts');
            if (saved) this.list = JSON.parse(saved);
        } catch (e) { console.warn('Contacts load error:', e); }
    },
    save() {
        try {
            localStorage.setItem('web3messenger_contacts', JSON.stringify(this.list));
        } catch (e) { console.warn('Contacts save error:', e); }
    },
    add(contact) {
        if (!this.list.find(c => c.address.toLowerCase() === contact.address.toLowerCase())) {
            this.list.push(contact);
            this.save();
            return true;
        }
        return false;
    },
    remove(address) {
        const index = this.list.findIndex(c => c.address.toLowerCase() === address.toLowerCase());
        if (index !== -1) {
            this.list.splice(index, 1);
            this.save();
            return true;
        }
        return false;
    },
    get(address) {
        return this.list.find(c => c.address.toLowerCase() === address.toLowerCase());
    }
};

// ─── Управление удалёнными чатами ────────────────────────────────────────────
const deletedChatsStore = {
    set: new Set(),
    load() {
        try {
            const saved = localStorage.getItem('web3messenger_deleted_chats');
            if (saved) this.set = new Set(JSON.parse(saved));
        } catch (e) { console.warn('Deleted chats load error:', e); }
    },
    save() {
        try {
            localStorage.setItem('web3messenger_deleted_chats', JSON.stringify([...this.set]));
        } catch (e) { console.warn('Deleted chats save error:', e); }
    },
    add(id) { this.set.add(id); this.save(); },
    has(id) { return this.set.has(id); },
    delete(id) { const r = this.set.delete(id); this.save(); return r; }
};

// ─── Данные чатов ───────────────────────────────────────────────────────────
const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', unread: 0, messages: [] },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', unread: 0, messages: [] },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', unread: 0, messages: [] },
    ],
    messageCache: {}
};

// 🔐 RSA-ключи пользователя (хранятся в localStorage)
let userRSAKeyPair = null;
let isInitializing = false;
let autoRefreshInterval = null;
let discoveryInterval = null;

// ─── Инициализация ───────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ App initialized');
    contactsStore.load();
    deletedChatsStore.load();
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
    updateShareButton();
    checkWallet();
    handleContactParam();
});

// ─── Обработка ?contact= в URL ───────────────────────────────────────────────
async function handleContactParam() {
    const params = new URLSearchParams(window.location.search);
    const contactAddr = params.get('contact');
    if (contactAddr && ethers.utils.isAddress(contactAddr)) {
        try {
            const profile = await getProfileByAddress(contactAddr);
            if (profile && profile.isActive) {
                contactsStore.add({ address: contactAddr, ...profile });
            } else {
                contactsStore.add({ address: contactAddr });
            }
            renderChatList();
            showStatus('✅ Контакт добавлен!', 'success');
            history.replaceState({}, document.title, window.location.pathname);
        } catch (e) { console.warn('Contact param error:', e); }
    }
}

// ─── Получение профиля из контракта Identity ─────────────────────────────────
async function getProfileByAddress(address) {
    if (!provider) return null;
    try {
        const contract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, [
            "function getProfile(address) view returns (string,string,string,uint256,bool)"
        ], provider);
        const result = await contract.getProfile(address);
        return {
            username: result[0], avatarCID: result[1], bio: result[2],
            registeredAt: result[3].toNumber(), isActive: result[4]
        };
    } catch (e) { console.warn('Profile fetch error:', e); return null; }
}

// ─── Кошелёк ────────────────────────────────────────────────────────────────
async function checkWallet() {
    if (typeof window.ethereum === 'undefined') return;
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await initWallet();
    } catch (e) { console.warn('Wallet check:', e); }
}

async function initWallet() {
    if (isInitializing) return;
    isInitializing = true;
    try {
        provider    = new ethers.providers.Web3Provider(window.ethereum);
        signer      = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('✅ Connected:', userAddress);

        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        updateAdminButton();
        updateWalletUI();
        updateInputState();
        updateShareButton();
        await checkRegistration();
        await loadOrGenerateRSAKeys();

        startAutoRefresh();
        startDiscovery();
    } catch (e) {
        console.error('Init error:', e);
        showError('wallet-msg', 'Ошибка: ' + e.message);
    } finally {
        isInitializing = false;
    }
}

async function connectWallet() {
    if (!window.ethereum) {
        showError('wallet-msg', '⚠️ Установите MetaMask');
        return;
    }
    const btn = document.getElementById('connect-btn');
    const msg = document.getElementById('wallet-msg');
    try {
        btn.disabled    = true;
        msg.textContent = '⏳ Подключение...';
        msg.className   = 'status-msg info';
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
        msg.textContent = '✅ Подключено!';
        msg.className   = 'status-msg success';
        setTimeout(() => closeModal('wallet-modal'), 800);
    } catch (e) {
        console.error('Connect error:', e);
        msg.textContent = '❌ ' + (e.message || 'Отменено');
        msg.className   = 'status-msg error';
        btn.disabled    = false;
    }
}

// ─── Регистрация ──────────────────────────────────────────────────────────────
async function checkRegistration() {
    if (!provider || !userAddress) return;
    try {
        const contract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, [
            "function isRegistered(address) view returns (bool)"
        ], provider);
        const registered = await contract.isRegistered(userAddress);
        if (!registered) {
            setTimeout(() => openRegisterModal(), 900);
        } else {
            const profile = await getProfileByAddress(userAddress);
            if (profile && profile.username) {
                currentUsername = profile.username;
                updateWalletUI();
            }
        }
    } catch (e) {
        console.warn('Registration check skipped:', e.message);
    }
}

function openRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (!modal) return;
    const addrEl = document.getElementById('register-address-display');
    if (addrEl) addrEl.textContent = userAddress || '';
    modal.style.display = 'flex';
    document.getElementById('register-username').value = '';
    const msgEl = document.getElementById('register-msg');
    msgEl.textContent = '';
    msgEl.className   = 'status-msg';
    document.getElementById('register-btn').disabled = false;
}

function closeRegisterModal() {
    document.getElementById('register-modal').style.display = 'none';
}

async function registerUser() {
    const usernameInput = document.getElementById('register-username');
    const msgEl         = document.getElementById('register-msg');
    const btn           = document.getElementById('register-btn');
    const username      = usernameInput.value.trim();

    if (!username) {
        msgEl.textContent = '⚠️ Введите никнейм';
        msgEl.className   = 'status-msg error';
        return;
    }
    if (username.length < 3) {
        msgEl.textContent = '⚠️ Никнейм минимум 3 символа';
        msgEl.className   = 'status-msg error';
        return;
    }
    if (!/^[a-zA-Z0-9_а-яёА-ЯЁ]+$/.test(username)) {
        msgEl.textContent = '⚠️ Только буквы, цифры и знак _';
        msgEl.className   = 'status-msg error';
        return;
    }

    btn.disabled      = true;
    msgEl.textContent = '⏳ Отправка транзакции...';
    msgEl.className   = 'status-msg info';

    try {
        const contract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, [
            "function registerProfile(string username, string avatarCID, string bio) external"
        ], signer);
        const tx = await contract.registerProfile(username, '', '');

        msgEl.textContent = '⏳ Ожидание подтверждения в блокчейне...';
        await tx.wait();

        currentUsername = username;
        closeRegisterModal();
        updateWalletUI();
        showToast('✅ Добро пожаловать, ' + username + '! Профиль создан в Polygon.', 'success');
        console.log('✅ Registered:', username, tx.hash);
    } catch (e) {
        console.error('Register error:', e);
        const errMsg = e.reason || e?.data?.message || e.message || 'Ошибка транзакции';
        msgEl.textContent = '❌ ' + errMsg;
        msgEl.className   = 'status-msg error';
        btn.disabled      = false;
    }
}

// ─── 🔐 RSA-ключи и KeyRegistry ───────────────────────────────────────────────
async function loadOrGenerateRSAKeys() {
    if (!userAddress) return;
    const stored = localStorage.getItem('rsa_private_key');
    if (stored) {
        userRSAKeyPair = { privateKey: JSON.parse(stored) };
        console.log('🔑 RSA ключи загружены из localStorage');
        return;
    }

    showToast('🔐 Генерация ключей шифрования...', 'info');
    try {
        const keyPair = await crypto.subtle.generateKey(
            { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
            true, ["encrypt", "decrypt"]
        );
        const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
        localStorage.setItem('rsa_private_key', JSON.stringify(privateKeyJwk));
        userRSAKeyPair = { privateKey: privateKeyJwk };

        const publicKeyBytes = await crypto.subtle.exportKey("spki", keyPair.publicKey);
        const publicKeyHex = "0x" + Array.from(new Uint8Array(publicKeyBytes)).map(b => b.toString(16).padStart(2,'0')).join('');

        const keyRegistry = new ethers.Contract(KEY_REGISTRY_ADDRESS, KEY_REGISTRY_ABI, signer);
        const tx = await keyRegistry.setPublicKey(publicKeyHex);
        await tx.wait();
        showToast('✅ Ключи шифрования сохранены в блокчейне!', 'success');
    } catch (e) {
        console.error('RSA key generation failed:', e);
        showToast('❌ Ошибка генерации ключей', 'error');
    }
}

// 🔐 Гибридное шифрование (AES + RSA) – возвращает null, если ключ не найден
async function hybridEncrypt(plaintext, recipientAddress) {
    const keyRegistry = new ethers.Contract(KEY_REGISTRY_ADDRESS, KEY_REGISTRY_ABI, provider);
    let publicKeyHex;
    try {
        publicKeyHex = await keyRegistry.getPublicKey(recipientAddress);
    } catch (e) {
        return null; // ключ не найден
    }
    if (!publicKeyHex || publicKeyHex === '0x') return null;

    const publicKeyBytes = new Uint8Array(publicKeyHex.slice(2).match(/.{1,2}/g).map(b => parseInt(b,16)));
    const publicKey = await crypto.subtle.importKey("spki", publicKeyBytes, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);

    const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);

    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);

    return {
        ciphertext: "0x" + Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2,'0')).join(''),
        encryptedKey: "0x" + Array.from(new Uint8Array(encryptedAesKey)).map(b => b.toString(16).padStart(2,'0')).join(''),
        iv: "0x" + Array.from(iv).map(b => b.toString(16).padStart(2,'0')).join('')
    };
}

async function hybridDecrypt(encryptedData) {
    if (!userRSAKeyPair || !userRSAKeyPair.privateKey) {
        throw new Error('Приватный ключ не найден');
    }

    const privateKey = await crypto.subtle.importKey("jwk", userRSAKeyPair.privateKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);

    const encryptedKeyBytes = new Uint8Array(encryptedData.encryptedKey.slice(2).match(/.{1,2}/g).map(b => parseInt(b,16)));
    const ivBytes = new Uint8Array(encryptedData.iv.slice(2).match(/.{1,2}/g).map(b => parseInt(b,16)));
    const ciphertextBytes = new Uint8Array(encryptedData.ciphertext.slice(2).match(/.{1,2}/g).map(b => parseInt(b,16)));

    const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedKeyBytes);
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);

    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, aesKey, ciphertextBytes);
    return new TextDecoder().decode(decrypted);
}

// ─── Подпись и отправка сообщений (с fallback-ом на незашифрованное) ─────────
async function signMessage(text) {
    if (!signer) throw new Error('Кошелёк не подключён');
    return await signer.signMessage(text);
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const plaintext = input.value.trim();
    if (!plaintext || !store.currentChat) return;
    if (!signer) { openModal('wallet-modal'); return; }

    const chat = getChatById(store.currentChat);
    if (!chat) return;

    const recipient = ethers.utils.isAddress(chat.id) ? chat.id : null;
    if (!recipient) {
        showToast('❌ Чат не является контактом (нет адреса)', 'error');
        return;
    }

    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    input.disabled = true;
    const originalPlaceholder = input.placeholder;
    input.placeholder = '⏳ Подготовка...';

    try {
        // Пытаемся зашифровать
        let encrypted = await hybridEncrypt(plaintext, recipient);
        let messageText, isEncrypted;

        if (encrypted) {
            messageText = JSON.stringify(encrypted);
            isEncrypted = true;
        } else {
            // Ключ получателя не найден – спрашиваем пользователя
            const userChoice = confirm(
                '⚠️ У получателя нет публичного ключа шифрования.\n\n' +
                'Вы можете отправить сообщение открытым текстом (НЕЗАШИФРОВАННЫМ).\n\n' +
                'Нажмите "OK", чтобы отправить открыто, или "Отмена", чтобы отменить отправку.'
            );
            if (!userChoice) {
                showToast('❌ Отправка отменена', 'info');
                return;
            }
            messageText = plaintext;
            isEncrypted = false;
            showToast('🔓 Отправка незашифрованного сообщения', 'info');
        }

        input.placeholder = isEncrypted ? '🔐 Подпись...' : '✍️ Подпись...';

        const signature = await signMessage(messageText);
        const msgContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
        const tx = await msgContract.sendMessage(recipient, messageText, signature);

        showToast('📤 Транзакция отправлена. Ожидайте...', 'info');
        await tx.wait();

        input.value = '';
        showToast(isEncrypted ? '✅ Зашифрованное сообщение сохранено!' : '✅ Сообщение сохранено (открытый текст)', 'success');
        await loadMessagesForChat(recipient);
    } catch (e) {
        console.error('Send error:', e);
        showToast('❌ Ошибка: ' + (e.reason || e.message), 'error');
    } finally {
        btn.disabled = false;
        input.disabled = false;
        input.placeholder = originalPlaceholder;
        input.focus();
    }
}

// ─── Загрузка сообщений (с определением типа) ─────────────────────────────────
async function loadMessagesForChat(chatId) {
    if (!signer || !userAddress) return;

    const counterparty = ethers.utils.isAddress(chatId) ? chatId : null;
    if (!counterparty) return;

    try {
        const msgContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
        const [sent, received] = await msgContract.getConversation(userAddress, counterparty, 0, 50);

        const allMessages = [...sent, ...received].sort((a, b) => a.timestamp - b.timestamp);

        const formatted = [];
        for (const m of allMessages) {
            let displayText = m.text;
            let isEncrypted = false;
            try {
                const parsed = JSON.parse(m.text);
                if (parsed.ciphertext && parsed.encryptedKey && parsed.iv) {
                    displayText = await hybridDecrypt(parsed);
                    isEncrypted = true;
                } else {
                    displayText = m.text;
                }
            } catch (e) {
                displayText = m.text;
            }

            formatted.push({
                id: m.timestamp.toString() + m.sender,
                text: displayText,
                sent: m.sender.toLowerCase() === userAddress.toLowerCase(),
                time: new Date(m.timestamp * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                status: 'delivered',
                signature: m.signature,
                sender: m.sender,
                timestamp: m.timestamp,
                encrypted: isEncrypted
            });
        }

        let chat = getChatById(chatId);
        if (!chat) {
            const profile = await getProfileByAddress(counterparty);
            const name = profile?.username || counterparty.slice(0, 8) + '...';
            contactsStore.add({ address: counterparty, username: profile?.username });
            chat = {
                id: counterparty,
                name: name,
                avatar: '👤',
                online: false,
                folder: 'personal',
                messages: [],
                isContact: true
            };
            store.chats.push(chat);
        }
        chat.messages = formatted;
        if (formatted.length > 0) {
            const last = formatted[formatted.length-1];
            chat.preview = last.text;
            chat.time = last.time;
        }

        if (store.currentChat === chatId) {
            renderMessages();
        }
        renderChatList();
    } catch (e) {
        console.error('Load messages error:', e);
    }
}

async function refreshCurrentChat() {
    if (!store.currentChat) return;
    await loadMessagesForChat(store.currentChat);
    if (!autoRefreshInterval) showToast('🔄 Чат обновлён', 'info');
}

// ─── Автообновление текущего чата ─────────────────────────────────────────────
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        if (store.currentChat && signer) {
            await loadMessagesForChat(store.currentChat);
        }
    }, 10000);
}

function startDiscovery() {
    if (discoveryInterval) clearInterval(discoveryInterval);
    discoveryInterval = setInterval(async () => {
        if (!signer || !userAddress) return;
        await discoverNewChats();
    }, 30000);
}

async function discoverNewChats() {
    const msgContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
    const addressesToCheck = contactsStore.list.map(c => c.address);
    store.chats.forEach(chat => {
        if (ethers.utils.isAddress(chat.id) && !addressesToCheck.includes(chat.id)) {
            addressesToCheck.push(chat.id);
        }
    });

    for (const addr of addressesToCheck) {
        if (deletedChatsStore.has(addr)) continue;
        try {
            const count = await msgContract.messageCount(userAddress, addr);
            if (count.gt(0) && !getChatById(addr)) {
                const profile = await getProfileByAddress(addr);
                const name = profile?.username || addr.slice(0, 8) + '...';
                contactsStore.add({ address: addr, username: profile?.username });
                store.chats.push({
                    id: addr,
                    name: name,
                    avatar: '👤',
                    online: false,
                    folder: 'personal',
                    messages: [],
                    isContact: true
                });
                renderChatList();
                console.log(`🆕 Обнаружен новый чат с ${addr}`);
            }
        } catch (e) { /* игнорируем */ }
    }
}

function deleteChat(chatId) {
    const index = store.chats.findIndex(c => c.id === chatId);
    if (index === -1) return;

    if (ethers.utils.isAddress(chatId)) {
        contactsStore.remove(chatId);
    }
    deletedChatsStore.add(chatId);

    store.chats.splice(index, 1);
    if (store.currentChat === chatId) {
        store.currentChat = null;
        renderEmptyState();
        updateInputState();
    }
    renderChatList();
    showToast('🗑️ Чат удалён', 'info');
}

function getChatById(id) {
    return store.chats.find(c => c.id === id);
}

// ─── Рендеринг ───────────────────────────────────────────────────────────────
function renderSidebar() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        if (item.dataset.folder) {
            item.onclick = function() {
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                store.currentFolder = this.dataset.folder || 'all';
                store.currentChat   = null;
                renderChatList();
                renderEmptyState();
                updateInputState();
            };
        }
    });

    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.onclick = function() {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        };
    });
}

function renderChatList() {
    const list     = document.getElementById('chat-list');
    let allChats = [...store.chats];

    contactsStore.list.forEach(contact => {
        if (deletedChatsStore.has(contact.address)) return;
        if (!allChats.find(c => c.id === contact.address)) {
            allChats.push({
                id: contact.address,
                name: contact.username || contact.address.slice(0, 8) + '...',
                avatar: '👤',
                online: false,
                folder: 'personal',
                preview: 'Напишите первое сообщение',
                time: '', unread: 0, messages: [], isContact: true
            });
        }
    });

    allChats = allChats.filter(chat => !deletedChatsStore.has(chat.id));

    const filtered = store.currentFolder === 'all'
        ? allChats
        : allChats.filter(c => c.folder === store.currentFolder);

    list.innerHTML = filtered.map(chat => `
        <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
            <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <span class="chat-name">${chat.name}${chat.isContact ? ' <span class="contact-badge">🔗</span>' : ''}</span>
                    <span class="chat-time">${chat.time}</span>
                </div>
                <div class="chat-preview">
                    ${chat.preview}
                    ${chat.unread ? `<span class="badge">${chat.unread}</span>` : ''}
                </div>
            </div>
            <button class="delete-chat-btn" onclick="event.stopPropagation(); deleteChat('${chat.id}')" title="Удалить чат">✕</button>
        </div>
    `).join('');
}

function selectChat(id) {
    store.currentChat = id;
    const chat = getChatById(id);
    if (chat) {
        chat.unread = 0;
        document.getElementById('chat-name').textContent   = chat.name || id.slice(0, 8) + '...';
        document.getElementById('chat-status').textContent = chat.online ? '● в сети' : 'был недавно';
        document.getElementById('chat-avatar').textContent = chat.avatar || '👤';
        renderChatList();
        loadMessagesForChat(id);
        updateInputState();
    }
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat      = getChatById(store.currentChat);
    if (!container || !chat) return;

    if (!chat.messages || chat.messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>Нет сообщений</h3>
                <p>Напишите первое сообщение!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="date-separator"><span>Последние сообщения</span></div>
        ${chat.messages.map(m => `
            <div class="message ${m.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(m.text)}</div>
                <div class="message-meta">
                    <span>${m.time}</span>
                    ${m.sent ? `
                        <span class="status">${m.status === 'delivered' ? '✓✓' : '⏳'}</span>
                        ${m.signature ? '<span class="sig-badge" title="Подписано кошельком">🔐</span>' : ''}
                        ${m.encrypted ? '' : '<span class="unencrypted-badge" title="Незашифрованное сообщение">🔓</span>'}
                    ` : `
                        ${m.signature ? '<span class="sig-badge" title="Подписано кошельком" style="cursor:pointer;" onclick="verifySignature(\'' + m.id + '\')">🔐</span>' : ''}
                        ${m.encrypted ? '' : '<span class="unencrypted-badge" title="Незашифрованное сообщение">🔓</span>'}
                    `}
                </div>
            </div>
        `).join('')}
    `;
    container.scrollTop = container.scrollHeight;
}

async function verifySignature(msgId) {
    const chat = getChatById(store.currentChat);
    if (!chat) return;
    const msg = chat.messages.find(m => m.id === msgId);
    if (!msg || !msg.signature) return;

    try {
        const recovered = ethers.utils.verifyMessage(msg.text, msg.signature);
        if (recovered.toLowerCase() === msg.sender.toLowerCase()) {
            showToast('✅ Подпись верна! Отправитель подтверждён.', 'success');
        } else {
            showToast('⚠️ Подпись недействительна!', 'error');
        }
    } catch (e) {
        showToast('❌ Ошибка проверки подписи', 'error');
    }
}

function renderEmptyState() {
    document.getElementById('messages-container').innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">💬</div>
            <h3>Выберите чат</h3>
            <p>И подключите кошелёк для отправки</p>
        </div>
    `;
}

function updateInputState() {
    const input = document.getElementById('msg-input');
    const btn   = document.getElementById('send-btn');
    if (!input || !btn) return;

    if (store.currentChat && userAddress) {
        input.disabled    = false;
        btn.disabled      = false;
        input.placeholder = 'Написать сообщение...';
        input.focus();
    } else if (!userAddress) {
        input.disabled    = true;
        btn.disabled      = true;
        input.placeholder = '🔗 Подключите кошелёк';
    } else {
        input.disabled    = true;
        btn.disabled      = true;
        input.placeholder = 'Выберите чат...';
    }
}

function updateWalletUI() {
    const btn = document.getElementById('wallet-btn');
    if (btn && userAddress) {
        const display = currentUsername || (userAddress.slice(0, 6) + '...' + userAddress.slice(-4));
        btn.innerHTML = `<span>✅</span><span style="font-size:9px;max-width:52px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${display}</span>`;
        btn.onclick   = null;
    } else if (btn) {
        btn.innerHTML = `<span>🦊</span><span>Подключить</span>`;
        btn.onclick   = () => openModal('wallet-modal');
    }
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
function setupEventListeners() {
    document.getElementById('send-btn').onclick     = sendMessage;
    document.getElementById('msg-input').onkeypress = e => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('wallet-btn').onclick   = () => openModal('wallet-modal');
    document.getElementById('connect-btn').onclick  = connectWallet;
    document.getElementById('refresh-chat-btn').onclick = refreshCurrentChat;

    document.getElementById('search-input').oninput = e => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-item').forEach(item => {
            const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(query) ? 'flex' : 'none';
        });
    };

    if (window.ethereum) {
        window.ethereum.on("accountsChanged", async (accounts) => {
            if (accounts.length === 0) {
                userAddress = null;
                signer = null;
                updateWalletUI();
                updateInputState();
                showToast('Кошелёк отключён', 'info');
                stopAllIntervals();
            } else {
                await initWallet();
                showToast(`Адрес сменён: ${userAddress.slice(0,6)}...${userAddress.slice(-4)}`, 'success');
                if (store.currentChat) {
                    await loadMessagesForChat(store.currentChat);
                }
            }
        });

        window.ethereum.on("chainChanged", () => {
            window.location.reload();
        });
    }
}

function stopAllIntervals() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    if (discoveryInterval) clearInterval(discoveryInterval);
    autoRefreshInterval = null;
    discoveryInterval = null;
}

// ─── Модалки ─────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    const msg = document.getElementById('wallet-msg');
    if (msg) { msg.textContent = ''; msg.className = 'status-msg'; }
}
function showError(elId, msg) {
    const el = document.getElementById(elId);
    if (el) { el.textContent = msg; el.className = 'status-msg error'; }
}
function showStatus(msg, type) {
    const el = document.getElementById('wallet-msg');
    if (el) {
        el.textContent   = msg;
        el.className     = `status-msg ${type}`;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 2500);
    }
}

function showToast(msg, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className   = `toast toast-${type} toast-show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('toast-show'), 3500);
}

// ─── Утилиты ─────────────────────────────────────────────────────────────────
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ─── Админские функции ────────────────────────────────────────────────────────
function updateAdminButton() {
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
}

function openAdminModal() {
    if (!isAdmin) { alert('🔒 Доступ разрешён только владельцу.'); return; }
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('escrow-status').style.display = 'none';
    document.getElementById('escrow-user-address').value = '';
}

async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address').value.trim();
    const statusEl = document.getElementById('escrow-status');
    if (!userAddr || !ethers.utils.isAddress(userAddr)) {
        statusEl.textContent = '⚠️ Введите корректный адрес';
        statusEl.style.color = 'var(--warning)';
        statusEl.style.display = 'block';
        return;
    }
    statusEl.textContent = '🔍 Запрос к смарт-контракту...';
    statusEl.style.color = 'var(--text-muted)';
    statusEl.style.display = 'block';
    try {
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:6px 10px; border-radius:6px;">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
    } catch (err) {
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

function updateShareButton() {
    const btn = document.getElementById('share-profile-btn');
    if (btn) btn.style.display = userAddress ? 'flex' : 'none';
}

async function openShareModal() {
    if (!userAddress) { alert('🔗 Сначала подключите кошелёк'); return; }
    const modal = document.getElementById('share-modal');
    const qrContainer = document.getElementById('qr-container');
    const linkInput = document.getElementById('share-link-input');
    const shareUrl = `${BASE_URL}?contact=${userAddress}`;
    linkInput.value = shareUrl;
    qrContainer.innerHTML = '';
    new QRCode(qrContainer, { text: shareUrl, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
    modal.style.display = 'flex';
}

async function copyShareLink() {
    const input = document.getElementById('share-link-input');
    try {
        await navigator.clipboard.writeText(input.value);
        showStatus('✅ Ссылка скопирована!', 'success');
    } catch (e) {
        input.select(); document.execCommand('copy');
        showStatus('✅ Ссылка скопирована!', 'success');
    }
}

function shareToTelegram() {
    const url = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${url}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareToWhatsApp() {
    const url = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareToTwitter() {
    const url = document.getElementById('share-link-input').value;
    const text = `Присоединяйся ко мне в Web3 Messenger — децентрализованный чат на Polygon! ${url} #Web3 #Polygon #Messenger`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
}

async function addContactFromInput() {
    const input = document.getElementById('add-contact-input');
    const query = input.value.trim();
    if (!query) return;
    try {
        showStatus('🔍 Поиск...', 'info');
        let address = query;
        if (!ethers.utils.isAddress(query)) throw new Error('Введите корректный адрес');
        const profile = await getProfileByAddress(address);
        if (profile && profile.isActive) {
            contactsStore.add({ address, ...profile });
        } else {
            contactsStore.add({ address });
        }
        deletedChatsStore.delete(address);
        renderChatList();
        showStatus('✅ Контакт добавлен!', 'success');
        input.value = '';
    } catch (e) {
        showStatus('❌ ' + e.message, 'error');
    }
}

// ─── Глобальный экспорт ──────────────────────────────────────────────────────
window.selectChat          = selectChat;
window.sendMessage         = sendMessage;
window.connectWallet       = connectWallet;
window.openAdminModal      = openAdminModal;
window.accessEscrowKey     = accessEscrowKey;
window.openShareModal      = openShareModal;
window.copyShareLink       = copyShareLink;
window.shareToTelegram     = shareToTelegram;
window.shareToWhatsApp     = shareToWhatsApp;
window.shareToTwitter      = shareToTwitter;
window.addContactFromInput = addContactFromInput;
window.closeModal          = closeModal;
window.openRegisterModal   = openRegisterModal;
window.closeRegisterModal  = closeRegisterModal;
window.registerUser        = registerUser;
window.refreshCurrentChat  = refreshCurrentChat;
window.verifySignature     = verifySignature;
window.deleteChat          = deleteChat;
