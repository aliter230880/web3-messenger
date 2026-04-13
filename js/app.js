console.log('Web3 Messenger v10.1 — Admin Panel + E2E Encrypted');

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const REQUIRED_CHAIN_ID = 137;
const MESSAGES_PER_PAGE = 50;
const SCAN_BLOCKS_BACK = 10000;

const MESSAGE_ABI = [
    "function sendMessage(address recipient, string text, bytes signature) external",
    "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, uint256 timestamp, bytes signature)[])",
    "function messageCount(address a, address b) view returns (uint256)",
    "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

const IDENTITY_ABI = [
    "function getProfile(address) view returns (string,string,string,uint256,bool)",
    "function isRegistered(address) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external"
];

let provider, signer, userAddress = null;
let messageContract, identityContract;
let masterKey = null;
let currentUsername = '';
let isAuthenticated = false;
let isAdmin = false;

const store = { chats: [], currentChat: null, currentFolder: 'all', messages: {} };

const AVATAR_COLORS = [
    ['#3b82f6','#6366f1'], ['#8b5cf6','#a855f7'], ['#ec4899','#f43f5e'],
    ['#f59e0b','#f97316'], ['#22c55e','#10b981'], ['#06b6d4','#0ea5e9'],
    ['#6366f1','#8b5cf6'], ['#f43f5e','#e11d48'], ['#14b8a6','#22d3ee'],
    ['#a855f7','#c084fc']
];

function getAvatarColor(addr) {
    let hash = 0;
    const s = (addr || '').toLowerCase();
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function shortAddr(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function escHtml(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatTime(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts) {
    const d = new Date(ts * 1000);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const contactsStore = {
    list: [],
    load() { try { const s = localStorage.getItem('w3m_contacts_' + userAddress); if (s) this.list = JSON.parse(s); } catch(e){} },
    save() { try { localStorage.setItem('w3m_contacts_' + userAddress, JSON.stringify(this.list)); } catch(e){} },
    add(c) {
        const addr = c.address.toLowerCase();
        if (!this.list.find(x => x.address.toLowerCase() === addr)) {
            this.list.push(c); this.save(); return true;
        }
        return false;
    },
    remove(addr) {
        const i = this.list.findIndex(c => c.address.toLowerCase() === addr.toLowerCase());
        if (i !== -1) { this.list.splice(i, 1); this.save(); return true; }
        return false;
    },
    find(addr) { return this.list.find(c => c.address.toLowerCase() === addr.toLowerCase()); },
    getName(addr) {
        const c = this.find(addr);
        return c ? c.name : shortAddr(addr);
    }
};

function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const d = document.createElement('div');
    d.className = 'toast ' + type;
    d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 380); }, 3000);
}

// ====================== CRYPTO ======================
async function deriveMasterKey(password, addr) {
    const salt = 'w3m-master-' + (addr || userAddress).toLowerCase();
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
    const keyBits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
    return new Uint8Array(keyBits);
}

async function getChatKey(peer) {
    if (!masterKey) throw new Error("Master key not initialized");
    const sorted = [userAddress.toLowerCase(), peer.toLowerCase()].sort().join(':');
    const cryptoKey = await crypto.subtle.importKey("raw", masterKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(sorted));
    return new Uint8Array(sig);
}

async function encrypt(text, peer) {
    const key = await getChatKey(peer);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const msg = new TextEncoder().encode(text);
    const box = nacl.secretbox(msg, nonce, key);
    const combined = new Uint8Array(nonce.length + box.length);
    combined.set(nonce);
    combined.set(box, nonce.length);
    return btoa(String.fromCharCode.apply(null, combined));
}

async function decrypt(encBase64, peer) {
    try {
        const key = await getChatKey(peer);
        const data = atob(encBase64);
        const combined = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) combined[i] = data.charCodeAt(i);
        const nonce = combined.slice(0, nacl.secretbox.nonceLength);
        const box = combined.slice(nacl.secretbox.nonceLength);
        const dec = nacl.secretbox.open(box, nonce, key);
        if (!dec) return null;
        return new TextDecoder().decode(dec);
    } catch (e) { return null; }
}

