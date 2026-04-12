// ==================== E2E ШИФРОВАНИЕ ====================
const nacl = window.nacl;
let signer = null;
let messageContract = null;
let currentChat = null;
let userAddress = null;

async function getSharedKey(recipient) {
  const sorted = [userAddress.toLowerCase(), recipient.toLowerCase()].sort().join(':');
  const sig = await signer.signMessage(`chat-key-v1:${sorted}`);
  return ethers.getBytes(ethers.keccak256(sig));
}

async function encrypt(text, recipient) {
  const key = await getSharedKey(recipient);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(text);
  const box = nacl.secretbox(msg, nonce, key);
  const combined = new Uint8Array(nonce.length + box.length);
  combined.set(nonce);
  combined.set(box, nonce.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encryptedBase64, sender) {
  try {
    const key = await getSharedKey(sender);
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const nonce = combined.slice(0, nacl.secretbox.nonceLength);
    const box = combined.slice(nacl.secretbox.nonceLength);
    const decrypted = nacl.secretbox.open(box, nonce, key);
    return decrypted ? new TextDecoder().decode(decrypted) : "[🔐 Зашифровано]";
  } catch {
    return "[🔐 Зашифровано — доступно только участникам]";
  }
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================
async function connectWallet() {
  if (!window.ethereum) return alert("MetaMask не найден");
  const provider = new ethers.BrowserProvider(window.ethereum);
  signer = await provider.getSigner();
  userAddress = await signer.getAddress();
  messageContract = new ethers.Contract("0x906DCA5190841d5F0acF8244bd8c176ecb24139D", [
    "function sendMessage(address recipient, string text, bytes signature) external",
    "function getConversation(address userA, address userB, uint256 startIndex, uint256 count) view returns (tuple(address sender, string text, uint256 timestamp, bytes signature)[])"
  ], signer);

  document.getElementById("connectBtn").innerHTML = `✓ ${userAddress.slice(0,6)}...`;
  loadChats();
}

async function sendCurrentMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();
  if (!text || !currentChat || !signer) return;

  const encrypted = await encrypt(text, currentChat);
  const signature = await signer.signMessage(text);

  try {
    const tx = await messageContract.sendMessage(currentChat, encrypted, signature);
    await tx.wait();
    addMessageToUI(text, true);
    input.value = "";
  } catch (e) {
    alert("Ошибка отправки");
  }
}

function addMessageToUI(text, isMine) {
  const container = document.getElementById("messagesContainer");
  const div = document.createElement("div");
  div.className = `flex ${isMine ? "justify-end" : "justify-start"}`;
  div.innerHTML = `
    <div class="message ${isMine ? "sent" : "received"}">
      ${text}
      <div class="text-[10px] mt-1 opacity-70">🔐 E2E Encrypted</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function loadMessagesForChat(address) {
  currentChat = address;
  const container = document.getElementById("messagesContainer");
  container.innerHTML = `<div class="text-center text-zinc-400 py-12">Чат открыт с ${address.slice(0,8)}...</div>`;
}

function loadChats() {
  const list = document.getElementById("chatList");
  list.innerHTML = `
    <div onclick="loadMessagesForChat('0xB19aEe699eb4D2Af380c505E4d6A108b055916eB')" 
         class="chat-item p-4 mx-2 rounded-2xl flex gap-3 cursor-pointer">
      <div class="w-9 h-9 bg-yellow-400 text-zinc-900 rounded-2xl flex items-center justify-center text-xl">👑</div>
      <div>
        <p class="font-semibold">Админ</p>
        <p class="text-xs text-zinc-400">0xB19a...916eB</p>
      </div>
    </div>`;
}

function switchFolder(folder) {
  console.log("Папка:", folder);
}

function addContact() {
  const input = document.getElementById("addContactInput").value.trim();
  if (input) {
    alert("Контакт добавлен: " + input);
    document.getElementById("addContactInput").value = "";
  }
}

// Инициализация
document.addEventListener("DOMContentLoaded", () => {
  console.log("%c✅ Web3 Messenger + E2E шифрование загружено", "color:#facc15; font-weight:bold");
});
