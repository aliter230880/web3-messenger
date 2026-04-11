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
    chats: [],
    pagination: {} // chatId -> { offset, hasMore }
};

let lastScannedBlock = 0;
let isLoadingMore = false;

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
    document.getElementById('profile-address').textContent = userAddress || '—';
    document.getElementById('profile-username').textContent = currentUsername || 'Не задан';
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
            all.push({ id: c.address, name: c.username || c.address.slice(0,8)+'...', avatar: '👤', online: false, folder: 'personal', preview: '', time: '', unread: 0, messages: [], isContact: true });
        }
    });
    all = all.filter(c => !deletedChatsStore.has(c.id));
    const filtered = store.currentFolder === 'all' ? all : all.filter(c => c.folder === store.currentFolder);
    list.innerHTML = filtered.map(c => `
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
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat = getChatById(store.currentChat);
    if (!chat || !chat.messages?.length) {
        container.innerHTML = `<div class="empty-state"><div class="text-6xl mb-4 opacity-50">💬</div><h3>Нет сообщений</h3><p>Напишите первое сообщение!</p></div>`;
        return;
    }
    container.innerHTML = `
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
    container.scrollTop = container.scrollHeight;
}

function renderEmptyState() {
    document.getElementById('messages-container').innerHTML = `<div class="empty-state"><div class="text-6xl mb-4 opacity-50">💬</div><h3>Выберите чат</h3><p>И подключите кошелёк</p></div>`;
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
    try { const acc = await window.ethereum.request({ method: 'eth_accounts' }); if (acc.length) initWallet(); } catch(e){}
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

async function registerUser() {
    const inp = document.getElementById('register-username');
    const name = inp.value.trim();
    if (!name || name.length<3) return showToast('Никнейм минимум 3 символа', 'error');
    try {
        const c = new ethers.Contract(IDENTITY_ADDRESS, ["function registerProfile(string,string,string) external"], signer);
        const tx = await c.registerProfile(name, '', '');
        await tx.wait();
        currentUsername = name;
        closeRegisterModal();
        updateUI();
        showToast(`Добро пожаловать, ${name}!`, 'success');
    } catch(e) { showToast('Ошибка регистрации', 'error'); }
}

// ---------- Отправка сообщений ----------
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat || !signer) return;
    const chat = getChatById(store.currentChat);
    const recipient = ethers.utils.isAddress(chat.id) ? chat.id : null;
    if (!recipient) return showToast('Некорректный адрес', 'error');
    try {
        const sig = await signer.signMessage(text);
        const c = new ethers.Contract(MESSAGE_ADDRESS, MESSAGE_ABI, signer);
        const tx = await c.sendMessage(recipient, text, sig);
        await tx.wait();
        input.value = '';
        await loadMessagesForChat(recipient);
        showToast('Сообщение отправлено', 'success');
    } catch(e) { showToast('Ошибка отправки', 'error'); }
}

// ---------- Остальное (модалки, шаринг, контакты) ----------
function selectChat(id) {
    store.currentChat = id;
    const chat = getChatById(id);
    if (chat) {
        document.getElementById('chat-name').textContent = chat.name;
        document.getElementById('chat-avatar').textContent = chat.avatar;
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
    if (store.currentChat === id) { store.currentChat = null; renderEmptyState(); }
    renderChatList();
    showToast('Чат удалён', 'info');
}
function toggleUserMenu() { document.getElementById('user-dropdown-menu').classList.toggle('hidden'); }
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openRegisterModal() {
    document.getElementById('register-address-display').textContent = userAddress;
    openModal('register-modal');
}
function closeRegisterModal() { closeModal('register-modal'); }
function logout() {
    userAddress = null; signer = null;
    updateUI(); renderEmptyState();
    showToast('Вы вышли', 'info');
    toggleUserMenu();
}
// ... (остальные функции share, admin, contacts – аналогичны старой версии)

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
// ... экспорт остальных функций
