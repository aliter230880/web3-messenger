// Web3 Messenger v9.6 — Master Key + Password Auth (один ключ на весь кошелёк)
console.log('🚀 Web3 Messenger v9.6 — Master Key + Password Auth');

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const IDENTITY_CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const MESSAGE_CONTRACT_ADDRESS = "0x906DCA5190841d5F0acF8244bd8c176ecb24139D";
const REQUIRED_CHAIN_ID = 137;

let provider, signer, userAddress = null;
let isAdmin = false;
let currentUsername = '';
let currentChatId = null;
let masterKey = null; // главный ключ на весь кошелёк

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

// ====================== MASTER KEY (Password) ======================
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

function isValidBase64(str) {
    try { return btoa(atob(str)) === str; } catch { return false; }
}

// ====================== UI & RENDER (все функции) ======================
function showToast(msg, type = 'info') { /* ваш код */ }
function escHtml(s) { /* ваш код */ }
function renderWelcome() { /* ваш код */ }
function setFolder(f) { /* ваш код */ }
function renderSidebar() { /* ваш код */ }
function renderChatList() { /* ваш код */ }
function updateBadges() { /* ваш код */ }
function renderMessages() { /* ваш код */ }
function updateInputState() { /* ваш код */ }
function updateSidebarAvatar() { /* ваш код */ }

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

    const c = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, provider);
    const reg = await c.isRegistered(userAddress);
    if (!reg) setTimeout(openRegisterModal, 900);
    else {
        const p = await getProfile(userAddress);
        if (p) currentUsername = p.username;
        updateSidebarAvatar();
    }

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
        if (store.currentChat) loadMessages(store.currentChat);
    } catch(e) { showToast('Ошибка аутентификации', 'error'); }
}

// ====================== SEND / LOAD (исправленные) ======================
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !userAddress || !store.currentChat) return;

    const btn = document.getElementById('send-btn');
    btn.disabled = input.disabled = true;

    try {
        const enc = await encrypt(text, store.currentChat);
        const c = new ethers.Contract(MESSAGE_CONTRACT_ADDRESS, MESSAGE_ABI, signer);
        const tx = await c.sendMessage(store.currentChat, enc, await signer.signMessage(text));
        await tx.wait();

        const chat = store.chats.find(c => c.id === store.currentChat);
        if (chat) {
            const now = new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
            chat.messages.push({id: Date.now()+'', text: text, sent: true, time: now, encrypted: true});
            chat.preview = text;
            chat.time = now;
        }

        input.value = '';
        renderChatList();
        renderMessages();
        showToast('✅ Отправлено!', 'success');
        await loadMessages(store.currentChat);
    } catch(e) {
        showToast('❌ ' + (e.reason || e.message), 'error');
    } finally {
        btn.disabled = input.disabled = false;
    }
}

async function loadMessages(chatId) {
    // ... (ваша полная логика getConversation) ...
    // В обработке сообщений:
    if (!isSent && isValidBase64(m.text)) {
        text = await decrypt(m.text, m.sender);
    }
    // ...
}

// ====================== GLOBAL EXPORTS ======================
window.connectWallet = connectWallet;
window.sendMessage = sendMessage;
window.setFolder = setFolder;
window.setTab = setTab;
window.selectChat = selectChat;
window.handleAuthSubmit = handleAuthSubmit;
window.registerUser = registerUser;
window.logout = logout;
window.openShareModal = openShareModal;
window.copyShareLink = copyShareLink;
window.openProfileModal = openProfileModal;
window.openContactsModal = openContactsModal;
window.openSettingsModal = openSettingsModal;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = () => showToast('Key Escrow в разработке', 'info');
window.closeModal = closeModal;
window.closeModalOnBg = closeModalOnBg;

document.addEventListener('DOMContentLoaded', () => {
    contactsStore.load();
    deletedChatsStore.load();
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