// ====================== ACCOUNT DATA ======================
function getAccountData(addr) {
    try {
        const raw = localStorage.getItem('w3m_account_' + addr.toLowerCase());
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

function setAccountData(addr, data) {
    localStorage.setItem('w3m_account_' + addr.toLowerCase(), JSON.stringify(data));
}

function isRegistered(addr) {
    return !!getAccountData(addr);
}

async function verifyPassword(addr, password) {
    const account = getAccountData(addr);
    if (!account) return false;
    const key = await deriveMasterKey(password, addr);
    const hash = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
    return hash === account.keyHash;
}

// ====================== UI HELPERS ======================
function renderAvatarCircle(el, name, addr) {
    const colors = getAvatarColor(addr);
    el.style.background = 'linear-gradient(135deg, ' + colors[0] + ', ' + colors[1] + ')';
    el.textContent = getInitials(name || shortAddr(addr));
}

function updateUserUI() {
    const avatarBtn = document.getElementById('user-avatar-btn');
    const avatarCircle = document.getElementById('user-avatar-circle');
    const dropdownAvatar = document.getElementById('dropdown-avatar-circle');
    const dropdownName = document.getElementById('dropdown-username');
    const dropdownAddr = document.getElementById('dropdown-address');
    const adminSection = document.getElementById('admin-dropdown-section');
    const adminBadge = document.getElementById('dropdown-admin-badge');
    const adminIndicator = document.getElementById('admin-indicator');

    if (userAddress && isAuthenticated) {
        avatarBtn.style.display = 'block';
        renderAvatarCircle(avatarCircle, currentUsername, userAddress);
        renderAvatarCircle(dropdownAvatar, currentUsername, userAddress);
        dropdownName.textContent = currentUsername || shortAddr(userAddress);
        dropdownAddr.textContent = shortAddr(userAddress);

        if (isAdmin) {
            if (adminSection) adminSection.style.display = 'block';
            if (adminBadge) adminBadge.style.display = 'flex';
            if (adminIndicator) adminIndicator.style.display = 'flex';
        } else {
            if (adminSection) adminSection.style.display = 'none';
            if (adminBadge) adminBadge.style.display = 'none';
            if (adminIndicator) adminIndicator.style.display = 'none';
        }
    } else {
        avatarBtn.style.display = 'none';
    }
}

function renderWelcome() {
    const container = document.getElementById('messages-container');
    document.getElementById('chat-topbar').style.display = 'none';
    document.getElementById('input-bar').style.display = 'none';
    container.innerHTML =
        '<div class="empty-state">' +
            '<div class="empty-icon">' +
                '<svg viewBox="0 0 80 80"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#8b5cf6"/></linearGradient></defs>' +
                '<circle cx="40" cy="40" r="40" fill="rgba(59,130,246,0.06)"/>' +
                '<path d="M20 28c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V28z" fill="rgba(59,130,246,0.1)" stroke="url(#g1)" stroke-width="1.5"/>' +
                '<circle cx="32" cy="37" r="2" fill="#3b82f6"/><circle cx="40" cy="37" r="2" fill="#6366f1"/><circle cx="48" cy="37" r="2" fill="#8b5cf6"/></svg>' +
            '</div>' +
            '<h3>Web3 Messenger</h3>' +
            '<p>Децентрализованное общение с полным E2E шифрованием на блокчейне Polygon.</p>' +
            (!userAddress ? '<button class="btn-primary" style="max-width:240px;margin-top:8px;" onclick="connectWallet()">Подключить кошелёк</button>' : '') +
        '</div>';
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    if (!list) return;

    const contacts = contactsStore.list;
    const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase();

    const filtered = contacts.filter(c => {
        if (searchVal && !c.name.toLowerCase().includes(searchVal) && !c.address.toLowerCase().includes(searchVal)) return false;
        return true;
    });

    if (filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px;">Нет контактов.<br>Добавьте адрес собеседника выше.</div>';
        return;
    }

    list.innerHTML = filtered.map(c => {
        const colors = getAvatarColor(c.address);
        const isActive = store.currentChat === c.address.toLowerCase();
        const lastMsg = store.messages[c.address.toLowerCase()]?.slice(-1)[0];
        const lastText = lastMsg ? (lastMsg.text || 'Зашифрованное сообщение') : '';
        const lastTime = lastMsg ? formatTime(lastMsg.timestamp) : '';

        return '<div class="chat-item' + (isActive ? ' active' : '') + '" onclick="selectChat(\'' + c.address + '\')">' +
            '<div class="chat-item-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')">' +
                getInitials(c.name) +
            '</div>' +
            '<div class="chat-item-info">' +
                '<div class="chat-item-name">' + escHtml(c.name) + '</div>' +
                '<div class="chat-item-last">' + escHtml(lastText.slice(0, 40)) + '</div>' +
            '</div>' +
            '<div class="chat-item-meta">' +
                (lastTime ? '<div class="chat-item-time">' + lastTime + '</div>' : '') +
            '</div>' +
        '</div>';
    }).join('');
}

async function selectChat(addr) {
    store.currentChat = addr.toLowerCase();
    renderChatList();
    await loadMessages(addr);
}

async function loadMessages(addr) {
    const container = document.getElementById('messages-container');
    const topbar = document.getElementById('chat-topbar');
    const inputBar = document.getElementById('input-bar');

    topbar.style.display = 'flex';
    inputBar.style.display = 'flex';

    const name = contactsStore.getName(addr);
    const colors = getAvatarColor(addr);
    document.getElementById('chat-avatar').style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
    document.getElementById('chat-avatar').textContent = getInitials(name);
    document.getElementById('chat-name').textContent = name;
    document.getElementById('chat-status').textContent = 'Polygon Mainnet';

    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;

    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="loading-spinner"></div></div>';

    try {
        if (!messageContract) {
            container.innerHTML = '<div class="empty-state"><h3>Контракт не подключён</h3><p>Подключитесь к Polygon Mainnet.</p></div>';
            return;
        }

        const count = await messageContract.messageCount(userAddress, addr);
        const total = count.toNumber();

        if (total === 0) {
            store.messages[addr.toLowerCase()] = [];
            container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
            return;
        }

        const start = Math.max(0, total - MESSAGES_PER_PAGE);
        const rawMsgs = await messageContract.getConversation(userAddress, addr, start, MESSAGES_PER_PAGE);

        const messages = [];
        for (const m of rawMsgs) {
            const isMine = m.sender.toLowerCase() === userAddress.toLowerCase();
            const peer = isMine ? m.recipient : m.sender;
            let text = await decrypt(m.text, peer);
            if (!text) text = m.text;

            messages.push({
                sender: m.sender,
                recipient: m.recipient,
                text: text,
                timestamp: m.timestamp.toNumber(),
                isMine: isMine
            });
        }

        store.messages[addr.toLowerCase()] = messages;
        renderMessages(messages);
    } catch (e) {
        console.error('Load messages error:', e);
        container.innerHTML = '<div class="empty-state"><p>Ошибка загрузки сообщений</p></div>';
    }
}

function renderMessages(messages) {
    const container = document.getElementById('messages-container');
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>Нет сообщений. Начните общение!</p></div>';
        return;
    }

    let html = '';
    let lastDate = '';

    for (const m of messages) {
        const dateStr = formatDate(m.timestamp);
        if (dateStr !== lastDate) {
            html += '<div class="msg-date-divider"><span>' + dateStr + '</span></div>';
            lastDate = dateStr;
        }

        const cls = m.isMine ? 'sent' : 'received';
        html += '<div class="message ' + cls + '">' +
            '<div class="msg-bubble">' +
                '<div class="msg-text">' + escHtml(m.text) + '</div>' +
                '<div class="msg-time">' + formatTime(m.timestamp) + '</div>' +
            '</div>' +
        '</div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat || !messageContract) return;

    input.value = '';
    const peer = store.currentChat;

    try {
        const encrypted = await encrypt(text, peer);
        const sig = await signer.signMessage(text);
        const sigBytes = ethers.utils.arrayify(sig);

        showToast('Отправка транзакции...', 'info');
        const tx = await messageContract.sendMessage(peer, encrypted, sigBytes);
        showToast('Ожидание подтверждения...', 'info');
        await tx.wait();
        showToast('Сообщение отправлено', 'success');

        const now = Math.floor(Date.now() / 1000);
        if (!store.messages[peer]) store.messages[peer] = [];
        store.messages[peer].push({ sender: userAddress, recipient: peer, text, timestamp: now, isMine: true });
        renderMessages(store.messages[peer]);
        renderChatList();
    } catch (e) {
        console.error('Send error:', e);
        if (e.code === 4001 || e.code === 'ACTION_REJECTED') showToast('Транзакция отклонена', 'error');
        else showToast('Ошибка отправки: ' + (e.reason || e.message || ''), 'error');
    }
}

async function discoverChats() {
    if (!messageContract || !userAddress) return;
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - SCAN_BLOCKS_BACK);

        const [sentEvents, recvEvents] = await Promise.all([
            messageContract.queryFilter(messageContract.filters.MessageSent(userAddress, null), fromBlock, currentBlock),
            messageContract.queryFilter(messageContract.filters.MessageSent(null, userAddress), fromBlock, currentBlock)
        ]);

        const peers = new Set();
        sentEvents.forEach(e => peers.add(e.args.recipient.toLowerCase()));
        recvEvents.forEach(e => peers.add(e.args.sender.toLowerCase()));
        peers.delete(userAddress.toLowerCase());

        for (const addr of peers) {
            contactsStore.add({ address: addr, name: shortAddr(addr) });
        }
        renderChatList();
    } catch (e) {
        console.error('Discover chats error:', e);
    }
}

