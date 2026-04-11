// Web3 Messenger v8.0 — Shadcn-inspired, infinite scroll, auto-discovery
console.log('🚀 Web3 Messenger v8.0');

if (typeof ethers === 'undefined') console.error('❌ ethers.js missing');

// ---------- Конфигурация ----------
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const BASE_URL = window.location.origin + '/';
const MESSAGES_PER_PAGE = 30;
const SCAN_BLOCKS_BACK = 10000;

const MESSAGE_ABI = [
    "function sendMessage(address recipient, string text, bytes signature) external",
    "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] sent, tuple(address sender, address recipient, string text, bytes signature, uint256 timestamp)[] received)",
    "function messageCount(address, address) view returns (uint256)",
    "event MessageSent(address indexed sender, address indexed recipient, uint256 timestamp)"
];

// ---------- Состояние ----------
let provider, signer, userAddress, isAdmin = false, currentUsername = '';
let isInitializing = false;
let autoRefreshInterval, discoveryInterval;

const contactsStore = {
    list: [],
    load() { try { const s = localStorage.getItem('wm_contacts'); if (s) this.list = JSON.parse(s); } catch(e){} },
    save() { localStorage.setItem('wm_contacts', JSON.stringify(this.list)); },
    add(c) { if (!this.list.find(x => x.address.toLowerCase() === c.address.toLowerCase())) { this.list.push(c); this.save(); return true; } return false; },
    remove(addr) { const i = this.list.findIndex(c => c.address.toLowerCase() === addr.toLowerCase()); if (i !== -1) { this.list.splice(i,1); this.save(); return true; } return false; },
    get(addr) { return this.list.find(c => c.address.toLowerCase() === addr.toLowerCase()); }
};

const deletedChatsStore = {
    set: new Set(),
    load() { try { const s = localStorage.getItem('wm_deleted'); if (s) this.set = new Set(JSON.parse(s)); } catch(e){} },
    save() { localStorage.setItem('wm_deleted', JSON.stringify([...this.set])); },
    add(id) { this.set.add(id); this.save(); },
    has(id) { return this.set.has(id); },
    delete(id) { const r = this.set.delete(id); this.save(); return r; }
};

const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', unread: 0, messages: [] },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', unread: 0, messages: [] },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', unread: 0, messages: [] },
    ],
    pagination: {} // chatId -> { offset, hasMore }
};

let lastScannedBlock = 0;
let isLoadingMore = false;
let lastRenderedMessagesHash = '';
let lastRenderedChatListHash = '';

// ---------- Инициализация ----------
document.addEventListener('DOMContentLoaded', async () => {
    contactsStore.load();
    deletedChatsStore.load();
    try { const sb = localStorage.getItem('wm_lastBlock'); if (sb) lastScannedBlock = parseInt(sb); } catch(e){}
    renderSidebar();
    renderChatList();
    setupListeners();
    updateUI();
    checkWallet();
    handleContactParam();
    initInfiniteScroll();
});

