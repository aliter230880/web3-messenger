// Web3 Messenger - App Logic v4
console.log('🚀 Web3 Messenger loaded');

if (typeof ethers === 'undefined') {
    console.error('❌ ethers.js не загружен! Проверьте CDN в index.html');
}

let provider, signer, userAddress;
let isAdmin = false;
const ADMIN_ADDRESS   = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const BASE_URL = "https://aliter230880.github.io/web3-messenger/";

const contactsStore = {
    list: [],
    load() {
        try {
            const saved = localStorage.getItem('web3messenger_contacts');
            if (saved) this.list = JSON.parse(saved);
        } catch (e) { console.warn('Contacts load error:', e); }
    },
    save() {
        try { localStorage.setItem('web3messenger_contacts', JSON.stringify(this.list)); }
        catch (e) { console.warn('Contacts save error:', e); }
    },
    add(contact) {
        if (!this.list.find(c => c.address.toLowerCase() === contact.address.toLowerCase())) {
            this.list.push(contact);
            this.save();
            return true;
        }
        return false;
    },
    get(address) {
        return this.list.find(c => c.address.toLowerCase() === address.toLowerCase());
    }
};

const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima',    name: 'Дима',          avatar: '👤', online: true,  folder: 'personal', preview: 'Привет!',               time: '12:30', unread: 3,  messages: [{ id: 1, text: 'Привет! Как проект?', sent: false, time: '12:28', status: 'delivered', signature: null }] },
        { id: 'ai',      name: 'AI Assistant',  avatar: '🤖', online: true,  folder: 'work',     preview: 'Готов помочь',           time: '11:45', unread: 0,  messages: [] },
        { id: 'crypto',  name: 'Crypto News',   avatar: '📢', online: false, folder: 'news',     preview: 'BTC $100k!',             time: '10:20', unread: 24, messages: [] },
        { id: 'devteam', name: 'Dev Team',      avatar: '💻', online: true,  folder: 'work',     preview: 'Контракт задеплоен',     time: '09:55', unread: 5,  messages: [] },
        { id: 'poly',    name: 'Polygon Alerts',avatar: '🔷', online: false, folder: 'news',     preview: 'Gas price: 35 gwei',     time: '08:30', unread: 11, messages: [] },
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log('✅ App initialized');
    contactsStore.load();
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
    updateShareButton();
    checkWallet();
    handleContactParam();
});

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

async function getProfileByAddress(address) {
    if (!provider) return null;
    try {
        const contract = new ethers.Contract(CONTRACT_ADDRESS, [
            "function getProfile(address) view returns (string,string,string,uint256,bool)"
        ], provider);
        const result = await contract.getProfile(address);
        return { username: result[0], avatarCID: result[1], bio: result[2], registeredAt: result[3].toNumber(), isActive: result[4] };
    } catch (e) { console.warn('Profile fetch error:', e); return null; }
}

async function checkWallet() {
    if (typeof window.ethereum === 'undefined') return;
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await initWallet();
    } catch (e) { console.warn('Wallet check:', e); }
}

async function initWallet() {
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer   = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('✅ Connected:', userAddress);
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        updateAdminButton();
        updateWalletUI();
        updateInputState();
        updateShareButton();
    } catch (e) {
        console.error('Init error:', e);
        showError('wallet-msg', 'Ошибка: ' + e.message);
    }
}

async function connectWallet() {
    if (!window.ethereum) { showError('wallet-msg', '⚠️ Установите MetaMask'); return; }
    const btn = document.getElementById('connect-btn');
    const msg = document.getElementById('wallet-msg');
    try {
        btn.disabled = true;
        msg.textContent = '⏳ Подключение...';
        msg.className = 'status-msg info';
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        await initWallet();
        msg.textContent = '✅ Подключено!';
        msg.className = 'status-msg success';
        setTimeout(() => closeModal('wallet-modal'), 1000);
    } catch (e) {
        msg.textContent = '❌ ' + (e.message || 'Отменено');
        msg.className = 'status-msg error';
        btn.disabled = false;
    }
}

function updateAdminButton() {
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';
}

function openAdminModal() {
    if (!isAdmin) { alert('🔒 Доступ разрешён только владельцу платформы.'); return; }
    document.getElementById('admin-modal').style.display = 'flex';
    document.getElementById('escrow-status').style.display = 'none';
    document.getElementById('escrow-user-address').value = '';
}

async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address').value.trim();
    const statusEl = document.getElementById('escrow-status');
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
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:6px 10px; border-radius:6px; word-break:break-all; font-size:11px;">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
        console.log('🔓 Escrow Key Retrieved:', mockKey);
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
    const modal      = document.getElementById('share-modal');
    const qrContainer = document.getElementById('qr-container');
    const linkInput  = document.getElementById('share-link-input');
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
        input.select();
        document.execCommand('copy');
        showStatus('✅ Ссылка скопирована!', 'success');
    }
}

function shareToTelegram() {
    const url  = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${url}`;
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank');
}

function shareToWhatsApp() {
    const url  = document.getElementById('share-link-input').value;
    const text = `Привет! Добавь меня в Web3 Messenger — децентрализованный мессенджер на Polygon: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}

function shareToTwitter() {
    const url  = document.getElementById('share-link-input').value;
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
        if (!ethers.utils.isAddress(query)) {
            throw new Error('Введите корректный Ethereum адрес (0x...)');
        }
        const profile = await getProfileByAddress(address);
        if (contactsStore.add({ address, ...(profile || {}) })) {
            renderChatList();
            showStatus('✅ Контакт добавлен!', 'success');
            input.value = '';
        } else {
            showStatus('ℹ️ Контакт уже в списке', 'info');
        }
    } catch (e) {
        showStatus('❌ ' + e.message, 'error');
    }
}

async function signMessage(text) {
    if (!signer) throw new Error('Кошелёк не подключён');
    return await signer.signMessage(text);
}

async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text  = input.value.trim();
    if (!text || !store.currentChat) return;
    if (!signer) { openModal('wallet-modal'); return; }
    const chat = store.chats.find(c => c.id === store.currentChat);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    try {
        const msg = { id: Date.now(), text, sent: true, time, status: 'sending', signature: null };
        chat.messages.push(msg);
        chat.preview = text;
        chat.time    = time;
        input.value  = '';
        renderMessages();
        const signature = await signMessage(text);
        msg.signature   = signature;
        msg.status      = 'delivered';
        renderMessages();
        console.log('✅ Signed:', signature.slice(0, 20) + '...');
        setTimeout(() => {
            const reply = { id: Date.now()+1, text: '👍 Принято!', sent: false,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                status: 'delivered', signature: null };
            chat.messages.push(reply);
            chat.preview = reply.text;
            if (store.currentChat === chat.id) renderMessages();
        }, 1500);
    } catch (e) {
        console.error('Send error:', e);
        if (e.code !== 4001) alert('Ошибка отправки: ' + e.message);
    }
}

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
    const list = document.getElementById('chat-list');
    const allChats = [...store.chats];
    contactsStore.list.forEach(contact => {
        if (!allChats.find(c => c.id === contact.address)) { **...**

_This response is too long to display in full._
