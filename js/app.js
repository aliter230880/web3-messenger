// Web3 Messenger - App Logic v3
// ✅ Admin Button + Key Escrow + Wallet Signature + Chat UI

console.log('🚀 Web3 Messenger loaded');

// Проверка загрузки ethers
if (typeof ethers === 'undefined') {
    console.error('❌ ethers.js не загружен! Проверьте CDN в index.html');
}

// Глобальные переменные
let provider, signer, userAddress;
let isAdmin = false;
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";

// Данные чатов
const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет!', time: '12:30', unread: 3, messages: [
            { id: 1, text: 'Привет! Как проект?', sent: false, time: '12:28', status: 'delivered', signature: null }
        ]},
        { id: 'ai', name: 'AI', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь', time: '11:45', unread: 0, messages: []},
        { id: 'crypto', name: 'Crypto', avatar: '📢', online: false, folder: 'news', preview: 'BTC $100k!', time: '10:20', unread: 24, messages: []}
    ]
};

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ App initialized');
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
    checkWallet();
});

// Проверка уже подключенного кошелька
async function checkWallet() {
    if (typeof window.ethereum === 'undefined') return;
    try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) await initWallet();
    } catch (e) { console.warn('Wallet check:', e); }
}

// Инициализация кошелька
async function initWallet() {
    if (!window.ethers) {
        showError('wallet-msg', '❌ Библиотека ethers не загружена');
        return;
    }
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('✅ Connected:', userAddress);
        
        // 🔐 Проверка прав админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        updateAdminButton();
        
        updateWalletUI();
        updateInputState();
    } catch (e) {
        console.error('Init error:', e);
        showError('wallet-msg', 'Ошибка: ' + e.message);
    }
}

// Подключение кошелька
async function connectWallet() {
    if (!window.ethereum) {
        showError('wallet-msg', '⚠️ Установите MetaMask');
        return;
    }
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
        console.error('Connect error:', e);
        msg.textContent = '❌ ' + (e.message || 'Отменено');
        msg.className = 'status-msg error';
        btn.disabled = false;
    }
}

// 🔐 Обновление кнопки Админ
function updateAdminButton() {
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        adminBtn.style.display = isAdmin ? 'flex' : 'none';
    }
}

// 🔐 Открытие модалки Админ
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ разрешён только владельцу платформы.');
        return;
    }
    document.getElementById('admin-modal').style.display = 'flex';
    // Сброс состояния
    document.getElementById('escrow-status').style.display = 'none';
    document.getElementById('escrow-user-address').value = '';
}

// 🔐 Запрос ключа (Key Escrow Flow)
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

// Подпись сообщения
async function signMessage(text) {
    if (!signer) throw new Error('Кошелёк не подключён');
    return await signer.signMessage(text);
}

// Отправка сообщения с подписью
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat) return;
    
    if (!signer) {
        openModal('wallet-modal');
        return;
    }
    
    const chat = store.chats.find(c => c.id === store.currentChat);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    try {
        const msg = {
            id: Date.now(),
            text: text,
            sent: true,
            time: time,
            status: 'sending',
            signature: null
        };
        chat.messages.push(msg);
        chat.preview = text;
        chat.time = time;
        
        input.value = '';
        renderMessages();
        
        const signature = await signMessage(text);
        msg.signature = signature;
        msg.status = 'delivered';
        
        renderMessages();
        console.log('✅ Signed:', signature.slice(0, 20) + '...');
        
        setTimeout(() => {
            const reply = {
                id: Date.now() + 1,
                text: '👍 Принято!',
                sent: false,
                time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
                status: 'delivered',
                signature: null
            };
            chat.messages.push(reply);
            chat.preview = reply.text;
            if (store.currentChat === chat.id) renderMessages();
        }, 1500);
        
    } catch (e) {
        console.error('Send error:', e);
        alert('Ошибка отправки: ' + e.message);
    }
}

// Рендеринг
function renderSidebar() {
    document.querySelectorAll('.sidebar-item').forEach(item => {
        if (item.dataset.folder) {
            item.onclick = function() {
                document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                store.currentFolder = this.dataset.folder || 'all';
                store.currentChat = null;
                renderChatList();
                renderEmptyState();
                updateInputState();
            };
        }
    });
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    const chats = store.currentFolder === 'all' 
        ? store.chats 
        : store.chats.filter(c => c.folder === store.currentFolder);
    
    list.innerHTML = chats.map(chat => `
        <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
            <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <span class="chat-name">${chat.name}</span>
                    <span class="chat-time">${chat.time}</span>
                </div>
                <div class="chat-preview">${chat.preview} ${chat.unread ? `<span class="badge">${chat.unread}</span>` : ''}</div>
            </div>
        </div>
    `).join('');
}

function selectChat(id) {
    store.currentChat = id;
    const chat = store.chats.find(c => c.id === id);
    if (chat) {
        chat.unread = 0;
        document.getElementById('chat-name').textContent = chat.name;
        document.getElementById('chat-status').textContent = chat.online ? '● в сети' : 'был недавно';
        document.getElementById('chat-avatar').textContent = chat.avatar;
        renderChatList();
        renderMessages();
        updateInputState();
    }
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat = store.chats.find(c => c.id === store.currentChat);
    if (!container || !chat) return;
    
    container.innerHTML = `
        <div class="date-separator"><span>Сегодня</span></div>
        ${chat.messages.map(m => `
            <div class="message ${m.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(m.text)}</div>
                <div class="message-meta">
                    <span>${m.time}</span>
                    ${m.sent ? `
                        <span class="status">${m.status === 'delivered' ? '✓✓' : '⏳'}</span>
                        ${m.signature ? '<span class="sig-badge" title="Подписано кошельком">🔐</span>' : ''}
                    ` : ''}
                </div>
            </div>
        `).join('')}
    `;
    container.scrollTop = container.scrollHeight;
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
    const btn = document.getElementById('send-btn');
    if (!input || !btn) return;
    
    if (store.currentChat && userAddress) {
        input.disabled = false;
        btn.disabled = false;
        input.placeholder = 'Написать сообщение...';
        input.focus();
    } else if (!userAddress) {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = '🔗 Подключите кошелёк';
    } else {
        input.disabled = true;
        btn.disabled = true;
        input.placeholder = 'Выберите чат...';
    }
}

function updateWalletUI() {
    const btn = document.getElementById('wallet-btn');
    if (btn && userAddress) {
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...</span>`;
        btn.onclick = null;
    }
}

function setupEventListeners() {
    document.getElementById('send-btn').onclick = sendMessage;
    document.getElementById('msg-input').onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
    document.getElementById('wallet-btn').onclick = () => openModal('wallet-modal');
    document.getElementById('connect-btn').onclick = connectWallet;
}

// Модалки
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
    const msg = document.getElementById('wallet-msg');
    if (msg) { msg.textContent = ''; msg.className = 'status-msg'; }
}
function showError(elId, msg) { 
    const el = document.getElementById(elId);
    if (el) { el.textContent = msg; el.className = 'status-msg error'; }
}

// Утилиты
function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// Глобальные функции
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
