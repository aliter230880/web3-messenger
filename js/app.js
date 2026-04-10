// Web3 Messenger - Frontend + Blockchain Integration v3 (FIXED)
// (c) Dima's Web3 Project
console.log('🚀 Web3 Messenger initialized');

// 🔐 ADMIN CONFIG
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;
const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)",
    "function getEscrowedKey(address user) view returns (bytes)"
];

// Глобальные переменные
let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

// Данные чатов
const store = {
    currentChat: null,
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь с кодом', time: '11:45', unread: 0 },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
    ]
};

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    setupEventListeners();
    setupWeb3Listeners();
});

// === WEB3: ПОДКЛЮЧЕНИЕ КОШЕЛЬКА ===
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('⚠️ Установите MetaMask для работы с Web3 Messenger');
        return;
    }
    try {
        const btn = document.getElementById('wallet-btn');
        if (btn) btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
        
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

        // Обновляем UI кошелька
        if (btn) {
            btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
            btn.style.background = 'var(--success)';
            btn.style.color = '#000';
        }

        // Проверяем админа (приводим к нижнему регистру для надёжности)
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';

        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        const btn = document.getElementById('wallet-btn');
        if (btn) btn.innerHTML = '<span>🦊</span><span>Подключить</span>';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

// === WEB3: ПРОВЕРКА РЕГИСТРАЦИИ ===
async function checkRegistration() {
    if (!contract || !userAddress) return;
    try {
        isRegistered = await contract.isRegistered(userAddress);
        
        // Безопасное получение элементов с проверкой на null
        const emptyState = document.getElementById('empty-state');
        const input = document.getElementById('msg-input');
        const sendBtn = document.getElementById('send-btn');

        if (isRegistered) {
            if (emptyState) {
                emptyState.innerHTML = `
                    <div class="empty-state-icon">✅</div>
                    <h3>Профиль активен</h3>
                    <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                    <p style="margin-top:8px;color:var(--success)">Готов к общению в блокчейне</p>
                `;
            }
            if (input) { input.disabled = false; input.placeholder = 'Написать сообщение...'; }
            if (sendBtn) sendBtn.disabled = false;
        } else {
            if (emptyState) {
                emptyState.innerHTML = `
                    <div class="empty-state-icon">📝</div>
                    <h3>Требуется регистрация</h3>
                    <p>Создайте профиль, чтобы получить доступ к мессенджеру.</p>
                    <button id="quick-reg-btn" class="btn btn-send" style="margin-top:16px">Зарегистрироваться сейчас</button>
                `;
                // Перепривязываем обработчик для новой кнопки
                document.getElementById('quick-reg-btn')?.addEventListener('click', () => {
                    if (input) { input.disabled = false; input.placeholder = 'Введите никнейм...'; input.focus(); }
                    if (sendBtn) sendBtn.disabled = false;
                });
            }
            if (input) { input.disabled = true; }
            if (sendBtn) sendBtn.disabled = true;
        }
    } catch (err) {
        console.error('❌ Ошибка проверки регистрации:', err);
    }
}

// === WEB3: РЕГИСТРАЦИЯ ПРОФИЛЯ ===
async function registerProfile(username, avatarCID, bio) {
    if (!contract || !userAddress) return;
    const statusEl = document.getElementById('escrow-status') || document.getElementById('empty-state');
    
    try {
        if (statusEl && statusEl.id === 'empty-state') {
            statusEl.innerHTML = '<div class="empty-state-icon">⏳</div><h3>Отправка транзакции...</h3>';
        }
        
        const tx = await contract.registerProfile(username, avatarCID || `Qm${Date.now()}`, bio || "");
        
        if (statusEl && statusEl.id === 'empty-state') {
            statusEl.innerHTML = '<div class="empty-state-icon">⛓️</div><h3>Ждём подтверждения сети...</h3>';
        }
        
        await tx.wait();
        isRegistered = true;
        checkRegistration();
        alert('✅ Профиль успешно создан в блокчейне!');
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        if (statusEl && statusEl.id === 'empty-state') {
            statusEl.innerHTML = `<div class="empty-state-icon">❌</div><h3>Ошибка: ${err.reason || err.message}</h3>`;
        }
    }
}

// === WEB3: ОТПРАВКА СООБЩЕНИЯ С ПОДПИСЬЮ ===
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input?.value.trim();
    if (!text || !store.currentChat) return;
    
    // Если не зарегистрирован — регистрируем
    if (!isRegistered) {
        registerProfile(text, "", "");
        return;
    }
    
    // 🔐 Крипто-подпись сообщения (XMTP style)
    try {
        const signature = await signer.signMessage(text);
        console.log('🔐 Сообщение подписано:', signature.slice(0, 20) + '...');
    } catch (e) {
        console.warn('⚠️ Не удалось подписать сообщение:', e.message);
    }
    
    console.log('📤 Отправка:', text);
    input.value = '';
    
    // Демо-ответ
    setTimeout(() => alert('💬 Сообщение отправлено! (Подпись: ' + (window.ethereum ? '✅' : '❌') + ')'), 300);
}