// ---------- Вспомогательные функции ----------
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(ts) {
    return new Date(ts * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function showToast(msg, type = 'success') {
    let toast = document.getElementById('global-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'global-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast toast-${type} toast-show`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('toast-show'), 3500);
}

function showStatus(msg, type) {
    const el = document.getElementById('wallet-msg');
    if (el) {
        el.textContent = msg;
        el.className = `status-msg ${type}`;
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 3000);
    }
}

async function getProfile(address) {
    if (!provider) return null;
    try {
        const c = new ethers.Contract(IDENTITY_ADDRESS, ["function getProfile(address) view returns (string,string,string,uint256,bool)"], provider);
        const r = await c.getProfile(address);
        return { username: r[0], avatarCID: r[1], bio: r[2], registeredAt: r[3].toNumber(), isActive: r[4] };
    } catch { return null; }
}

function getChatById(id) { return store.chats.find(c => c.id === id); }

function updateUI() {
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('send-btn');
    if (store.currentChat && userAddress) {
        input.disabled = false;
        btn.disabled = false;
        input.placeholder = 'Написать сообщение...';
    } else if (!userAddress) {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = '🔗 Подключите кошелёк';
    } else {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = 'Выберите чат...';
    }
    const shareBtn = document.getElementById('share-profile-btn');
    if (shareBtn) shareBtn.style.display = userAddress ? 'flex' : 'none';
    updateAvatarMenu();
}

function updateAvatarMenu() {
    const btn = document.getElementById('user-avatar-btn');
    const emoji = document.getElementById('user-avatar-emoji');
    if (btn && userAddress) {
        btn.style.display = 'flex';
        emoji.textContent = currentUsername ? currentUsername.charAt(0).toUpperCase() : '👤';
        btn.title = currentUsername || (userAddress.slice(0,6)+'...'+userAddress.slice(-4));
    } else if (btn) btn.style.display = 'none';
    const profileAddress = document.getElementById('profile-address');
    const profileUsername = document.getElementById('profile-username');
    if (profileAddress) profileAddress.textContent = userAddress || '—';
    if (profileUsername) profileUsername.textContent = currentUsername || 'Не задан';
}

function updateAdminButton() {
    const btn = document.getElementById('admin-btn');
    if (btn) btn.style.display = isAdmin ? 'flex' : 'none';
}

// ---------- Рендеринг ----------
function renderSidebar() {
    document.querySelectorAll('.sidebar-item[data-folder]').forEach(item => {
        item.onclick = () => {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            store.currentFolder = item.dataset.folder;
            store.currentChat = null;
            renderChatList();
            renderEmptyState();
            updateUI();
        };
    });
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        };
    });
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    let all = [...store.chats];
    contactsStore.list.forEach(c => {
        if (deletedChatsStore.has(c.address)) return;
        if (!all.find(ch => ch.id === c.address)) {
            all.push({ id: c.address, name: c.username || c.address.slice(0,8)+'...', avatar: '👤', online: false, folder: 'personal', preview: 'Напишите первое сообщение', time: '', unread: 0, messages: [], isContact: true });
        }
    });
    all = all.filter(c => !deletedChatsStore.has(c.id));
    const filtered = store.currentFolder === 'all' ? all : all.filter(c => c.folder === store.currentFolder);
    const newHtml = filtered.map(c => `
        <div class="chat-item ${store.currentChat === c.id ? 'active' : ''}" onclick="selectChat('${c.id}')">
            <div class="avatar ${c.online ? 'online' : ''}">${c.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <span class="chat-name">${c.name}${c.isContact?' <span class="contact-badge">🔗</span>':''}</span>
                    <span class="chat-time">${c.time||''}</span>
                </div>
                <div class="chat-preview">${c.preview||''}${c.unread?`<span class="badge">${c.unread}</span>`:''}</div>
            </div>
            <button class="delete-chat-btn" onclick="event.stopPropagation();deleteChat('${c.id}')" title="Удалить чат">✕</button>
        </div>
    `).join('');
    if (newHtml !== lastRenderedChatListHash) {
        list.innerHTML = newHtml;
        lastRenderedChatListHash = newHtml;
    }
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat = getChatById(store.currentChat);
    if (!chat || !chat.messages?.length) {
        const emptyHtml = `<div class="empty-state"><div class="text-6xl mb-4 opacity-50">💬</div><h3>Нет сообщений</h3><p>Напишите первое сообщение!</p></div>`;
        if (container.innerHTML !== emptyHtml) container.innerHTML = emptyHtml;
        lastRenderedMessagesHash = '';
        return;
    }
    const messagesHtml = `
        <div class="date-separator"><span>Последние сообщения</span></div>
        ${chat.messages.map(m => `
            <div class="message ${m.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(m.text)}</div>
                <div class="message-meta">
                    <span>${m.time}</span>
                    ${m.sent ? `<span>${m.status==='delivered'?'✓✓':'⏳'}</span>`:''}
                    ${m.signature ? `<span class="sig-badge" onclick="verifySignature('${m.id}')" title="Подписано">🔐</span>`:''}
                </div>
            </div>
        `).join('')}
    `;
    if (messagesHtml !== lastRenderedMessagesHash) {
        container.innerHTML = messagesHtml;
        container.scrollTop = container.scrollHeight;
        lastRenderedMessagesHash = messagesHtml;
    }
}

function renderEmptyState() {
    const container = document.getElementById('messages-container');
    const emptyHtml = `<div class="empty-state"><div class="text-6xl mb-4 opacity-50">💬</div><h3>Выберите чат</h3><p>И подключите кошелёк</p></div>`;
    if (container.innerHTML !== emptyHtml) container.innerHTML = emptyHtml;
    lastRenderedMessagesHash = '';
}

// ---------- Бесконечный скролл ----------
function initInfiniteScroll() {
    const container = document.getElementById('messages-container');
    container.addEventListener('scroll', async () => {
        if (container.scrollTop < 100 && !isLoadingMore && store.currentChat) {
            const chat = getChatById(store.currentChat);
            if (!chat) return;
            const pag = store.pagination[store.currentChat] || { offset: MESSAGES_PER_PAGE, hasMore: true };
            if (!pag.hasMore) return;
            isLoadingMore = true;
            const prevHeight = container.scrollHeight;
            await loadMessagesForChat(store.currentChat, pag.offset);
            container.scrollTop = container.scrollHeight - prevHeight;
            isLoadingMore = false;
        }
    });
}

async function loadMessagesForChat(chatId, start = 0) {
    if (!signer || !userAddress) return;
    const counterparty = ethers.utils.isAddress(chatId) ? chatId : null;
    if (!counterparty) return;
    try {
        const contract = new ethers.Contract(MESSAGE_ADDRESS, MESSAGE_ABI, signer);
        const [sent, received] = await contract.getConversation(userAddress, counterparty, start, MESSAGES_PER_PAGE);
        const all = [...sent, ...received].sort((a,b) => a.timestamp - b.timestamp);
        let chat = getChatById(chatId);
        if (!chat) {
            if (deletedChatsStore.has(counterparty)) return;
            const profile = await getProfile(counterparty);
            const name = profile?.username || counterparty.slice(0,8)+'...';
            contactsStore.add({ address: counterparty, username: profile?.username });
            chat = { id: counterparty, name, avatar: '👤', online: false, folder: 'personal', messages: [], isContact: true };
            store.chats.push(chat);
        }
        const formatted = all.map(m => ({
            id: m.timestamp.toString()+m.sender,
            text: m.text,
            sent: m.sender.toLowerCase() === userAddress.toLowerCase(),
            time: formatTime(m.timestamp),
            status: 'delivered',
            signature: m.signature,
            sender: m.sender,
            timestamp: m.timestamp
        }));
        if (start === 0) {
            chat.messages = formatted;
        } else {
            chat.messages = [...formatted, ...chat.messages];
        }
        store.pagination[chatId] = { offset: start + MESSAGES_PER_PAGE, hasMore: all.length === MESSAGES_PER_PAGE };
        if (formatted.length) {
            const last = formatted[formatted.length-1];
            chat.preview = last.text;
            chat.time = last.time;
        }
        if (store.currentChat === chatId) renderMessages();
        renderChatList();
    } catch(e) { console.error('Load error', e); }
}

async function refreshCurrentChat() {
    if (!store.currentChat) return;
    await loadMessagesForChat(store.currentChat);
    showToast('Чат обновлён', 'info');
}

// ---------- Автоопределение новых чатов ----------
async function scanForNewSenders() {
    if (!provider || !userAddress) return;
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = lastScannedBlock > 0 ? lastScannedBlock + 1 : Math.max(0, currentBlock - SCAN_BLOCKS_BACK);
        if (fromBlock > currentBlock) return;
        const contract = new ethers.Contract(MESSAGE_ADDRESS, MESSAGE_ABI, provider);
        const filter = contract.filters.MessageSent(null, userAddress);
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);
        const newSenders = new Set();
        events.forEach(ev => { if (ev.args.sender.toLowerCase() !== userAddress.toLowerCase()) newSenders.add(ev.args.sender); });
        for (const sender of newSenders) {
            if (deletedChatsStore.has(sender)) continue;
            let chat = getChatById(sender);
            if (!chat) {
                const profile = await getProfile(sender);
                contactsStore.add({ address: sender, username: profile?.username });
                chat = { id: sender, name: profile?.username || sender.slice(0,8)+'...', avatar: '👤', online: false, folder: 'personal', messages: [], isContact: true };
                store.chats.push(chat);
            }
            await loadMessagesForChat(sender);
        }
        if (newSenders.size) {
            renderChatList();
            showToast(`🔔 Найдены новые сообщения от ${newSenders.size} контактов`, 'info');
        }
        lastScannedBlock = currentBlock;
        localStorage.setItem('wm_lastBlock', currentBlock.toString());
    } catch(e) { console.warn('Scan error', e); }
}

function startDiscovery() {
    if (discoveryInterval) clearInterval(discoveryInterval);
    scanForNewSenders();
    discoveryInterval = setInterval(scanForNewSenders, 30000);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => { if (store.currentChat && signer) loadMessagesForChat(store.currentChat); }, 10000);
}

// ---------- Wallet ----------
async function checkWallet() {
    if (!window.ethereum) return;
    try { const acc = await window.ethereum.request({ method: 'eth_accounts' }); if (acc.length) await initWallet(); } catch(e){}
}

async function initWallet() {
    if (isInitializing) return;
    isInitializing = true;
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        updateAdminButton();
        updateUI();
        await checkRegistration();
        startAutoRefresh();
        startDiscovery();
    } catch(e) { showToast('Ошибка подключения', 'error'); }
    finally { isInitializing = false; }
}

async function connectWallet() {
    if (!window.ethereum) return showToast('Установите MetaMask', 'error');
    try {
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
        closeModal('wallet-modal');
        showToast('Кошелёк подключён', 'success');
    } catch(e) { showToast('Отменено', 'error'); }
}

// ---------- Регистрация ----------
async function checkRegistration() {
    if (!provider || !userAddress) return;
    try {
        const c = new ethers.Contract(IDENTITY_ADDRESS, ["function isRegistered(address) view returns (bool)"], provider);
        const reg = await c.isRegistered(userAddress);
        if (!reg) setTimeout(openRegisterModal, 900);
        else { const p = await getProfile(userAddress); if (p) currentUsername = p.username; updateUI(); }
    } catch(e){}
}

function openRegisterModal() {
    document.getElementById('register-address-display').textContent = userAddress;
    document.getElementById('register-modal').style.display = 'flex';
    document.getElementById('register-username').value = '';
    document.getElementById('register-msg').textContent = '';
}

function closeRegisterModal() { document.getElementById('register-modal').style.display = 'none'; }

async function registerUser() {
    const inp = document.getElementById('register-username');
    const msgEl = document.getElementById('register-msg');
    const btn = document.getElementById('register-btn');
    const name = inp.value.trim();
    if (!name || name.length < 3) { msgEl.textContent = '⚠️ Никнейм минимум 3 символа'; msgEl.className = 'status-msg error'; return; }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) { msgEl.textContent = '⚠️ Только буквы, цифры и _'; msgEl.className = 'status-msg error'; return; }
    btn.disabled = true;
    msgEl.textContent = '⏳ Отправка транзакции...';
    msgEl.className = 'status-msg info';
    try {
        const c = new ethers.Contract(IDENTITY_ADDRESS, ["function registerProfile(string,string,string) external"], signer);
        const tx = await c.registerProfile(name, '', '');
        await tx.wait();
        currentUsername = name;
        closeRegisterModal();
        updateUI();
        showToast(`Добро пожаловать, ${name}!`, 'success');
    } catch(e) {
        msgEl.textContent = '❌ Ошибка: ' + (e.reason || e.message);
        msgEl.className = 'status-msg error';
        btn.disabled = false;
    }
}

// ---------- Отправка сообщений ----------
async function signMessage(text) { return await signer.signMessage(text); }

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat || !signer) return;
    const chat = getChatById(store.currentChat);
    const recipient = ethers.utils.isAddress(chat.id) ? chat.id : null;
    if (!recipient) return showToast('Некорректный адрес', 'error');
    const btn = document.getElementById('send-btn');
    btn.disabled = true;
    input.disabled = true;
    try {
        const sig = await signMessage(text);
        const c = new ethers.Contract(MESSAGE_ADDRESS, MESSAGE_ABI, signer);
        const tx = await c.sendMessage(recipient, text, sig);
        showToast('📤 Транзакция отправлена', 'info');
        await tx.wait();
        input.value = '';
        await loadMessagesForChat(recipient);
        showToast('Сообщение отправлено', 'success');
    } catch(e) { showToast('Ошибка: ' + (e.reason || e.message), 'error'); }
    finally { btn.disabled = false; input.disabled = false; input.focus(); }
}

// ---------- Верификация подписи ----------
async function verifySignature(msgId) {
    const chat = getChatById(store.currentChat);
    if (!chat) return;
    const msg = chat.messages.find(m => m.id === msgId);
    if (!msg?.signature) return;
    try {
        const recovered = ethers.utils.verifyMessage(msg.text, msg.signature);
        if (recovered.toLowerCase() === msg.sender.toLowerCase()) showToast('✅ Подпись верна!', 'success');
        else showToast('⚠️ Подпись недействительна', 'error');
    } catch { showToast('❌ Ошибка проверки', 'error'); }
}

// ---------- Управление чатами и контактами ----------
function selectChat(id) {
    store.currentChat = id;
    const chat = getChatById(id);
    if (chat) {
        chat.unread = 0;
        document.getElementById('chat-name').textContent = chat.name;
        document.getElementById('chat-avatar').textContent = chat.avatar;
        document.getElementById('chat-status').textContent = chat.online ? '● в сети' : 'был недавно';
        renderChatList();
        loadMessagesForChat(id);
        updateUI();
    }
}

function deleteChat(id) {
    const i = store.chats.findIndex(c => c.id === id);
    if (i === -1) return;
    if (ethers.utils.isAddress(id)) contactsStore.remove(id);
    deletedChatsStore.add(id);
    store.chats.splice(i,1);
    if (store.currentChat === id) { store.currentChat = null; renderEmptyState(); updateUI(); }
    renderChatList();
    showToast('Чат удалён', 'info');
}

async function addContactFromInput() {
    const input = document.getElementById('add-contact-input');
    const addr = input.value.trim();
    if (!addr) return;
    if (!ethers.utils.isAddress(addr)) { showToast('Введите корректный адрес', 'error'); return; }
    const profile = await getProfile(addr);
    if (profile && profile.isActive) contactsStore.add({ address: addr, ...profile });
    else contactsStore.add({ address: addr });
    deletedChatsStore.delete(addr);
    renderChatList();
    showToast('Контакт добавлен', 'success');
    input.value = '';
}

// ---------- Шаринг ----------
function updateShareButton() {
    document.getElementById('share-profile-btn').style.display = userAddress ? 'flex' : 'none';
}

function openShareModal() {
    if (!userAddress) { showToast('Сначала подключите кошелёк', 'error'); return; }
    const modal = document.getElementById('share-modal');
    const qr = document.getElementById('qr-container');
    const link = document.getElementById('share-link-input');
    const url = `${BASE_URL}?contact=${userAddress}`;
    link.value = url;
    qr.innerHTML = '';
    new QRCode(qr, { text: url, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
    modal.style.display = 'flex';
}

function copyShareLink() {
    const input = document.getElementById('share-link-input');
    navigator.clipboard?.writeText(input.value).then(() => showToast('Ссылка скопирована', 'success')).catch(() => { input.select(); document.execCommand('copy'); showToast('Ссылка скопирована', 'success'); });
}

function shareToTelegram() { window.open(`https://t.me/share/url?url=${encodeURIComponent(document.getElementById('share-link-input').value)}&text=${encodeURIComponent('Привет! Добавь меня в Web3 Messenger:')}`, '_blank'); }
function shareToWhatsApp() { window.open(`https://wa.me/?text=${encodeURIComponent('Привет! Добавь меня в Web3 Messenger: ' + document.getElementById('share-link-input').value)}`, '_blank'); }
function shareToTwitter() { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent('Присоединяйся ко мне в Web3 Messenger: ' + document.getElementById('share-link-input').value)}`, '_blank'); }

// ---------- Админка ----------
function openAdminModal() {
    if (!isAdmin) { showToast('Доступ только для владельца', 'error'); return; }
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('escrow-status').style.display = 'none';
    document.getElementById('escrow-user-address').value = '';
}

async function accessEscrowKey() {
    const addr = document.getElementById('escrow-user-address').value.trim();
    const status = document.getElementById('escrow-status');
    if (!ethers.utils.isAddress(addr)) { status.textContent = '⚠️ Введите корректный адрес'; status.style.display = 'block'; return; }
    status.textContent = '🔍 Запрос...'; status.style.display = 'block';
    try {
        await new Promise(r => setTimeout(r, 1200));
        const mock = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        status.innerHTML = `✅ Ключ получен!<br><code>${mock}</code>`;
    } catch(e) { status.textContent = '❌ Ошибка'; }
}

// ---------- Профиль, контакты, настройки ----------
function toggleUserMenu() { document.getElementById('user-dropdown-menu').classList.toggle('hidden'); }
function openProfileModal() { updateAvatarMenu(); openModal('profile-modal'); toggleUserMenu(); }
function openContactsModal() { renderContactsList(); openModal('contacts-modal'); toggleUserMenu(); }
function renderContactsList() {
    const container = document.getElementById('contacts-list');
    if (contactsStore.list.length === 0) container.innerHTML = '<p class="text-muted-foreground text-center py-4">Нет контактов</p>';
    else container.innerHTML = contactsStore.list.map(c => `<div class="flex justify-between items-center py-2"><span>${c.username || c.address.slice(0,8)+'...'}</span><span class="text-muted-foreground text-xs">${c.address.slice(0,6)}...${c.address.slice(-4)}</span><button class="text-destructive text-xs" onclick="contactsStore.remove('${c.address}');renderContactsList();renderChatList()">Удалить</button></div>`).join('');
}
function logout() {
    userAddress = null; signer = null; updateUI(); renderEmptyState(); showToast('Вы вышли', 'info'); toggleUserMenu();
}
function openSettingsModal() { openModal('settingsModal'); toggleUserMenu(); }
function clearAllData() {
    if (confirm('Сбросить все данные?')) {
        localStorage.clear();
        location.reload();
    }
}

// ---------- Модалки ----------
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

// ---------- Обработка URL параметров ----------
async function handleContactParam() {
    const p = new URLSearchParams(location.search);
    const addr = p.get('contact');
    if (addr && ethers.utils.isAddress(addr)) {
        const profile = await getProfile(addr);
        if (profile?.isActive) contactsStore.add({ address: addr, ...profile });
        else contactsStore.add({ address: addr });
        renderChatList();
        showToast('Контакт добавлен!', 'success');
        history.replaceState({}, '', location.pathname);
    }
}

// ---------- Слушатели событий ----------
function setupListeners() {
    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('msg-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('connect-btn').onclick = connectWallet;
    document.getElementById('refresh-chat-btn').onclick = refreshCurrentChat;
    document.getElementById('scan-new-chats-btn').onclick = scanForNewSenders;
    document.getElementById('search-input').oninput = (e) => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.chat-item').forEach(item => {
            const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
            item.style.display = name.includes(q) ? 'flex' : 'none';
        });
    };
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-dropdown-menu');
        const btn = document.getElementById('user-avatar-btn');
        if (menu && !menu.classList.contains('hidden') && !btn.contains(e.target) && !menu.contains(e.target)) menu.classList.add('hidden');
    });
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (acc) => {
            if (acc.length === 0) {
                userAddress = null; signer = null; updateUI(); renderEmptyState();
                showToast('Кошелёк отключён', 'info');
                clearInterval(autoRefreshInterval); clearInterval(discoveryInterval);
            } else { await initWallet(); if (store.currentChat) loadMessagesForChat(store.currentChat); }
        });
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

// ---------- Глобальный экспорт ----------
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.scanForNewSenders = scanForNewSenders;
window.refreshCurrentChat = refreshCurrentChat;
window.deleteChat = deleteChat;
window.toggleUserMenu = toggleUserMenu;
window.openModal = openModal;
window.closeModal = closeModal;
window.openRegisterModal = openRegisterModal;
window.closeRegisterModal = closeRegisterModal;
window.registerUser = registerUser;
window.logout = logout;
window.openProfileModal = openProfileModal;
window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink;
window.shareToTelegram = shareToTelegram;
window.shareToWhatsApp = shareToWhatsApp;
window.shareToTwitter = shareToTwitter;
window.addContactFromInput = addContactFromInput;
window.verifySignature = verifySignature;
window.clearAllData = clearAllData;
window.contactsStore = contactsStore;
window.renderContactsList = renderContactsList;
window.renderChatList = renderChatList;