// ====================== WALLET ======================
async function connectWallet() {
    if (!window.ethereum) {
        showToast('MetaMask не установлен', 'error');
        return;
    }
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
    } catch (e) {
        showToast('Ошибка подключения кошелька', 'error');
    }
}

async function initWallet() {
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        const network = await provider.getNetwork();

        if (network.chainId !== REQUIRED_CHAIN_ID) {
            showToast('Переключитесь на Polygon Mainnet', 'error');
            try {
                await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] });
                provider = new ethers.providers.Web3Provider(window.ethereum);
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{ chainId: '0x89', chainName: 'Polygon Mainnet', nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 }, rpcUrls: ['https://polygon-rpc.com'], blockExplorerUrls: ['https://polygonscan.com/'] }]
                    });
                    provider = new ethers.providers.Web3Provider(window.ethereum);
                } else return;
            }
        }

        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

        messageContract = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
        identityContract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);

        document.getElementById('wallet-btn').style.display = 'none';

        if (!isRegistered(userAddress)) {
            openRegisterModal();
        } else {
            const account = getAccountData(userAddress);
            currentUsername = account.username || shortAddr(userAddress);
            openLoginModal();
        }
    } catch (e) {
        console.error('Init wallet error:', e);
        showToast('Ошибка инициализации: ' + e.message, 'error');
    }
}

