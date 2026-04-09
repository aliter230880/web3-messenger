// Web3 Messenger - Frontend + Blockchain Integration
// (c) Dima's Web3 Project

// === КОНФИГУРАЦИЯ ===
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137; // Polygon Mainnet
const RPC_URL = "https://polygon-rpc.com";

// Минимальный ABI для нужных функций
const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)"
];

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let provider, signer, contract, userAddress;
let isRegistered = false;

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
        const btn = document.getElementById('connect-wallet');
        btn.textContent = '⏳ Подключение...';
        
        // Запрос доступа
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        // Инициализация провайдера
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

        // Подключение к контракту
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
        
        // Обновление UI
        btn.textContent = `✅ ${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
        btn.style.background = 'var(--success)';
        
        // Проверка регистрации
        await checkRegistration();
        
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        document.getElementById('connect-wallet').textContent = '🔗 Подключить кошелёк';
        alert('Не удалось подключиться. Проверьте MetaMask.');
    }
}

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
                <p style="margin-top:8px; color:var(--success);">Готов к общению в блокчейне</p>
            `;
            regModal.style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            regModal.style.display = 'block';
        }
    } catch (err) {
        console.error('❌ Ошибка проверки регистрации:', err);
    }
}

async function registerProfile() {
    if (!contract || !userAddress) return;
    
    const username = document.getElementById('reg-username').value.trim();
    const avatarCID = document.getElementById('reg-avatar').value.trim();
    const bio = document.getElementById('reg-bio').value.trim();
    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');
    
    if (!username || !avatarCID) {
        statusEl.textContent = '⚠️ Заполните ник и Avatar CID';
        statusEl.style.color = 'var(--warning)';
        return;
    }
    
    try {
        btn.disabled = true;
        btn.textContent = '⏳ Подписание транзакции...';
        statusEl.textContent = 'Подтвердите транзакцию в MetaMask';
        statusEl.style.color = 'var(--text-muted)';
        
        // Вызов контракта
        const tx = await contract.registerProfile(username, avatarCID, bio);
        statusEl.textContent = '⛓️ Ожидание подтверждения сети...';
        
        await tx.wait();
        
        statusEl.textContent = '✅ Профиль успешно создан!';
        statusEl.style.color = 'var(--success)';
        btn.textContent = 'Зарегистрировано';
        
        // Обновляем состояние
        isRegistered = true;
        setTimeout(() => {
            checkRegistration();
            enableChatInput();
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

function enableChatInput() {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('msg-input').placeholder = 'Написать сообщение...';
    document.getElementById('msg-input').focus();
}

// === UI ЛОГИКА ===
function renderChatList() {
    const chatList = document.getElementById('chat-list');
    // Демо-данные (можно заменить на динамические позже)
    const chats = [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь с кодом', time: '11:45', unread: 0 },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin пробил $100k!', time: '10:20', unread: 24 }
    ];
    
    chatList.innerHTML = chats.map(chat => `
        <div class="chat-item ${store?.currentChat === chat.id ? 'active' : ''}" onclick="selectChat('${chat.id}')">
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
    // Простая навигация (расширится позже)
    document.getElementById('chat-name').textContent = chatId === 'dima' ? 'Дима' : chatId === 'ai' ? 'AI Assistant' : 'Crypto News';
    document.getElementById('chat-status').textContent = 'в сети • 🔐 E2E';
    enableChatInput();
}

function setupEventListeners() {
    // Кнопка подключения кошелька
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    
    // Кнопка регистрации
    document.getElementById('btn-register').addEventListener('click', registerProfile);
    
    // Отправка сообщений (демо)
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

function setupWeb3Listeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                location.reload(); // Отключился
            } else {
                location.reload(); // Сменил аккаунт
            }
        });
        
        window.ethereum.on('chainChanged', () => {
            location.reload(); // Сменил сеть
        });
    }
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;
    
    // Здесь позже добавим шифрование и отправку в блокчейн/XMTP
    console.log('📤 Отправка:', text);
    input.value = '';
    
    // Демо-ответ
    setTimeout(() => {
        alert('💬 Сообщение отправлено! (Web3-слой в разработке)');
    }, 500);
}

// Глобальные функции для HTML
window.selectChat = selectChat;
