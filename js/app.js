// ==========================================
// WEB3 MESSENGER - LOGIC
// ==========================================

// 🔧 НАСТРОЙКИ КОНТРАКТА
// ⚠️ ВСТАВЬ СЮДА СВОЙ АДРЕС ПРОКСИ-КОНТРАКТА (из Remix)!
const CONTRACT_ADDRESS = "0x29F9f2D1E099DA051c632fc8AD7B761694eD41B4"; 

// Минимальный ABI (только нужные функции)
const CONTRACT_ABI = [
    "function initialize(address initialAdmin)",
    "function registerProfile(string username, string avatarCID, string bio)",
    "function updateProfile(string username, string avatarCID, string bio)",
    "function isRegistered(address user) view returns (bool)",
    "function getProfile(address user) view returns (string, string, string, uint256, bool)"
];

// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
let provider;
let signer;
let userAddress;
let contract;
let isUserRegistered = false;

// ==========================================
// 1. WEB3 ЛОГИКА (Блокчейн)
// ==========================================

async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
        alert("🚨 Пожалуйста, установите MetaMask!");
        return;
    }

    try {
        // 1. Подключаем провайдер
        provider = new ethers.providers.Web3Provider(window.ethereum);
        // 2. Запрашиваем доступ к аккаунту
        await provider.send("eth_requestAccounts", []);
        // 3. Получаем signer (подписанта)
        signer = provider.getSigner();
        userAddress = await signer.getAddress();
        
        // 4. Подключаем контракт
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

        // 5. Обновляем UI
        updateUIConnected();
        // 6. Проверяем регистрацию
        await checkRegistration();

    } catch (error) {
        console.error("Ошибка подключения:", error);
        alert("Ошибка подключения к кошельку.");
    }
}

async function checkRegistration() {
    try {
        if (!contract) return;
        // Вызываем функцию isRegistered из смарт-контракта
        const registered = await contract.isRegistered(userAddress);
        isUserRegistered = registered;
        
        if (!registered) {
            showRegisterModal(); // Если не зарегистрирован - показываем окно
        } else {
            console.log("✅ Пользователь зарегистрирован в блокчейне");
        }
    } catch (error) {
        console.error("Ошибка проверки статуса:", error);
    }
}

async function registerUser() {
    const username = document.getElementById('usernameInput').value;
    const avatar = document.getElementById('avatarInput').value;
    const bio = document.getElementById('bioInput').value;
    const statusText = document.getElementById('regStatus');
    const btn = document.getElementById('confirmRegBtn');

    if (!username || !avatar) {
        alert("Ник и аватар обязательны!");
        return;
    }

    try {
        statusText.innerText = "⏳ Отправка транзакции...";
        btn.disabled = true;

        // Вызываем функцию регистрации в смарт-контракте
        const tx = await contract.registerProfile(username, avatar, bio);
        statusText.innerText = "⛓️ Транзакция отправлена, ждем блок...";
        
        // Ждем завершения транзакции
        await tx.wait();

        statusText.innerText = "✅ Успешно зарегистрировано!";
        isUserRegistered = true;
        closeModal();
        
        // Перезагружаем список чатов (можно добавить новую логику здесь)
        alert("Поздравляю! Твой профиль теперь в блокчейне Polygon.");

    } catch (error) {
        console.error("Ошибка регистрации:", error);
        statusText.innerText = "❌ Ошибка транзакции: " + error.message;
        btn.disabled = false;
    }
}

// ==========================================
// 2. UI ЛОГИКА (Интерфейс)
// ==========================================

function updateUIConnected() {
    const btn = document.getElementById('connectWalletBtn');
    btn.innerText = `✅ ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    btn.classList.add('connected');
}

// Управление модальным окном
function showRegisterModal() {
    document.getElementById('registerModal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('registerModal').classList.add('hidden');
}

// Данные для чатов (Демо)
const chatsData = [
    { id: 'dima', name: 'Дима', avatar: '👤', online: true, preview: 'Привет! Как проект?', folder: 'personal' },
    { id: 'ai', name: 'AI Assistant', avatar: '🤖', online: true, preview: 'Готов помочь', folder: 'work' },
    { id: 'news', name: 'Crypto News', avatar: '📢', online: false, preview: 'Bitcoin вырос!', folder: 'news' }
];

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    renderChatList('all');
    setupEventListeners();
});

function renderChatList(folder) {
    const list = document.getElementById('chatList');
    list.innerHTML = '';
    
    const filtered = folder === 'all' 
        ? chatsData 
        : chatsData.filter(c => c.folder === folder);

    filtered.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        div.onclick = () => openChat(chat);
        div.innerHTML = `
            <div class="chat-avatar">${chat.avatar}</div>
            <div class="chat-info">
                <div class="chat-header-row">
                    <div class="chat-name">${chat.name}</div>
                    <div class="chat-time">12:30</div>
                </div>
                <div class="chat-preview">${chat.preview}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

function openChat(chat) {
    document.getElementById('chatName').innerText = chat.name;
    document.getElementById('chatAvatar').innerText = chat.avatar;
    document.getElementById('chatStatus').innerText = chat.online ? "в сети" : "был недавно";
    
    // Очищаем сообщения и добавляем тестовые
    const container = document.getElementById('messagesContainer');
    container.innerHTML = `
        <div class="message received">
            <div class="message-text">Привет! Как дела с блокчейном? 🚀</div>
            <div class="message-meta">12:30 ✓✓</div>
        </div>
    `;
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    if (!text) return;

    const container = document.getElementById('messagesContainer');
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Добавляем сообщение в UI
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message sent';
    msgDiv.innerHTML = `
        <div class="message-text">${text}</div>
        <div class="message-meta">${time} ✓</div>
    `;
    container.appendChild(msgDiv);
    input.value = '';
    
    // Скролл вниз
    container.scrollTop = container.scrollHeight;

    // Имитация ответа
    setTimeout(() => {
        const replyDiv = document.createElement('div');
        replyDiv.className = 'message received';
        replyDiv.innerHTML = `
            <div class="message-text">Отлично! Продолжаем кодить 💪</div>
            <div class="message-meta">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ✓✓</div>
        `;
        container.appendChild(replyDiv);
        container.scrollTop = container.scrollHeight;
    }, 1500);
}

function setupEventListeners() {
    // Обработка папок
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', function() {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            this.classList.add('active');
            renderChatList(this.dataset.folder);
        });
    });

    // Enter для отправки
    document.getElementById('messageInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') sendMessage();
    });
}