// ====================== AUTH ======================
function openRegisterModal() { document.getElementById('register-modal').style.display = 'flex'; }

function openLoginModal() {
    const el = document.getElementById('login-greeting');
    el.textContent = currentUsername ? currentUsername + ', с возвращением!' : 'Вход в аккаунт';
    document.getElementById('login-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('login-password-input').focus(), 100);
}

async function handleRegister() {
    const username = document.getElementById('reg-username-input').value.trim();
    const password = document.getElementById('reg-password-input').value;
    const confirm = document.getElementById('reg-password-confirm').value;

    if (!username || username.length < 2) { showToast('Логин минимум 2 символа', 'error'); return; }
    if (!password || password.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (password !== confirm) { showToast('Пароли не совпадают', 'error'); return; }

    try {
        const key = await deriveMasterKey(password);
        const keyHash = Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
        setAccountData(userAddress, { username, keyHash, createdAt: Date.now() });
        masterKey = key;
        currentUsername = username;
        isAuthenticated = true;
        closeModal('register-modal');
        showToast('Аккаунт создан! Ключи шифрования сгенерированы.', 'success');
        onAuthenticated();
    } catch (e) {
        showToast('Ошибка регистрации: ' + e.message, 'error');
    }
}

async function handleLogin() {
    const password = document.getElementById('login-password-input').value;
    if (!password) { showToast('Введите пароль', 'error'); return; }

    const valid = await verifyPassword(userAddress, password);
    if (!valid) {
        showToast('Неверный пароль', 'error');
        document.getElementById('login-password-input').value = '';
        document.getElementById('login-password-input').focus();
        return;
    }

    masterKey = await deriveMasterKey(password);
    const account = getAccountData(userAddress);
    currentUsername = account.username || shortAddr(userAddress);
    isAuthenticated = true;

    closeModal('login-modal');
    showToast('Добро пожаловать, ' + currentUsername + '!', 'success');
    onAuthenticated();
}

function onAuthenticated() {
    updateUserUI();
    contactsStore.load();
    renderChatList();
    renderWelcome();
    discoverChats();
}

// ====================== ADMIN PANEL ======================
function openAdminPanel(tab) {
    if (!isAdmin) { showToast('Доступ запрещён', 'error'); return; }
    document.getElementById('user-dropdown-menu').classList.add('hidden');

    const modal = document.getElementById('admin-modal');
    modal.style.display = 'flex';

    const addrEl = document.getElementById('admin-owner-addr-val');
    if (addrEl) addrEl.textContent = shortAddr(ADMIN_ADDRESS);

    switchAdminTab(tab || 'escrow');

    if (tab === 'stats') adminLoadStats();
    if (tab === 'monetization') adminLoadMonetization();
}

function switchAdminTab(tab, btn) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

    const content = document.getElementById('admin-tab-' + tab);
    if (content) content.classList.add('active');

    if (btn) {
        btn.classList.add('active');
    } else {
        document.querySelectorAll('.admin-tab').forEach(t => {
            if (t.getAttribute('onclick') && t.getAttribute('onclick').includes("'" + tab + "'")) t.classList.add('active');
        });
    }

    if (tab === 'stats') adminLoadStats();
    if (tab === 'monetization') adminLoadMonetization();
}

// KEY ESCROW
function adminLookupUser() {
    const addr = document.getElementById('escrow-addr-input').value.trim();
    if (!addr || !ethers.utils.isAddress(addr)) {
        showToast('Введите корректный адрес', 'error'); return;
    }

    const account = getAccountData(addr);
    const infoEl = document.getElementById('escrow-user-info');

    if (!account) {
        showToast('Пользователь не найден в локальной базе', 'error');
        infoEl.style.display = 'none';
        return;
    }

    infoEl.style.display = 'block';
    const avatarEl = document.getElementById('escrow-user-avatar');
    const colors = getAvatarColor(addr);
    avatarEl.style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
    avatarEl.textContent = getInitials(account.username || shortAddr(addr));

    document.getElementById('escrow-user-name').textContent = account.username || shortAddr(addr);
    document.getElementById('escrow-user-addr').textContent = shortAddr(addr);
    document.getElementById('escrow-user-date').textContent = 'Зарегистрирован: ' + new Date(account.createdAt || 0).toLocaleDateString('ru-RU');

    const statusEl = document.getElementById('escrow-user-status');
    const tier = getPremiumTier(addr);
    statusEl.textContent = tier === 'free' ? 'Free' : tier.toUpperCase();
    statusEl.className = 'admin-user-status status-' + tier;
}

async function adminResetUserKey() {
    const addr = document.getElementById('escrow-addr-input').value.trim();
    const newPassword = document.getElementById('escrow-new-password').value;

    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Адрес не найден', 'error'); return; }
    if (!newPassword || newPassword.length < 6) { showToast('Пароль минимум 6 символов', 'error'); return; }
    if (!confirm('Сбросить ключ шифрования для ' + shortAddr(addr) + '? Операция необратима.')) return;

    try {
        const newKey = await deriveMasterKey(newPassword, addr);
        const keyHash = Array.from(newKey).map(b => b.toString(16).padStart(2, '0')).join('');

        const account = getAccountData(addr);
        account.keyHash = keyHash;
        account.resetAt = Date.now();
        account.resetBy = userAddress;
        setAccountData(addr, account);

        document.getElementById('escrow-new-password').value = '';
        showToast('Ключ сброшен. Пользователь может войти с новым паролем.', 'success');
    } catch (e) {
        showToast('Ошибка сброса ключа: ' + e.message, 'error');
    }
}

// MONETIZATION
function getPremiumData() {
    try {
        const raw = localStorage.getItem('w3m_premium');
        return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
}

function setPremiumData(data) {
    localStorage.setItem('w3m_premium', JSON.stringify(data));
}

function getPremiumTier(addr) {
    const data = getPremiumData();
    return (data[addr.toLowerCase()] || {}).tier || 'free';
}

function adminLoadMonetization() {
    const premium = getPremiumData();
    const tiers = Object.values(premium);
    const premiumCount = tiers.filter(t => t.tier !== 'free').length;

    const allAccounts = Object.keys(localStorage).filter(k => k.startsWith('w3m_account_')).length;
    document.getElementById('mon-total-accounts').textContent = allAccounts;
    document.getElementById('mon-premium-count').textContent = premiumCount;

    const listEl = document.getElementById('premium-list');
    if (Object.keys(premium).length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-muted);font-size:13px;">Нет активных премиум-статусов</div>';
        return;
    }

    listEl.innerHTML = Object.entries(premium).map(([addr, info]) => {
        if (!info.tier || info.tier === 'free') return '';
        const colors = getAvatarColor(addr);
        const account = getAccountData(addr);
        const name = account ? account.username : shortAddr(addr);
        return '<div class="admin-premium-item">' +
            '<div class="admin-user-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ');width:32px;height:32px;font-size:12px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">' + getInitials(name) + '</div>' +
            '<div style="flex:1"><div style="font-size:13px;font-weight:600;color:var(--text-main)">' + escHtml(name) + '</div><div style="font-size:11px;color:var(--text-muted)">' + shortAddr(addr) + '</div></div>' +
            '<div class="admin-tier-badge tier-' + info.tier + '">' + info.tier.toUpperCase() + '</div>' +
            '<button onclick="adminRevokePremium(\'' + addr + '\')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:4px;font-size:16px;" title="Отозвать">&times;</button>' +
        '</div>';
    }).join('');
}

