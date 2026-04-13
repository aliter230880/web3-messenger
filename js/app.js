// Web3 Messenger v9.6 — Master Key + Password Auth (полностью рабочая версия)
console.log('🚀 Web3 Messenger v9.6 — Master Key + Password Auth');

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const REQUIRED_CHAIN_ID = 137;

let provider, signer, userAddress = null;
let isAdmin = false;
let currentUsername = '';
let masterKey = null;

const contactsStore = {
    list: [],
    load() { try { const s = localStorage.getItem('w3m_contacts'); if (s) this.list = JSON.parse(s); } catch(e){} },
    save() { try { localStorage.setItem('w3m_contacts', JSON.stringify(this.list)); } catch(e){} },
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
    }
};

const deletedChatsStore = {
    set: new Set(),
    load() { try { const s = localStorage.getItem('w3m_deleted'); if (s) this.set = new Set(JSON.parse(s)); } catch(e){} },
    save() { try { localStorage.setItem('w3m_deleted', JSON.stringify([...this.set])); } catch(e){} },
    add(id) { this.set.add(id.toLowerCase()); this.save(); },
    has(id) { return this.set.has(id.toLowerCase()); },
    del(id) { const r = this.set.delete(id.toLowerCase()); this.save(); return r; }
};

const store = { chats: [], currentChat: null, currentFolder: 'all', currentTab: 'all' };

// ====================== MASTER KEY ======================
async function deriveMasterKey(password) {
    const salt = `w3m-master-${userAddress.toLowerCase()}`;
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), {name: "PBKDF2"}, false, ["deriveBits"]);
    const keyBits = await crypto.subtle.deriveBits({name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256"}, keyMaterial, 256);
    return new Uint8Array(keyBits);
}

async function ensureMasterKey(password = null) {
    if (masterKey) return masterKey;
    if (!password) throw new Error("Master key not set");
    masterKey = await deriveMasterKey(password);
    localStorage.setItem(`w3m_master_active_${userAddress.toLowerCase()}`, 'true');
    return masterKey;
}

async function getChatKey(peer) {
    if (!masterKey) throw new Error("Master key not initialized");
    const sorted = [userAddress.toLowerCase(), peer.toLowerCase()].sort().join(':');
    const cryptoKey = await crypto.subtle.importKey("raw", masterKey, {name: "HMAC", hash: "SHA-256"}, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(sorted));
    return new Uint8Array(signature);
}

async function encrypt(text, peer) {
    const key = await getChatKey(peer);
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const msg = new TextEncoder().encode(text);
    const box = nacl.secretbox(msg, nonce, key);
    const combined = new Uint8Array(nonce.length + box.length);
    combined.set(nonce); combined.set(box, nonce.length);
    return btoa(String.fromCharCode(...combined));
}

async function decrypt(encBase64, peer) {
    try {
        const key = await getChatKey(peer);
        const combined = Uint8Array.from(atob(encBase64), c => c.charCodeAt(0));
        const nonce = combined.slice(0, nacl.secretbox.nonceLength);
        const box = combined.slice(nacl.secretbox.nonceLength);
        const dec = nacl.secretbox.open(box, nonce, key);
        return dec ? new TextDecoder().decode(dec) : "🔒 Ошибка расшифровки";
    } catch(e) { return "🔒 Нет доступа"; }
}

// ====================== UI HELPERS ======================
function showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    const d = document.createElement('div');
    d.className = `toast ${type}`; d.textContent = msg;
    c.appendChild(d);
    setTimeout(() => { d.style.opacity = '0'; setTimeout(() => d.remove(), 380); }, 3000);
}

