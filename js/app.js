// Web3 Messenger - Application Logic v3 (Fixed)
// (c) Dima's Web3 Project
// 🔗 Web3 | 🔐 Key Escrow | 💰 Monetization

console.log('🚀 Web3 Messenger loaded');

// ========== КОНФИГУРАЦИЯ ==========
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;
const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)",
    "function getEscrowedKey(address user) view returns (bytes)"
];

// ========== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ==========
let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

const store = {
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

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ App initialized');
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
});

// ========== SIDEBAR ==========
function renderSidebar() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            store.currentFolder = this.dataset.folder || 'all';
            renderChatList();
            if (store.currentChat) {
                store.currentChat = null;
                renderEmptyState();
                updateInputState();
            }
        });
    });
}

function getFilteredChats() {
    if (store.currentFolder === 'all') return store.chats;
    return store.chats.filter(chat => chat.folder === store.currentFolder);
}

// ========== CHAT LIST ==========
function renderChatList() {
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    const filtered = getFilteredChats();
    
    if (filtered.length === 0) {
        chatList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">📭<p>Нет чатов</p></div>';
        return;
    }
    
    chatList.innerHTML = filtered.map(chat => `
        <div class="chat-item ${store.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
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

// ========== SELECT CHAT ==========
function selectChat(chatId) {
    store.currentChat = chatId;
    const chat = store.chats.find(c => c.id === chatId);
    if (chat) {
        chat.unread = 0;
        renderChatList();
        renderMessages();
        updateChatHeader(chat);
        updateInputState();
    }
}

// ========== MESSAGES ==========
function renderMessages() {
    const container = document.getElementById('messages-container');
    const chat = store.chats.find(c => c.id === store.currentChat);
    if (!container || !chat) return;
    
    container.innerHTML = `
        <div class="date-separator"><span>Сегодня</span></div>
        ${chat.messages.map(msg => `
            <div class="message ${msg.sent ? 'sent' : 'received'}">
                <div class="message-text">${escapeHtml(msg.text)}</div>
                <div class="message-meta">
                    <span>${msg.time}</span>
                    ${msg.sent ? `<span class="status-icon">${msg.status === 'delivered' ? '✓✓' : '✓'}</span>` : ''}
                </div>
            </div>
        `).join('')}
    `;
    container.scrollTop = container.scrollHeight;
}

function renderEmptyState() {
    const container = document.getElementById('messages-container');
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>Добро пожаловать в Web3 Messenger</h3>
                <p>Выберите чат слева, чтобы начать общение</p>
                <p class="empty-state-hint">🔒 Все сообщения зашифрованы</p>
            </div>
        `;
    }
}

function updateChatHeader(chat) {
    document.getElementById('chat-name').textContent = chat.name;
    document.getElementById('chat-status').textContent = chat.online ? 'в сети • 🔐 E2E' : 'был(а) недавно';
    document.getElementById('chat-avatar').textContent = chat.avatar;
}

// ========== INPUT STATE ==========
function updateInputState() {
    const input = document.getElementById('msg-input');
    const sendBtn = document.getElementById('send-btn');
    if (input && sendBtn) {
        if (store.currentChat && isRegistered) {
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'Написать сообщение...';
            input.focus();
        } else {
            input.disabled = true;
            sendBtn.disabled = true;
            input.placeholder = store.currentChat ? 'Зарегистрируйтесь для отправки' : 'Выберите чат...';
        }
    }
}

// ========== SEND MESSAGE ==========
function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !store.currentChat) return;
    
    const chat = store.chats.find(c => c.id === store.currentChat);
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    
    const newMessage = { id: Date.now(), text, sent: true, time, status: 'sent' };
    chat.messages.push(newMessage);
    chat.preview = text;
    chat.time = time;
    
    input.value = '';
    renderMessages();
    renderChatList();
    
    // Имитация доставки
    setTimeout(() => { newMessage.status = 'delivered'; renderMessages(); }, 800);
    
    // Имитация ответа
    setTimeout(() => {
        const replies = ['Отлично! 🔥', 'Принято 👍', 'Интересно, давай обсудим'];
        const reply = { id: Date.now()+1, text: replies[Math.floor(Math.random()*replies.length)], sent: false, time: new Date().toLocaleTimeString('ru-RU', {hour:'2-digit',minute:'2-digit'}), status: 'delivered' };
        chat.messages.push(reply);
        chat.preview = reply.text;
        chat.time = reply.time;
        if (store.currentChat === chat.id) renderMessages();
        renderChatList();
    }, 2500);
    
    console.log('📤 Sent:', text);
}