function adminSetPremium() {
    const addr = document.getElementById('premium-addr-input').value.trim();
    const tier = document.getElementById('premium-tier-select').value;

    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Введите корректный адрес', 'error'); return; }

    const data = getPremiumData();
    data[addr.toLowerCase()] = { tier, setAt: Date.now(), setBy: userAddress };
    setPremiumData(data);

    document.getElementById('premium-addr-input').value = '';
    showToast('Статус ' + tier.toUpperCase() + ' установлен', 'success');
    adminLoadMonetization();
}

function adminRevokePremium(addr) {
    const data = getPremiumData();
    if (data[addr.toLowerCase()]) {
        data[addr.toLowerCase()].tier = 'free';
        setPremiumData(data);
        adminLoadMonetization();
        showToast('Статус отозван', 'info');
    }
}

// STATS
async function adminLoadStats() {
    const el = document.getElementById('stats-block');
    const netInfo = document.getElementById('stats-network-info');
    if (el) el.textContent = '...';
    if (netInfo) netInfo.textContent = '';

    try {
        if (!provider) { if (el) el.textContent = 'Нет соединения'; return; }
        const block = await provider.getBlockNumber();
        const balance = await provider.getBalance(ADMIN_ADDRESS);
        const balEth = parseFloat(ethers.utils.formatEther(balance)).toFixed(4);

        if (el) el.textContent = block.toLocaleString();
        if (netInfo) netInfo.innerHTML =
            '<div class="admin-net-row"><span>Баланс Owner</span><span class="accent">' + balEth + ' MATIC</span></div>' +
            '<div class="admin-net-row"><span>RPC</span><span>polygon-rpc.com</span></div>' +
            '<div class="admin-net-row"><span>Локальных аккаунтов</span><span>' + Object.keys(localStorage).filter(k => k.startsWith('w3m_account_')).length + '</span></div>';
    } catch (e) {
        if (el) el.textContent = 'Ошибка';
        console.error('Stats error:', e);
    }
}