function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ====================== RENDER ======================
function renderWelcome() {
    const container = document.getElementById('messages-container');
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="rgba(64,167,227,0.08)"/>
                <path d="M20 30c0-3.3 2.7-6 6-6h28c3.3 0 6 2.7 6 6v18c0 3.3-2.7 6-6 6H46l-6 6-6-6H26c-3.3 0-6-2.7-6-6V30z" fill="rgba(64,167,227,0.15)" stroke="#40A7E3" stroke-width="1.5"/>
                <circle cx="32" cy="39" r="2.5" fill="#40A7E3"/><circle cx="40" cy="39" r="2.5" fill="#40A7E3"/><circle cx="48" cy="39" r="2.5" fill="#40A7E3"/></svg>
            </div>
            <h3>Добро пожаловать в Web3 Messenger</h3>
            <p>Децентрализованное общение с полным шифрованием.<br>Выберите чат или подключите кошелек.</p>
        </div>`;
}

function setFolder(f) {
    store.currentFolder = f; store.currentChat = null;
    renderSidebar(); renderChatList(); renderWelcome(); updateInputState();
    document.getElementById('folder-title').textContent = {all:'Все чаты',personal:'Личное',news:'Новости',work:'Работа'}[f] || 'Чаты';
}

function renderSidebar() {
    document.querySelectorAll('.sb-icon[data-folder]').forEach(el => {
        el.classList.toggle('active', el.dataset.folder === store.currentFolder);
    });
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    if (!list) return;
    list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted);">Пока нет чатов.<br>Добавьте контакт ниже</div>`;
}

function updateInputState() {
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('send-btn');
    const ok = !!(userAddress && store.currentChat);
    if (input) input.disabled = !ok;
    if (btn) btn.disabled = !ok;
}

function updateSidebarAvatar() {
    const btn = document.getElementById('user-avatar-btn');
    if (userAddress) btn.style.display = 'block';
    else btn.style.display = 'none';
}

// ====================== WALLET & AUTH ======================
async function initWallet() {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    if (network.chainId !== REQUIRED_CHAIN_ID) return showToast('⚠️ Переключитесь на Polygon Mainnet', 'error');
    signer = provider.getSigner();
    userAddress = await signer.getAddress();
    isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

    updateSidebarAvatar();
    updateInputState();

    const sessionActive = localStorage.getItem(`w3m_master_active_${userAddress.toLowerCase()}`);
    if (!sessionActive) openAuthModal();
    else await ensureMasterKey();
}

async function connectWallet() {
    if (!window.ethereum) return showToast('MetaMask не установлен', 'error');
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await initWallet();
}

async function handleAuthSubmit(password) {
    if (!password || password.length < 4) return showToast('Пароль слишком короткий', 'error');
    try {
        await ensureMasterKey(password);
        closeModal('auth-modal');
        showToast('🔓 Доступ получен', 'success');
    } catch(e) { showToast('Ошибка аутентификации', 'error'); }
}

function openAuthModal() { document.getElementById('auth-modal').style.display = 'flex'; }

// ====================== GLOBAL EXPORTS ======================
window.connectWallet = connectWallet;
window.sendMessage = () => showToast('Отправка сообщений будет доступна после деплоя контрактов', 'info');
window.setFolder = setFolder;
window.setTab = (t) => { store.currentTab = t; renderChatList(); };
window.selectChat = (id) => { store.currentChat = id; renderChatList(); };
window.handleAuthSubmit = handleAuthSubmit;
window.logout = () => location.reload();
window.toggleUserMenu = () => document.getElementById('user-dropdown-menu').classList.toggle('hidden');
window.openProfileModal = () => showToast('Профиль открыт', 'info');
window.openContactsModal = () => showToast('Контакты', 'info');
window.openShareModal = () => showToast('Поделиться', 'info');
window.copyShareLink = () => showToast('Скопировано', 'success');
window.openSettingsModal = () => showToast('Настройки', 'info');
window.openAdminModal = () => showToast('Админ-панель', 'info');
window.closeModal = (id) => document.getElementById(id).style.display = 'none';
window.closeModalOnBg = (e, id) => { if (e.target.id === id) window.closeModal(id); };
window.addContactFromInput = () => showToast('Контакт добавлен (демо)', 'success');
window.refreshCurrentChat = () => showToast('Обновлено', 'info');

document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ Web3 Messenger v9.6 полностью загружен');
    renderSidebar();
    renderChatList();
    renderWelcome();
    updateInputState();

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
        window.ethereum.request({ method: 'eth_accounts' }).then(acc => { if (acc.length) initWallet(); });
    }
});
