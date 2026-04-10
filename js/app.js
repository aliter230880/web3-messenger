// Web3 Messenger - Frontend + Blockchain Integration v3
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;
const RPC_URL = "https://polygon-rpc.com";

const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)",
    "function getEscrowedKey(address user) view returns (bytes)"
];

let provider, signer, contract, userAddress;
let isRegistered = false;
let isAdmin = false;

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Web3 Messenger initialized');
    renderChatList();
    setupEventListeners();
    setupWeb3Listeners();
});

// === WEB3 ЛОГИКА ===
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

        // ✅ Показываем профиль пользователя (вместо кнопки)
        showUserProfile();
        
        // Проверяем, является ли пользователь админом
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        
        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        document.getElementById('wallet-btn').innerHTML = '<span>🦊</span><span>Connect Wallet</span>';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

// 🔥 НОВОЕ: Показ профиля пользователя
function showUserProfile() {
    const profile = document.getElementById('user-profile');
    const walletBtn = document.getElementById('wallet-btn');
    const addressEl = document.getElementById('user-address');
    
    if (profile && walletBtn && addressEl) {
        walletBtn.style.display = 'none';
        profile.style.display = 'flex';
        addressEl.textContent = `${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
    }
}

// 🔥 НОВОЕ: Скрыть профиль, показать кнопку
function hideUserProfile() {
    const profile = document.getElementById('user-profile');
    const walletBtn = document.getElementById('wallet-btn');
    const menu = document.getElementById('user-menu');
    
    if (profile) profile.style.display = 'none';
    if (walletBtn) walletBtn.style.display = 'flex';
    if (menu) menu.style.display = 'none';
}

// 🔥 НОВОЕ: Переключение меню
function toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    }
}

// 🔥 НОВОЕ: Копировать адрес
function copyAddress() {
    if (userAddress) {
        navigator.clipboard.writeText(userAddress);
        alert('📋 Адрес скопирован: ' + userAddress);
        toggleUserMenu();
    }
}

// 🔥 НОВОЕ: Отключиться
function disconnectWallet() {
    hideUserProfile();
    userAddress = null;
    isRegistered = false;
    isAdmin = false;
    contract = null;
    location.reload();
}

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
                <button id="quick-reg-btn" class="btn btn-send" style="margin-top:16px;" onclick="showRegisterModal()">Зарегистрироваться сейчас</button>
            `;
            input.disabled = true;
            sendBtn.disabled = true;
        }
    } catch (err) {
        console.error('❌ Ошибка проверки регистрации:', err);
    }
}

function showRegisterModal() {
    const modal = document.getElementById('register-modal');
    if (modal) modal.style.display = 'block';
}

function registerProfileFromModal() {
    const username = document.getElementById('reg-username').value.trim();
    const avatarCID = document.getElementById('reg-avatar').value.trim();
    const bio = document.getElementById('reg-bio').value.trim();
    
    if (username) {
        registerProfile(username, avatarCID || `Qm${Date.now()}`, bio);
    } else {
        alert('Введите никнейм!');
    }
}

// === ОТПРАВКА СООБЩЕНИЯ (С ПОДПИСЬЮ) - ЗАФИКСИРОВАНО ✅ ===
async function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;
    
    if (!isRegistered) {
        showRegisterModal();
        return;
    }

    // 🔐 Крипто-подпись сообщения (XMTP style)
    try {
        const signature = await signer.signMessage(text);
        console.log("🔐 Сообщение подписано:", signature);
        
        // Добавляем в UI
        addMessageToUI(text, true);
        input.value = '';
        
        // Имитация ответа
        setTimeout(() => {
            const replies = ['Отлично! Продолжаем 🔥', 'Принято 👍', 'Интересно!'];
            const reply = replies[Math.floor(Math.random() * replies.length)];
            addMessageToUI(reply, false);
        }, 1500);
        
    } catch (err) {
        console.error('❌ Ошибка подписи:', err);
        alert('Не удалось подписать сообщение');
    }
}

