// Web3 Messenger - Frontend + Blockchain Integration v3
// (c) Dima's Web3 Project
// 🔐 FIXED: Не ломаем рабочие фичи, только улучшаем

const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB";
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E";
const CHAIN_ID = 137;

const CONTRACT_ABI = [
    "function isRegistered(address user) view returns (bool)",
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function getProfile(address user) view returns (string,string,string,uint256,bool)",
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

// === WEB3: ПОДКЛЮЧЕНИЕ КОШЕЛЬКА ===
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert('⚠️ Установите MetaMask');
        return;
    }
    try {
        const btn = document.getElementById('wallet-btn');
        btn.innerHTML = '<span>⏳</span><span>Подключение...</span>';
        btn.style.opacity = '0.7';

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

        // Обновляем UI кнопки
        btn.innerHTML = `✅ ${userAddress.slice(0,6)}...${userAddress.slice(-4)}`;
        btn.style.background = 'var(--success)';
        btn.style.color = '#000';
        btn.style.opacity = '1';

        // Проверка админа
        isAdmin = userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase();
        const adminBtn = document.getElementById('admin-btn');
        if (adminBtn) adminBtn.style.display = isAdmin ? 'flex' : 'none';

        await checkRegistration();
        console.log('✅ Кошелёк подключен:', userAddress);
    } catch (err) {
        console.error('❌ Ошибка подключения:', err);
        const btn = document.getElementById('wallet-btn');
        btn.innerHTML = '🦊 Подключить';
        btn.style.background = '';
        btn.style.color = '';
        btn.style.opacity = '1';
    }
}

// === WEB3: ПРОВЕРКА РЕГИСТРАЦИИ ===
async function checkRegistration() {
    if (!contract || !userAddress) return;
    try {
        isRegistered = await contract.isRegistered(userAddress);
        const emptyState = document.getElementById('empty-state');
        const regModal = document.getElementById('register-modal');
        
        if (isRegistered) {
            emptyState.innerHTML = `
                <div style="text-align:center">
                    <div style="font-size:64px;margin-bottom:16px">✅</div>
                    <h3>Профиль активен</h3>
                    <p style="font-size:13px;color:var(--text-muted)">Адрес: ${userAddress.slice(0,10)}...${userAddress.slice(-8)}</p>
                    <p style="margin-top:8px;color:var(--success)">Готов к общению в блокчейне</p>
                </div>
            `;
            regModal.style.display = 'none';
            enableChatInput();
        } else {
            emptyState.style.display = 'none';
            regModal.style.display = 'block';
        }
    } catch (err) {
        console.error('❌ Ошибка проверки:', err);
    }
}

// === WEB3: РЕГИСТРАЦИЯ ===
async function registerProfile() {
    if (!contract || !userAddress) return;
    
    const username = document.getElementById('reg-username').value.trim();
    const avatarCID = document.getElementById('reg-avatar').value.trim() || `Qm${Date.now()}`;
    const bio = document.getElementById('reg-bio').value.trim();
    const statusEl = document.getElementById('reg-status');
    const btn = document.getElementById('btn-register');

    if (!username) {
        statusEl.textContent = '⚠️ Введите никнейм';
        statusEl.style.color = 'var(--warning)';
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = '⏳ Подтвердите в MetaMask...';
        statusEl.textContent = 'Подписание транзакции...';
        statusEl.style.color = 'var(--text-muted)';

        const tx = await contract.registerProfile(username, avatarCID, bio);
        statusEl.textContent = '⛓️ Ждём подтверждения сети...';
        
        await tx.wait();

        statusEl.textContent = '✅ Профиль создан!';
        statusEl.style.color = 'var(--success)';
        btn.textContent = 'Зарегистрировано';
        isRegistered = true;

        setTimeout(() => {
            checkRegistration();
            enableChatInput();
        }, 1500);
    } catch (err) {
        console.error('❌ Ошибка регистрации:', err);
        statusEl.textContent = '❌ ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
        btn.disabled = false;
        btn.textContent = 'Зарегистрировать';
    }
}

