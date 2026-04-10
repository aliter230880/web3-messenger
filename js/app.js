// Web3 Messenger - Frontend + Blockchain Integration v3
// (c) Dima's Web3 Project
// 🔐 ADMIN CONFIG
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet
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

// Data Store
const store = {
    currentChat: null,
    currentFolder: 'all',
    chats: [
        {
            id: 'dima',
            name: 'Дима',
            avatar: '👤',
            online: true,
            folder: 'personal',
            preview: 'Привет! Как проект?',
            time: '12:30',
            unread: 3,
            messages: [
                { id: 1, text: 'Привет! Как проект?', sent: false, time: '12:28', status: 'delivered' }
            ]
        },
        {
            id: 'ai',
            name: 'AI Assistant',
            avatar: '🤖',
            online: true,
            folder: 'work',
            preview: 'Готов помочь с кодом',
            time: '11:45',
            unread: 0,
            messages: []
        },
        {
            id: 'crypto',
            name: 'Crypto News',
            avatar: '📢',
            online: false,
            folder: 'news',
            preview: 'Bitcoin пробил $100k!',
            time: '10:20',
            unread: 24,
            messages: []
        }
    ]
};

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Web3 Messenger initialized');
    renderSidebar();
    renderChatList();
    setupEventListeners();
    updateInputState();
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

        // Обновляем UI кошелька
        btn.innerHTML = `<span>✅</span><span>${userAddress.slice(0,6)}...${userAddress.slice(-4)}</span>`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';

        // Проверяем, является ли пользователь админом
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) {
            adminBtn.style.display = isAdmin ? 'flex' : 'none';
        }

        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        document.getElementById('wallet-btn').innerHTML = '<span>🦊</span><span>Подключить</span>';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

async function checkRegistration() {
    if (!contract || !userAddress) return;

    try {
        isRegistered = await contract.isRegistered(userAddress);
        const emptyState = document.getElementById('empty-state');
        const regModal = document.getElementById('register-modal');
        const input = document.getElementById('msg-input');
        const sendBtn = document.getElementById('send-btn');

        if (isRegistered) {
            emptyState.innerHTML = `
                <div class="empty-state-icon">✅</div>
                <h3>Профиль активен</h3>
                <p>Ваш адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
            `;
            regModal.style.display = 'none';
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'Написать сообщение...';
        } else {
            emptyState.style.display = 'none';
            regModal.style.display = 'block';
            input.disabled = true;
            sendBtn.disabled = true;
        }
    } catch (err) {
        console.error('❌ Ошибка проверки регистрации:', err);
    }
}

async function registerProfile(username, avatarCID, bio) {
    if (!contract || !userAddress) return;

    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');

    try {
        btn.disabled = true;
        btn.textContent = '⏳ Подписание транзакции...';
        statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
        statusEl.style.color = 'var(--text-muted)';

        const tx = await contract.registerProfile(username, avatarCID || `Qm${Date.now()}`, bio || "");
        
        statusEl.textContent = '⛓️ Ожидание подтверждения сети...';
        await tx.wait();

        statusEl.textContent = '✅ Профиль успешно создан!';
        statusEl.style.color = 'var(--success)';
        btn.textContent = 'Зарегистрировано';

        isRegistered = true;
        setTimeout(() => {
            checkRegistration();
            updateInputState();
        }, 1500);

        console.log('✅ Транзакция подтверждена:', tx.hash);
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = 'Зарегистрировать в блокчейне';
    }
}

// === АДМИН: KEY ESCROW UI ===
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ разрешён только владельцу платформы.');
        return;
    }
    document.getElementById('admin-modal').style.display = 'flex';
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
        // 🔐 Здесь будет реальный вызов: const key = await contract.getEscrowedKey(userAddr);
        await new Promise(r => setTimeout(r, 1200));
        const mockKey = "0x" + Array(64).fill(0).map(() => Math.floor(Math.random()*16).toString(16)).join('');
        
        statusEl.innerHTML = `✅ Ключ получен!<br><code style="background:var(--bg-tertiary); padding:4px 8px; border-radius:4px; word-break:break-all; font-size:11px;">${mockKey}</code>`;
        statusEl.style.color = 'var(--success)';
        
        console.log('🔓 Escrow Key Retrieved:', mockKey);
    } catch (err) {
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

// === UI ЛОГИКА ===
function renderSidebar() {
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        item.addEventListener('click', function() {
            sidebarItems.forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            const folder = this.dataset.folder || 'all';
            store.currentFolder = folder;
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

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    if (!chatList) return;

    const filteredChats = getFilteredChats();
    
    if (filteredChats.length === 0) {
        chatList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">📭<p>Нет чатов в этой папке</p></div>';
        return;
    }

    chatList.innerHTML = filteredChats.map(chat => `
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

function selectChat(chatId) {
    store.currentChat = chatId;
    const chat = store.chats.find(c => c.id === chatId);
    
    if (chat) {
        chat.unread = 0;
        renderChatList();
        
        document.getElementById('chat-name').textContent = chat.name;
        document.getElementById('chat-avatar').textContent = chat.avatar;
        document.getElementById('chat-status').textContent = chat.online ? 'в сети • 🔐 E2E' : 'был(а) недавно';
        
        if (isRegistered) {
            updateInputState();
        }
    }
}

function renderEmptyState() {
    const container = document.getElementById('messages-container');
    const regModal = document.getElementById('register-modal');
    
    if (container) {
        container.innerHTML = `
            <div class="empty-state" id="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3>Добро пожаловать в Web3 Messenger</h3>
                <p>Подключи кошелек и выбери чат, чтобы начать.</p>
            </div>
        `;
    }
}

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
            input.placeholder = store.currentChat ? 'Сначала зарегистрируйтесь' : 'Выберите чат...';
        }
    }
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    
    if (!text) return;
    
    // Если пользователь не зарегистрирован, текст считается никнеймом
    if (!isRegistered) {
        registerProfile(text, "", "");
        return;
    }

    console.log('📤 Отправка:', text);
    input.value = '';

    // Здесь позже добавим шифрование и отправку в XMTP/контракт
    setTimeout(() => alert('💬 Сообщение отправлено! (Web3-слой в разработке)'), 300);
}

function setupEventListeners() {
    // Кнопка подключения кошелька
    document.getElementById('wallet-btn').addEventListener('click', connectWallet);
    
    // Кнопка регистрации
    document.getElementById('btn-register').addEventListener('click', () => {
        const username = document.getElementById('reg-username').value.trim();
        const avatarCID = document.getElementById('reg-avatar').value.trim();
        const bio = document.getElementById('reg-bio').value.trim();
        registerProfile(username, avatarCID, bio);
    });
    
    // Админ кнопка
    const adminBtn = document.getElementById('admin-btn');
    if (adminBtn) {
        adminBtn.addEventListener('click', openAdminModal);
    }
    
    // Кнопка доступа к ключу
    document.getElementById('btn-access-escrow').addEventListener('click', accessEscrowKey);
    
    // Отправка сообщений
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    
    // Чат табы
    document.querySelectorAll('.chat-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.chat-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
        });
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
