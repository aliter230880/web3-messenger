// Web3 Messenger - Frontend + Blockchain Integration v3 (FIXED)
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet
const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)",
    "function getEscrowedKey(address user) view returns (bytes)"
];

// === ГЛОБАЛЬНЫЙ STORE (через window для SES lockdown) ===
window.store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, folder: 'personal', preview: 'Привет! Как проект?', time: '12:30', unread: 3, messages: [
            { id: 1, text: 'Привет! Как проект? Готов смотреть архитектуру?', sent: false, time: '12:28', status: 'delivered' },
            { id: 2, text: 'Всё супер! Смотри, что набросал 👇', sent: true, time: '12:30', status: 'delivered' }
        ]},
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, folder: 'work', preview: 'Готов помочь с кодом', time: '11:45', unread: 0, messages: [
            { id: 1, text: 'Привет! Чем могу помочь?', sent: false, time: '11:45', status: 'delivered' }
        ]},
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, folder: 'news', preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24, messages: [
            { id: 1, text: '🚀 Bitcoin пробил $100k! Полный разбор ситуации...', sent: false, time: '10:20', status: 'delivered' }
        ]}
    ]
};

// === WEB3 VARIABLES ===
let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

// === INITIALIZATION ===
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Web3 Messenger initialized');
    renderSidebar();
    renderChatList();
    setupEventListeners();
    setupWeb3Listeners();
    updateInputState();
    
    // Авто-подключение если уже есть доступ
    if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
            await connectWallet();
        }
    }
});

// === WEB3: CONNECT WALLET ===
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('⚠️ Установите MetaMask для работы с Web3 Messenger');
        return;
    }
    try {
        const btn = document.getElementById('wallet-btn');
        btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
        
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Проверка сети
        const network = await provider.getNetwork();
        if (network.chainId !== CHAIN_ID) {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }],
            });
        }

        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Обновление UI
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';

        // Проверка админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';

        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        document.getElementById('wallet-btn').innerHTML = '<span>🦊</span><span>Подключить</span>';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

// === WEB3: CHECK REGISTRATION ===
async function checkRegistration() {
    if (!contract || !userAddress) return;
    try {
        isRegistered = await contract.isRegistered(userAddress);
        const emptyState = document.getElementById('empty-state');
        const input = document.getElementById('msg-input');
        const sendBtn = document.getElementById('send-btn');

        if (isRegistered) {
            emptyState.innerHTML = `
                <div class="empty-state-icon">✅</div>
                <h3>Профиль активен</h3>
                <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
            `;
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'Написать сообщение...';
        } else {
            emptyState.innerHTML = `
                <div class="empty-state-icon">📝</div>
                <h3>Требуется регистрация</h3>
                <p>Создайте профиль, чтобы получить доступ к мессенджеру.</p>
                <button id="quick-reg-btn" class="btn btn-send" style="margin-top:16px;">Зарегистрироваться сейчас</button>
            `;
            input.disabled = true;
            sendBtn.disabled = true;
            
            document.getElementById('quick-reg-btn')?.addEventListener('click', () => {
                input.disabled = false;
                sendBtn.disabled = false;
                input.placeholder = 'Введите никнейм для регистрации...';
                input.focus();
            });
        }
    } catch (err) {
        console.error('❌ Ошибка проверки регистрации:', err);
    }
}

// === WEB3: SEND MESSAGE WITH SIGNATURE ✅ ===
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !window.store.currentChat || !signer) return;

    try {
        // 🔐 КРИПТО-ПОДПИСЬ СООБЩЕНИЯ (через MetaMask)
        const signature = await signer.signMessage(text);
        console.log('🔐 Сообщение подписано:', signature);

        // Добавляем в UI с индикацией подписи
        addMessageToUI(text, true, signature.slice(0,10)+'...');
        input.value = '';

        // Здесь позже: отправка в блокчейн / XMTP / релеи
        // await sendEncryptedMessage(window.store.currentChat, text, signature);
        
        // Демо-ответ
        setTimeout(() => {
            const replies = ['Отлично! 🔥', 'Принято 👍', 'Интересно!'];
            addMessageToUI(replies[Math.floor(Math.random()*replies.length)], false);
        }, 1500);

    } catch (err) {
        console.error('❌ Ошибка подписи:', err);
        alert('Не удалось подписать сообщение. Проверьте кошелек.');
    }
}