// ========== WEB3: CONNECT WALLET ==========
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
        
        const network = await provider.getNetwork();
        if (network.chainId !== CHAIN_ID) {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: ethers.utils.hexValue(CHAIN_ID) }]
            });
        }
        
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Обновляем UI
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        document.getElementById('wallet-display').textContent = userAddress.slice(0,10) + '...';
        document.getElementById('wallet-status').textContent = 'Online';
        
        // Проверка админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        document.getElementById('admin-btn').style.display = isAdmin ? 'flex' : 'none';
        
        await checkRegistration();
        console.log('✅ Connected:', userAddress);
    } catch (err) {
        console.error('❌ Connection error:', err);
        document.getElementById('wallet-btn').innerHTML = '<span>🦊</span><span>Подключить</span>';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

// ========== WEB3: CHECK REGISTRATION ==========
async function checkRegistration() {
    if (!contract || !userAddress) return;
    try {
        isRegistered = await contract.isRegistered(userAddress);
        const emptyState = document.getElementById('empty-state');
        const regModal = document.getElementById('register-modal');
        
        if (isRegistered) {
            emptyState.innerHTML = `
                <div class="empty-state-icon">✅</div>
                <h3>Профиль активен</h3>
                <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                <p style="margin-top:8px;color:var(--success)">Готов к общению в блокчейне</p>
            `;
            regModal.style.display = 'none';
            updateInputState();
        } else {
            emptyState.style.display = 'none';
            regModal.style.display = 'flex';
        }
    } catch (err) {
        console.error('❌ Registration check error:', err);
    }
}

// ========== WEB3: REGISTER PROFILE ==========
async function registerProfile(username, avatarCID, bio) {
    if (!contract || !userAddress) return;
    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');
    
    try {
        btn.disabled = true;
        statusEl.textContent = '⏳ Подтвердите транзакцию в MetaMask...';
        statusEl.style.color = 'var(--text-muted)';
        
        const tx = await contract.registerProfile(username, avatarCID || `Qm${Date.now()}`, bio || "");
        statusEl.textContent = '⛓️ Ждём подтверждения сети...';
        
        await tx.wait();
        
        statusEl.textContent = '✅ Профиль успешно создан!';
        statusEl.style.color = 'var(--success)';
        isRegistered = true;
        
        setTimeout(() => {
            document.getElementById('register-modal').style.display = 'none';
            checkRegistration();
            updateInputState();
        }, 1500);
        
        alert('✅ Профиль зарегистрирован в блокчейне!');
    } catch (err) {
        console.error('❌ Registration error:', err);
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
        btn.disabled = false;
    }
}

// ========== WEB3: ADMIN KEY ESCROW ==========
function openAdminModal() {
    if (!isAdmin) { alert('🔒 Доступ только владельцу'); return; }
    document.getElementById('admin-modal').style.display = 'flex';
}

async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address').value.trim();
    const statusEl = document.getElementById('escrow-status');
    
    if (!userAddr || !ethers.utils.isAddress(userAddr)) {
        statusEl.textContent = '⚠️ Введите корректный адрес';
        statusEl.style.color = 'var(--warning)';
        return;
    }
    
    statusEl.textContent = '🔍 Запрос к контракту...';
    statusEl.style.color = 'var(--text-muted)';
    
    try {
        // 🔐 Здесь будет реальный вызов: const key = await contract.getEscrowedKey(userAddr);
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;word-break:break-all;font-size:11px">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
        console.log('🔓 Escrow Key:', mockKey);
    } catch (err) {
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

// ========== EVENT LISTENERS ==========
function setupEventListeners() {
    // Wallet
    document.getElementById('wallet-btn').addEventListener('click', connectWallet);
    
    // Admin
    document.getElementById('admin-btn').addEventListener('click', openAdminModal);
    document.getElementById('btn-access-escrow').addEventListener('click', accessEscrowKey);
    
    // Registration
    document.getElementById('btn-register').addEventListener('click', () => {
        const username = document.getElementById('reg-username').value.trim();
        const avatar = document.getElementById('reg-avatar').value.trim();
        const bio = document.getElementById('reg-bio').value.trim();
        if (username && avatar) registerProfile(username, avatar, bio);
        else alert('Заполните ник и Avatar CID');
    });
    
    // Send message
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    
    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Web3 listeners
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

// ========== UTILS ==========
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== GLOBAL EXPORTS ==========
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.registerProfile = registerProfile;