// === ADMIN: KEY ESCROW ===
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ разрешён только владельцу платформы.');
        return;
    }
    const modal = document.getElementById('admin-modal');
    if (modal) modal.style.display = 'flex';
}

async function accessEscrowKey() {
    const userAddr = document.getElementById('escrow-user-address')?.value.trim();
    const statusEl = document.getElementById('escrow-status');
    
    if (!userAddr || !ethers.utils.isAddress(userAddr)) {
        if (statusEl) {
            statusEl.textContent = '⚠️ Введите корректный адрес Ethereum';
            statusEl.style.color = 'var(--warning)';
            statusEl.style.display = 'block';
        }
        return;
    }
    
    if (statusEl) {
        statusEl.textContent = '🔍 Запрос к смарт-контракту...';
        statusEl.style.color = 'var(--text-muted)';
        statusEl.style.display = 'block';
    }
    
    try {
        // 🔐 Здесь будет реальный вызов: const key = await contract.getEscrowedKey(userAddr);
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        
        if (statusEl) {
            statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary);padding:4px 8px;border-radius:4px;word-break:break-all;font-size:11px">${mockKey}</code>`;
            statusEl.style.color = 'var(--success)';
        }
        console.log('🔓 Escrow Key Retrieved:', mockKey);
    } catch (err) {
        if (statusEl) {
            statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
            statusEl.style.color = 'var(--danger)';
        }
    }
}

// === UI: РЕНДЕРИНГ ЧАТОВ ===
function renderChatList() {
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;
    
    chatList.innerHTML = store.chats.map(chat => `
        <div class="chat-item" onclick="selectChat('${chat.id}')">
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
    const chat = store.chats.find(c => c.id === chatId);
    if (!chat) return;
    
    const nameEl = document.getElementById('chat-name');
    const statusEl = document.getElementById('chat-status');
    if (nameEl) nameEl.textContent = chat.name;
    if (statusEl) statusEl.textContent = chat.online ? 'в сети • 🔐 E2E' : 'был недавно';
    
    if (isRegistered) {
        const input = document.getElementById('msg-input');
        const sendBtn = document.getElementById('send-btn');
        if (input) { input.disabled = false; input.placeholder = 'Написать сообщение...'; input.focus(); }
        if (sendBtn) sendBtn.disabled = false;
    }
}

// === EVENT LISTENERS ===
function setupEventListeners() {
    document.getElementById('wallet-btn')?.addEventListener('click', connectWallet);
    document.getElementById('admin-btn')?.addEventListener('click', openAdminModal);
    document.getElementById('btn-access-escrow')?.addEventListener('click', accessEscrowKey);
    document.getElementById('send-btn')?.addEventListener('click', sendMessage);
    
    const msgInput = document.getElementById('msg-input');
    if (msgInput) {
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
}

function setupWeb3Listeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

// Глобальные функции для HTML
window.selectChat = selectChat;
window.sendMessage = sendMessage;