// BROADCAST
function adminPreviewBroadcast() {
    const title = document.getElementById('bc-title-input').value.trim();
    const text = document.getElementById('bc-text-input').value.trim();
    const type = document.querySelector('input[name="bc-type"]:checked')?.value || 'info';

    if (!title || !text) { showToast('Заполните заголовок и текст', 'error'); return; }

    const preview = document.getElementById('bc-preview');
    const icons = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };
    preview.style.display = 'block';
    preview.innerHTML = '<div class="bc-preview-card bc-' + type + '">' +
        '<div class="bc-preview-header">' + icons[type] + ' ' + escHtml(title) + '</div>' +
        '<div class="bc-preview-body">' + escHtml(text) + '</div>' +
        '<div class="bc-preview-footer">От: ' + currentUsername + ' (' + shortAddr(userAddress) + ') · Сейчас</div>' +
    '</div>';
}

async function adminSendBroadcast() {
    const title = document.getElementById('bc-title-input').value.trim();
    const text = document.getElementById('bc-text-input').value.trim();
    const type = document.querySelector('input[name="bc-type"]:checked')?.value || 'info';

    if (!title || !text) { showToast('Заполните заголовок и текст', 'error'); return; }
    if (!confirm('Отправить broadcast всем пользователям? Это потребует подписи транзакции.')) return;

    const payload = JSON.stringify({ type: 'broadcast', msgType: type, title, body: text, from: userAddress, ts: Date.now() });

    try {
        showToast('Подписание broadcast...', 'info');
        const sig = await signer.signMessage(payload);
        const saved = JSON.parse(localStorage.getItem('w3m_broadcasts') || '[]');
        saved.unshift({ type: 'broadcast', msgType: type, title, body: text, from: userAddress, ts: Date.now(), sig });
        localStorage.setItem('w3m_broadcasts', JSON.stringify(saved.slice(0, 50)));

        document.getElementById('bc-title-input').value = '';
        document.getElementById('bc-text-input').value = '';
        document.getElementById('bc-preview').style.display = 'none';
        showToast('Broadcast подписан и сохранён', 'success');
    } catch (e) {
        if (e.code === 4001) showToast('Подпись отклонена', 'error');
        else showToast('Ошибка: ' + e.message, 'error');
    }
}