// === СООБЩЕНИЯ С ПОДПИСЬЮ (БЕЗ ALERT) ===
function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text || !document.querySelector('.chat-item.active')) return;

    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message sent';
    
    // 🔐 Мелкий индикатор подписи под сообщением (вместо alert)
    msgDiv.innerHTML = `
        <div class="message-text">${escapeHtml(text)}</div>
        <div class="message-meta">
            <span>${time}</span>
            <span class="signature-badge">🔐</span>
        </div>
    `;
    
    const container = document.getElementById('messages-container');
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
    input.value = '';

    // Подписываем сообщение кошельком (фоновая операция)
    if (signer) {
        signer.signMessage(text).then(sig => {
            console.log('🔐 Сообщение подписано:', sig.slice(0,20) + '...');
            // Можно добавить sig в БД позже, сейчас просто логируем
        }).catch(err => {
            console.warn('⚠️ Не удалось подписать:', err);
        });
    }

    // Демо-ответ
    setTimeout(() => {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message received';
        replyDiv.innerHTML = `
            <div class="message-text">Отлично! Продолжаем кодить 💪</div>
            <div class="message-meta">${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
        `;
        container.appendChild(replyDiv);
        container.scrollTop = container.scrollHeight;
    }, 1500);
}

// === АДМИН: KEY ESCROW (ИСПРАВЛЕНО) ===
function openAdminModal() {
    if (!isAdmin) {
        alert('🔒 Доступ только владельцу');
        return;
    }
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
        // 🔐 Реальный вызов функции getEscrowedKey из контракта
        const encryptedKey = await contract.getEscrowedKey(userAddr);
        
        if (encryptedKey && encryptedKey !== "0x") {
            statusEl.innerHTML = `✅ Ключ получен:<br><code style="background:var(--bg-tertiary);padding:8px;border-radius:4px;display:block;margin-top:8px;font-size:11px;word-break:break-all">${encryptedKey}</code>`;
            statusEl.style.color = 'var(--success)';
        } else {
            statusEl.textContent = '⚠️ Ключ не найден для этого адреса';
            statusEl.style.color = 'var(--warning)';
        }
    } catch (err) {
        statusEl.textContent = '❌ Ошибка: ' + (err.reason || err.message);
        statusEl.style.color = 'var(--danger)';
    }
}

// === UI ФУНКЦИИ ===
function enableChatInput() {
    document.getElementById('msg-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
    document.getElementById('msg-input').placeholder = 'Написать сообщение...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderChatList() {
    const chatList = document.getElementById('chat-list');
    const chats = [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', time: '12:30', unread: 3 },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь', time: '11:45', unread: 0 },
        { id: 'crypto', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin $100k!', time: '10:20', unread: 24 }
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
    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    const chat = {dima: 'Дима', ai: 'AI Assistant', crypto: 'Crypto News'}[chatId];
    document.getElementById('chat-name').textContent = chat;
    document.getElementById('chat-status').textContent = 'в сети • 🔐 E2E';
    
    if (isRegistered) enableChatInput();
}

function setupEventListeners() {
    // Кнопка кошелька
    document.getElementById('wallet-btn').addEventListener('click', connectWallet);
    
    // Кнопка регистрации
    document.getElementById('btn-register').addEventListener('click', registerProfile);
    
    // Отправка сообщений
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('msg-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Кнопка админа
    document.getElementById('admin-btn').addEventListener('click', openAdminModal);
    document.getElementById('btn-access-escrow').addEventListener('click', accessEscrowKey);
    
    // Закрытие модалки по клику на фон
    document.getElementById('admin-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) e.target.style.display = 'none';
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
window.registerProfile = registerProfile;
window.openAdminModal = openAdminModal;
window.accessEscrowKey = accessEscrowKey;
