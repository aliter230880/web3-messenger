// Web3 Integration for Web3 Messenger
// (c) Dima's Web3 Project

let provider;
let signer;
let userAddress;
let contract;

// Адрес контракта Identity (заменишь после деплоя!)
const IDENTITY_CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000"; // TODO: вставить адрес после деплоя

// ABI контракта (минимальный интерфейс)
const IDENTITY_ABI = [
  "function registerProfile(string calldata username, string calldata avatarCID, string calldata bio) external",
  "function updateProfile(string calldata username, string calldata avatarCID, string calldata bio) external",
  "function getProfile(address user) external view returns (string memory username, string memory avatarCID, string memory bio, uint256 registeredAt, bool isActive)",
  "function isRegistered(address user) external view returns (bool)",
  "event ProfileRegistered(address indexed user, string username, string avatarCID)"
];

// Инициализация Web3
async function initWeb3() {
  if (typeof window.ethereum !== 'undefined') {
    provider = new ethers.providers.Web3Provider(window.ethereum);
    
    try {
      // Запрос доступа к аккаунту
      const accounts = await provider.send("eth_requestAccounts", []);
      signer = provider.getSigner();
      userAddress = accounts[0];
      
      console.log("✅ Кошелёк подключен:", userAddress);
      
      // Инициализация контракта
      if (IDENTITY_CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
        contract = new ethers.Contract(IDENTITY_CONTRACT_ADDRESS, IDENTITY_ABI, signer);
      }
      
      // Проверка регистрации
      await checkRegistration();
      
      return true;
    } catch (error) {
      console.error("❌ Ошибка подключения:", error);
      alert("Не удалось подключить кошелёк: " + error.message);
      return false;
    }
  } else {
    alert("MetaMask не найден! Установите MetaMask: https://metamask.io/");
    return false;
  }
}

// Проверка, зарегистрирован ли пользователь
async function checkRegistration() {
  if (!contract) {
    console.log("⚠️ Контракт ещё не развёрнут");
    updateWalletUI(false, true); // Показываем кнопку регистрации
    return;
  }
  
  try {
    const isRegistered = await contract.isRegistered(userAddress);
    console.log("📋 Статус регистрации:", isRegistered);
    
    if (isRegistered) {
      // Загружаем профиль
      const profile = await contract.getProfile(userAddress);
      console.log("👤 Профиль загружен:", profile);
      updateWalletUI(true, false, profile[0]); // profile[0] = username
    } else {
      updateWalletUI(false, true); // Нужно зарегистрироваться
    }
  } catch (error) {
    console.error("❌ Ошибка проверки регистрации:", error);
    updateWalletUI(false, true);
  }
}

// Обновление UI кошелька
function updateWalletUI(connected, needsRegistration, username = null) {
  const walletBtn = document.querySelector('.sidebar-item[onclick*="Wallet"]');
  
  if (connected) {
    // Кошелёк подключён и зарегистрирован
    if (walletBtn) {
      walletBtn.innerHTML = `
        <span>💰</span>
        <span>${username || userAddress.slice(0,6) + '...' + userAddress.slice(-4)}</span>
      `;
      walletBtn.onclick = showWalletModal;
    }
    
    // Разблокируем все функции чата
    const input = document.querySelector('.input-wrapper input');
    const sendBtn = document.querySelector('.send-btn');
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    
  } else if (needsRegistration) {
    // Нужно зарегистрироваться
    if (walletBtn) {
      walletBtn.innerHTML = `
        <span>⚠️</span>
        <span>Регистрация</span>
      `;
      walletBtn.onclick = showRegistrationModal;
    }
  } else {
    // Нужно подключить кошелёк
    if (walletBtn) {
      walletBtn.innerHTML = `
        <span>🦊</span>
        <span>Подключить</span>
      `;
      walletBtn.onclick = () => initWeb3();
    }
  }
}