function addMessageToUI(text, isSent) {
    const container = document.getElementById('messages-container');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-meta">
            <span>${time}</span>
            ${isSent ? '<span class="status-icon">✓✓</span>' : ''}
        </div>
    `;
    
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function registerProfile(username, avatarCID, bio) {
    if (!contract || !userAddress) return;
    
    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');

    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Подписание транзакции...';
        }
        if (statusEl) {
            statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
            statusEl.style.color = 'var(--text-muted)';
        }
        
        const tx = await contract.registerProfile(username, avatarCID, bio);
        
        if (statusEl) {
            statusEl.textContent = '⛓️ Ожидание подтверждения сети...';
        }

        await tx.wait();

        isRegistered = true;
        if (statusEl) {
            statusEl.textContent = '✅ Профиль успешно создан!';
            statusEl.style.color = 'var(--success)';
        }
        if (btn) {
            btn.textContent = 'Зарегистрировано';
        }
        
        setTimeout(() => {
            checkRegistration();
            if (document.getElementById('register-modal')) {
                document.getElementById('register-modal').style.display = 'none';
            }
        }, 1500);
        
        console.log('✅ Транзакция подтверждена:', tx.hash);
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        if (statusEl) {
            statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
            statusEl.style.color = 'var(--danger)';
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Зарегистрировать в блокчейне';
        }
    }
}

// === АДМИН: KEY ESCROW UI ===
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ разрешён только владельцу платформы.');
        return;
    }
    document.getElementById('admin-modal').style.display = 'flex';
    toggleUserMenu();
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
        // 🔐 Пытаемся получить ключ
        const key = await contract.getEscrowedKey(userAddr);
        
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; word-break:break-all; font-size:11px;">${key}</code>`;
        statusEl.style.color = 'var(--success)';
        
        console.log('🔓 Escrow Key Retrieved:', key);
    } catch (err) {
        console.error('❌ Ошибка получения ключа:', err);
        
        // 🔥 НОВОЕ: Более понятная обработка ошибок
        if (err.code === 'CALL_EXCEPTION') {
            statusEl.innerHTML = `⚠️ <strong>Ключ ещё не зашифрован</strong><br><br>Пользователь ${userAddr.slice(0,6)}...${userAddr.slice(-4)} ещё не зашифровал свой мастер-ключ.<br><br><em>Функция getEscrowedKey() вызвана успешно, но ключ отсутствует в контракте.</em>`;
            statusEl.style.color = 'var(--warning)';
        } else {
            statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
            statusEl.style.color = 'var(--danger)';
        }
    }
}

// === UI ЛОГИКА ===
function renderChatList() {
    const chatList = document.getElementById('chat-list');
    const chats = [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь с кодом', time: '11:45', unread: 0 },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
    ];
    
    chatList.innerHTML = chats.map(chat => `
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
    const chatNames = {
        'dima': 'Дима',
        'ai': 'AI Assistant',
        'crypto': 'Crypto News'
    };
    
    document.getElementById('chat-name').textContent = chatNames[chatId] || 'Чат';
    document.getElementById('chat-status').textContent = 'в сети • 🔐 E2E';
    document.getElementById('chat-avatar').textContent = '👤';
    
    if (isRegistered) {
        document.getElementById('msg-input').disabled = false;
        document.getElementById('send-btn').disabled = false;
        document.getElementById('msg-input').focus();
    }
}

function setupEventListeners() {
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Закрытие меню при клике вне
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('user-menu');
        const profile = document.getElementById('user-profile');
        if (menu && profile && !profile.contains(e.target)) {
            menu.style.display = 'none';
        }
    });
}

function setupWeb3Listeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', () => location.reload());
        window.ethereum.on('chainChanged', () => location.reload());
    }
}

// Глобальные функции
window.selectChat = selectChat;
window.sendMessage = sendMessage;
window.connectWallet = connectWallet;
window.toggleUserMenu = toggleUserMenu;
window.copyAddress = copyAddress;
window.disconnectWallet = disconnectWallet;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
window.showRegisterModal = showRegisterModal;
window.registerProfileFromModal = registerProfileFromModal;