// ====================== PROFILE & CONTACTS ======================
function setFolder(f) {
    store.currentFolder = f;
    store.currentChat = null;
    document.querySelectorAll('.sb-icon[data-folder]').forEach(el => el.classList.toggle('active', el.dataset.folder === f));
    const titles = { all: 'Все чаты', personal: 'Личное', work: 'Работа' };
    document.getElementById('folder-title').textContent = titles[f] || 'Чаты';
    renderChatList();
    renderWelcome();
}

function filterChatList() { renderChatList(); }

function addContactFromInput() {
    const input = document.getElementById('add-contact-input');
    addContact(input.value.trim());
    input.value = '';
}

function addContactFromModal() {
    const input = document.getElementById('contacts-add-input');
    addContact(input.value.trim());
    input.value = '';
    renderContactsList();
}

function addContact(addr) {
    if (!addr || !ethers.utils.isAddress(addr)) { showToast('Введите корректный Ethereum адрес', 'error'); return; }
    if (addr.toLowerCase() === userAddress?.toLowerCase()) { showToast('Нельзя добавить себя', 'error'); return; }
    const added = contactsStore.add({ address: addr, name: shortAddr(addr) });
    if (added) { showToast('Контакт добавлен', 'success'); renderChatList(); }
    else showToast('Контакт уже существует', 'info');
}

function toggleUserMenu() {
    const menu = document.getElementById('user-dropdown-menu');
    menu.classList.toggle('hidden');
    if (!menu.classList.contains('hidden')) {
        setTimeout(() => document.addEventListener('click', closeUserMenuOnClick, { once: true }), 10);
    }
}

function closeUserMenuOnClick(e) {
    const menu = document.getElementById('user-dropdown-menu');
    if (!menu.contains(e.target) && e.target.id !== 'user-avatar-btn') menu.classList.add('hidden');
}

function openProfileModal() {
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    const modal = document.getElementById('profile-modal');
    modal.style.display = 'flex';
    renderAvatarCircle(document.getElementById('profile-avatar-large'), currentUsername, userAddress);
    document.getElementById('profile-username-display').textContent = currentUsername;
    document.getElementById('profile-address-display').textContent = shortAddr(userAddress);
    document.getElementById('profile-username-edit').value = currentUsername;
}

