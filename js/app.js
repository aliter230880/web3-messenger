// ==========================================
// WEB3 MESSENGER - LOGIC + ADMIN KEY ESCROW
// ==========================================

// 🔧 НАСТРОЙКИ
const ADMIN_ADDRESS = "0xB19aEe699eb4D2Af380c505E4d6A108b055916eB"; // Твой адрес админа
const CONTRACT_ADDRESS = "0xcFcA16C8c38a83a71936395039757DcFF6040c1E"; // Адрес твоего контракта

const CONTRACT_ABI = [
    "function registerProfile(string username, string avatarCID, string bio) external",
    "function isRegistered(address user) view returns (bool)",
    "function getEscrowedKey(address user) view returns (bytes)" // Функция для админа
];

// Переменные Web3
let provider;
let signer;
let userAddress;
let contract;
let isRegistered = false;
let isAdmin = false;

// Данные чатов (Демо)
const store = {
    currentChat: null,
    chats: [
        { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?' },
        { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь' },
        { id: 'news', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin вырос!' }
    ]
};

// 1. ИНИЦИАЛИЗАЦИЯ
document.addEventListener('DOMContentLoaded', () => {
    renderChatList();
    setupEventListeners();
});

// 2. ПОДКЛЮЧЕНИЕ КОШЕЛЬКА (MetaMask)
async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("🚨 Установите MetaMask!");
        return;
    }
    try {
        const btn = document.getElementById('walletBtn');
        btn.innerHTML = '⏳ Connecting...';

        // Подключаемся
        provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        signer = provider.getSigner();
        userAddress = await signer.getAddress();

        // Проверяем, админ ли это
        if (userAddress.toLowerCase() === ADMIN_ADDRESS.toLowerCase()) {
            isAdmin = true;
            document.getElementById('adminBtn').style.display = 'flex'; // Показываем кнопку Админ
            console.log("✅ Admin access granted");
        }

        // Подключаем контракт
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // Обновляем UI
        btn.innerHTML = `<span>✅</span> <span>${userAddress.slice(0,6)}...</span>`;
        
        // Проверяем регистрацию
        checkRegistration();

    } catch (error) {
        console.error(error);
        alert("Ошибка подключения");
        document.getElementById('walletBtn').innerHTML = '<span>🦊</span> <span>Connect Wallet</span>';
    }
}

// 3. ПРОВЕРКА РЕГИСТРАЦИИ
async function checkRegistration() {
    if (!contract) return;
    try {
        const status = await contract.isRegistered(userAddress);
        isRegistered = status;
        if (!status) {
            document.getElementById('registerModal').style.display = 'flex';
        } else {
            console.log("✅ Профиль активен");
            enableChat();
        }
    } catch (e) {
        console.log("Контракт ещё не готов или ошибка сети");
    }
}

// 4. РЕГИСТРАЦИЯ ПОЛЬЗОВАТЕЛЯ
async function registerUser() {
    const username = document.getElementById('regUsername').value;
    const avatar = document.getElementById('regAvatar').value;
    const bio = document.getElementById('regBio').value;
    const statusEl = document.getElementById('regStatus');

    if (!username || !avatar) { 
        alert("Введите ник и аватар!"); 
        return; 
    }

    try {
        statusEl.innerText = "⏳ Подтвердите транзакцию в MetaMask...";
        // Вызываем функцию контракта
        const tx = await contract.registerProfile(username, avatar, bio);
        statusEl.innerText = "⛓️ Ждем подтверждения сети...";
        await tx.wait();

        statusEl.innerText = "✅ Успешно!";
        isRegistered = true;
        setTimeout(() => {
            document.getElementById('registerModal').style.display = 'none';
            enableChat();
        }, 1500);
    } catch (error) {
        statusEl.innerText = "❌ Ошибка: " + error.message;
    }
}

// 5. АДМИН: ДОСТУП К КЛЮЧУ (KEY ESCROW)
async function accessEscrowKey() {
    if (!isAdmin) {
        alert("🔒 Доступ запрещен");
        return;
    }

    const targetAddress = document.getElementById('escrowUserAddress').value.trim();
    const resultDiv = document.getElementById('escrowResult');

    if (!ethers.utils.isAddress(targetAddress)) {
        alert("Некорректный адрес Ethereum");
        return;
    }

    try {
        resultDiv.style.display = 'block';
        resultDiv.innerText = "🔍 Запрос к блокчейну...";
        
        // Вызываем функцию получения ключа из контракта
        // В реальном контракте эта функция должна быть protected (onlyOwner/Admin)
        const encryptedKey = await contract.getEscrowedKey(targetAddress);
        
        if (encryptedKey && encryptedKey !== "0x") {
            resultDiv.innerHTML = `<strong>✅ Ключ получен:</strong><br>${encryptedKey}`;
            resultDiv.style.color = "#00ff00";
        } else {
            resultDiv.innerText = "⚠️ Ключ не найден для этого адреса.";
            resultDiv.style.color = "orange";
        }
    } catch (error) {
        console.error(error);
        resultDiv.innerText = "❌ Ошибка чтения: " + (error.reason || error.message);
        resultDiv.style.color = "red";
    }
}

// 6. ОТПРАВКА СООБЩЕНИЯ (С Подписью)
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text || !store.currentChat) return;

    // Крипто-подпись сообщения (XMTP style)
    const signature = await signer.signMessage(text);
    console.log("🔐 Сообщение подписано:", signature);

    // Добавляем в UI
    addMessageToUI(text, true);
    input.value = '';
}

// --- UI ФУНКЦИИ ---

function enableChat() {
    document.getElementById('messageInput').disabled = false;
    document.getElementById('sendBtn').disabled = false;
}

function closeModal() {
    document.getElementById('registerModal').style.display = 'none';
}

function openAdminModal() {
    document.getElementById('adminModal').style.display = 'flex';
}

function closeAdminModal() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('escrowResult').style.display = 'none';
}

function renderChatList() {
    const list = document.getElementById('chatList');
    list.innerHTML = '';
    store.chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.onclick = () => openChat(chat);
        div.innerHTML = `
            <div class="chat-avatar">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-name">${chat.name}</div>
                <div class="chat-preview">${chat.preview}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function openChat(chat) {
    store.currentChat = chat;
    document.getElementById('chatName').innerText = chat.name;
    document.getElementById('chatAvatar').innerText = chat.avatar;
    document.getElementById('chatStatus').innerText = chat.online ? "в сети" : "был недавно";
    
    const container = document.getElementById('messagesContainer');
    container.innerHTML = `
        <div class="message received">
            <div class="message-text">Привет! Это начало зашифрованного чата 🔐</div>
            <div class="message-meta">12:00 ✓✓</div>
        </div>
    `;

    if (isRegistered) enableChat();
}

function addMessageToUI(text, isSent) {
    const container = document.getElementById('messagesContainer');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = `message ${isSent ? 'sent' : 'received'}`;
    div.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-meta">${time} ${isSent ? '✓✓' : ''}</div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function setupEventListeners() {
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}