// === UI: Add message with signature indicator ===
function addMessageToUI(text, isSent, signatureHint = null) {
    const container = document.getElementById('messages-container');
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    
    let meta = `<span>${time}</span>`;
    if (isSent && signatureHint) {
        meta += ` <span title="Подписано: ${signatureHint}" style="color:var(--success);">🔐</span>`;
    } else if (isSent) {
        meta += ` <span>✓✓</span>`;
    }
    
    div.innerHTML = `<div class="message-text">${escapeHtml(text)}</div><div class="message-meta">${meta}</div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// === UI: RENDER FUNCTIONS ===
function renderSidebar() {
    const items = document.querySelectorAll('.sidebar-item[data-folder]');
    items.forEach(item => {
        item.addEventListener('click', function() {
            items.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            window.store.currentFolder = this.dataset.folder;
            renderChatList();
            if (window.store.currentChat) {
                window.store.currentChat = null;
                renderEmptyState();
                updateInputState();
            }
        });
    });
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    if (!list) return;
    const filtered = window.store.currentFolder === 'all' 
        ? window.store.chats 
        : window.store.chats.filter(c => c.folder === window.store.currentFolder);
    
    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">📭<p>Нет чатов</p></div>';
        return;
    }
    
    list.innerHTML = filtered.map(chat => `
        <div class="chat-item ${window.store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
            <div class="chat-avatar ${chat.online ? 'online' : ''}">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <div class="chat-name">${chat.name}</div>
                    <div class="chat-time">${chat.time}</div>
                </div>
                <div class="chat-preview">
                    <span>${chat.preview}</span>
                    ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function selectChat(chatId) {
    window.store.currentChat = chatId;
    const chat = window.store.chats.find(c => c.id === chatId);
    if (chat) {
        chat.unread = 0;
        document.getElementById('chat-name').textContent = chat.name;
        document.getElementById('chat-avatar').textContent = chat.avatar;
        document.getElementById('chat-status').textContent = chat.online ? 'в сети • 🔐 E2E' : 'был недавно';
        renderChatList();
        renderMessages(chat);
        updateInputState();
    }
}

function renderMessages(chat) {
    const container = document.getElementById('messages-container');
    if (!container || !chat) return;
    container.innerHTML = `<div class="date-separator"><span>Сегодня</span></div>` + 
        chat.messages.map(msg => {
            const meta = msg.sent 
                ? `<span>${msg.time}</span> <span style="color:var(--success)">🔐</span>` 
                : `<span>${msg.time}</span>`;
            return `<div class="message ${msg.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(msg.text)}</div>
                <div class="message-meta">${meta}</div>
            </div>`;
        }).join('');
    container.scrollTop = container.scrollHeight;
}

function renderEmptyState() {
    const el = document.getElementById('messages-container');
    if (el) el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">💬</div><h3>Выберите чат</h3></div>`;
}

function updateInputState() {
    const input = document.getElementById('msg-input');
    const btn = document.getElementById('send-btn');
    if (input && btn) {
        const canSend = window.store.currentChat && isRegistered && signer;
        input.disabled = !canSend;
        btn.disabled = !canSend;
        input.placeholder = canSend ? 'Написать сообщение...' : (isRegistered ? 'Выберите чат...' : 'Сначала зарегистрируйтесь');
        if (canSend) input.focus();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// === ADMIN: KEY ESCROW ===
function openAdminModal() {
    if (!isAdmin) { alert('🔒 Доступ только владельцу'); return; }
    document.getElementById('admin-modal').style.display = 'flex';
}

async function accessEscrowKey() {
    const addr = document.getElementById('escrow-user-address').value.trim();
    const status = document.getElementById('escrow-status');
    if (!ethers.utils.isAddress(addr)) {
        status.textContent = '⚠️ Неверный адрес'; status.style.color = 'var(--warning)'; return;
    }
    status.textContent = '🔍 Запрос...'; status.style.color = 'var(--text-muted)';
    try {
        // 🔐 Здесь будет реальный вызов: const key = await contract.getEscrowedKey(addr);
        await new Promise(r => setTimeout(r, 1000));
        const mock = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        status.innerHTML = `✅ Ключ: <code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; font-size:11px;">${mock}</code>`;
        status.style.color = 'var(--success)';
        console.log('🔓 Escrow Key Retrieved:', mock);
    } catch (e) {
        status.textContent = '❌ ' + e.message; status.style.color = 'var(--danger)';
    }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    document.getElementById('wallet-btn').addEventListener('click', connectWallet);
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.getElementById('admin-btn')?.addEventListener('click', openAdminModal);
    document.getElementById('btn-access-escrow')?.addEventListener('click', accessEscrowKey);
}

function setupWeb3Listeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

// === GLOBAL EXPORTS ===
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