function saveProfile() {
    const newName = document.getElementById('profile-username-edit').value.trim();
    if (!newName || newName.length < 2) { showToast('Имя минимум 2 символа', 'error'); return; }
    currentUsername = newName;
    const account = getAccountData(userAddress);
    account.username = newName;
    setAccountData(userAddress, account);
    updateUserUI();
    closeModal('profile-modal');
    showToast('Профиль обновлён', 'success');
}

function openContactsModal() {
    document.getElementById('user-dropdown-menu').classList.add('hidden');
    document.getElementById('contacts-modal').style.display = 'flex';
    renderContactsList();
}

function renderContactsList() {
    const list = document.getElementById('contacts-list');
    if (contactsStore.list.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);">Нет контактов</div>';
        return;
    }
    list.innerHTML = contactsStore.list.map(c => {
        const colors = getAvatarColor(c.address);
        return '<div class="contact-item">' +
            '<div class="contact-item-avatar" style="background:linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')">' + getInitials(c.name) + '</div>' +
            '<div class="contact-item-info"><div class="contact-item-name">' + escHtml(c.name) + '</div><div class="contact-item-addr">' + c.address + '</div></div>' +
            '<button class="contact-item-remove" onclick="removeContact(\'' + c.address + '\')" title="Удалить">&times;</button>' +
        '</div>';
    }).join('');
}

function removeContact(addr) {
    contactsStore.remove(addr);
    renderContactsList();
    renderChatList();
    showToast('Контакт удалён', 'info');
}

function openSettingsModal() { document.getElementById('settings-modal').style.display = 'flex'; }

function resetAccount() {
    if (!userAddress) return;
    if (!confirm('Удалить все локальные данные аккаунта?')) return;
    localStorage.removeItem('w3m_account_' + userAddress.toLowerCase());
    localStorage.removeItem('w3m_contacts_' + userAddress.toLowerCase());
    showToast('Аккаунт сброшен', 'info');
    setTimeout(() => location.reload(), 500);
}

function openPeerProfile() {
    if (!store.currentChat) return;
    const name = contactsStore.getName(store.currentChat);
    showToast(name + ' (' + shortAddr(store.currentChat) + ')', 'info');
}

async function refreshChats() {
    if (!isAuthenticated) { showToast('Сначала войдите в аккаунт', 'error'); return; }
    showToast('Обновление...', 'info');
    await discoverChats();
    if (store.currentChat) await loadMessages(store.currentChat);
    showToast('Обновлено', 'success');
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBg(e, id) { if (e.target.id === id) closeModal(id); }

function logout() {
    masterKey = null; isAuthenticated = false; isAdmin = false;
    userAddress = null; currentUsername = '';
    store.currentChat = null; store.messages = {};
    contactsStore.list = [];
    location.reload();
}

// ====================== GLOBAL EXPORTS ======================
window.connectWallet = connectWallet;
window.sendMessage = sendMessage;
window.setFolder = setFolder;
window.selectChat = selectChat;
window.handleRegister = handleRegister;
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openProfileModal = openProfileModal;
window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal;
window.openAdminPanel = openAdminPanel;
window.switchAdminTab = switchAdminTab;
window.openPeerProfile = openPeerProfile;
window.closeModal = closeModal;
window.closeModalOnBg = closeModalOnBg;
window.addContactFromInput = addContactFromInput;
window.addContactFromModal = addContactFromModal;
window.removeContact = removeContact;
window.refreshChats = refreshChats;
window.filterChatList = filterChatList;
window.saveProfile = saveProfile;
window.resetAccount = resetAccount;
window.adminLookupUser = adminLookupUser;
window.adminResetUserKey = adminResetUserKey;
window.adminSetPremium = adminSetPremium;
window.adminRevokePremium = adminRevokePremium;
window.adminLoadStats = adminLoadStats;
window.adminPreviewBroadcast = adminPreviewBroadcast;
window.adminSendBroadcast = adminSendBroadcast;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Web3 Messenger v10.1 loaded');
    renderWelcome();

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
        window.ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts && accounts.length > 0) initWallet();
        });
    }
});