// Модальное окно регистрации
function showRegistrationModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="background: var(--bg-secondary); padding: 32px; border-radius: 16px; max-width: 450px; width: 90%;">
      <h2 style="margin-bottom: 24px; font-size: 24px;">👤 Регистрация профиля</h2>
      <p style="color: var(--text-secondary); margin-bottom: 24px;">
        Создайте свой профиль в Web3 Messenger. Это записывается в блокчейн Polygon.
      </p>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px;">Никнейм (уникальный)</label>
        <input type="text" id="reg-username" placeholder="Ваш никнейм" 
          style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 14px;">
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: block; margin-bottom: 8px; font-size: 14px;">Bio (о себе)</label>
        <textarea id="reg-bio" placeholder="Расскажите о себе..." rows="3"
          style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); font-size: 14px; resize: vertical;"></textarea>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button onclick="this.closest('.modal-overlay').remove()" 
          style="flex: 1; padding: 12px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-tertiary); color: var(--text-primary); cursor: pointer;">
          Отмена
        </button>
        <button onclick="registerProfile()" 
          style="flex: 1; padding: 12px; border-radius: 8px; border: none; background: var(--accent); color: white; cursor: pointer; font-weight: 600;">
          Зарегистрироваться
        </button>
      </div>
      
      <p style="margin-top: 16px; font-size: 12px; color: var(--text-muted); text-align: center;">
        ⛽ Комиссия сети: ~0.01 MATIC
      </p>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Регистрация профиля
async function registerProfile() {
  const username = document.getElementById('reg-username').value.trim();
  const bio = document.getElementById('reg-bio').value.trim();
  
  if (!username) {
    alert("Введите никнейм!");
    return;
  }
  
  if (!contract) {
    alert("Контракт ещё не развёрнут. Обратитесь к разработчику.");
    return;
  }
  
  try {
    // Показываем статус
    const btn = document.querySelector('.modal-content button[onclick="registerProfile()"]');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Подтвердите в MetaMask...";
    btn.disabled = true;
    
    // Вызываем контракт
    const tx = await contract.registerProfile(username, "", bio);
    console.log("📤 Транзакция отправлена:", tx.hash);
    
    // Ждём подтверждения
    const receipt = await tx.wait();
    console.log("✅ Транзакция подтверждена:", receipt.transactionHash);
    
    // Закрываем модалку
    document.querySelector('.modal-overlay').remove();
    
    // Обновляем UI
    await checkRegistration();
    
    alert("🎉 Профиль успешно зарегистрирован!");
    
  } catch (error) {
    console.error("❌ Ошибка регистрации:", error);
    alert("Ошибка: " + (error.reason || error.message));
  }
}

// Модальное окно кошелька
function showWalletModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="background: var(--bg-secondary); padding: 32px; border-radius: 16px; max-width: 450px; width: 90%;">
      <h2 style="margin-bottom: 24px; font-size: 24px;">💰 Кошелёк</h2>
      
      <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 12px; margin-bottom: 24px;">
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Адрес кошелька</div>
        <div style="font-family: monospace; font-size: 14px; word-break: break-all;">${userAddress}</div>
      </div>
      
      <div style="margin-bottom: 24px;">
        <div style="font-size: 14px; margin-bottom: 8px;">Баланс: <strong>0 MATIC</strong></div>
        <div style="font-size: 12px; color: var(--text-muted);">Интеграция с Polygon в разработке...</div>
      </div>
      
      <button onclick="this.closest('.modal-overlay').remove()" 
        style="width: 100%; padding: 12px; border-radius: 8px; border: none; background: var(--accent); color: white; cursor: pointer; font-weight: 600;">
        Закрыть
      </button>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Экспортируем функции глобально
window.initWeb3 = initWeb3;
window.showRegistrationModal = showRegistrationModal;
window.registerProfile = registerProfile;
window.showWalletModal = showWalletModal;

// Добавляем стили для модалок
const style = document.createElement('style');
style.textContent = `
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }
  .modal-content {
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  }
`;
document.head.appendChild(style);

console.log("🌐 Web3 модуль загружен");
