// Web3 Messenger - App Logic v2
// ✅ Исправлено: рабочий CDN + подпись сообщений + защита от ошибок

console.log('🚀 Web3 Messenger loaded');

// Проверка загрузки ethers
if (typeof ethers === 'undefined') {
    console.error('❌ ethers.js не загружен! Проверьте CDN в index.html');
}

// Глобальные переменные
let provider, signer, userAddress;
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
        showError('❌ Библиотека ethers не загружена');
        return;
    }
    try {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        console.log('✅ Connected:', userAddress);
        updateWalletUI();
        updateInputState();
    } catch (e) {
        console.error('Init error:', e);
        showError('Ошибка: ' + e.message);
    }
}

// Подключение кошелька
async function connectWallet() {
    if (!window.ethereum) {
        showError('⚠️ Установите MetaMask');
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
        setTimeout(() => closeModal(), 1000);
    } catch (e) {
        console.error('Connect error:', e);
        msg.textContent = '❌ ' + (e.message || 'Отменено');
        msg.className = 'status-msg error';
        btn.disabled = false;
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
        openModal();
        return;
    }
    
    const chat = store.chats.find(c => c.id === store.currentChat);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    try {
        // Добавляем сообщение со статусом "ожидание"
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
        
        // Подписываем
        const signature = await signMessage(text);
        msg.signature = signature;
        msg.status = 'delivered';
        
        renderMessages();
        console.log('✅ Signed:', signature.slice(0, 20) + '...');
        
        // Авто-ответ (демо)
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
        item.onclick = function() {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            store.currentFolder = this.dataset.folder || 'all';
            store.currentChat = null;
            renderChatList();
            renderEmptyState();
            updateInputState();
        };
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
    document.getElementById('wallet-btn').onclick = openModal;
    document.getElementById('connect-btn').onclick = connectWallet;
}

// Модалка
function openModal() { document.getElementById('wallet-modal').style.display = 'flex'; }
function closeModal() { document.getElementById('wallet-modal').style.display = 'none'; }
function showError(msg) { 
    const el = document.getElementById('wallet-msg');
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
window.openModal = openModal;
window.closeModal = closeModal;
