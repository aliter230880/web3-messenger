// Web3 Messenger - Main Application Logic
// (c) Dima's Web3 Project

console.log('🚀 Web3 Messenger loaded');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ App initialized');
  
  // Add event listeners
  setupEventListeners();
});

function setupEventListeners() {
  // Send button
  const sendBtn = document.querySelector('.send-btn');
  const msgInput = document.querySelector('.input-container input');
  
  if (sendBtn && msgInput) {
    sendBtn.addEventListener('click', sendMessage);
    msgInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  }
  
  // Chat items
  const chatItems = document.querySelectorAll('.chat-item');
  chatItems.forEach(item => {
    item.addEventListener('click', function() {
      // Remove active from all
      chatItems.forEach(i => i.classList.remove('active'));
      // Add active to clicked
      this.classList.add('active');
    });
  });
}

function sendMessage() {
  const input = document.querySelector('.input-container input');
  const text = input.value.trim();
  
  if (!text) return;
  
  console.log('📤 Sending message:', text);
  
  // TODO: Web3 integration later
  // - Encrypt message
  // - Send via XMTP
  // - Save hash to blockchain
  
  input.value = '';
  alert('Message sent! (Web3 integration coming soon)');
}
