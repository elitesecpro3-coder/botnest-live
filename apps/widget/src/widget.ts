// Embeddable BotNest Widget
(function () {
  const BOTNEST_WIDGET_ID = 'botnest-widget';
  const BOTNEST_SESSION_KEY = 'botnest_session_id';
  function getSessionId() {
    let id = localStorage.getItem(BOTNEST_SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(BOTNEST_SESSION_KEY, id);
    }
    return id;
  }
  function createWidget(config) {
    if (document.getElementById(BOTNEST_WIDGET_ID)) return;
    const btn = document.createElement('button');
    btn.textContent = config.buttonText || 'Chat with us';
    btn.style.position = 'fixed';
    btn.style.bottom = '24px';
    btn.style.right = '24px';
    btn.style.zIndex = '9999';
    btn.onclick = openChat;
    document.body.appendChild(btn);
    function openChat() {
      let chat = document.getElementById(BOTNEST_WIDGET_ID);
      if (chat) return;
      chat = document.createElement('div');
      chat.id = BOTNEST_WIDGET_ID;
      chat.style.position = 'fixed';
      chat.style.bottom = '64px';
      chat.style.right = '24px';
      chat.style.width = '320px';
      chat.style.height = '400px';
      chat.style.background = '#fff';
      chat.style.border = '1px solid #ccc';
      chat.style.borderRadius = '8px';
      chat.style.boxShadow = '0 2px 16px rgba(0,0,0,0.15)';
      chat.style.zIndex = '10000';
      chat.innerHTML = `<div style='padding:8px;font-weight:bold;'>${config.title || 'Chatbot'}</div><div id='botnest-messages' style='height:320px;overflow:auto;padding:8px;'></div><form id='botnest-form' style='display:flex;padding:8px 0 0 0;'><input id='botnest-input' style='flex:1;padding:4px;' placeholder='Type a message...'/><button>Send</button></form>`;
      document.body.appendChild(chat);
      const messagesDiv = chat.querySelector("#botnest-messages") as HTMLDivElement;
      const form = chat.querySelector('#botnest-form');
      form.onsubmit = async function (e) {
        e.preventDefault();
        const input = chat.querySelector('#botnest-input') as HTMLInputElement;
        const text = input.value.trim();
        if (!text) return;
        addMessage('user', text);
        input.value = '';
        const res = await fetch(config.apiUrl + '/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botId: config.botId, messages: [{ role: 'user', content: text }], sessionId: getSessionId() })
        });
        const data = await res.json();
        addMessage('bot', data.reply);
      };
      function addMessage(role: string, text: string) {
        const msg = document.createElement("div");
        msg.textContent = (role === "user" ? "You: " : "Bot: ") + text;
        msg.style.margin = "6px 0";
        messagesDiv.appendChild(msg);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
      }
    }
  }
  // Auto-init from script tag
  function initFromScriptTag() {
    const script = document.currentScript || document.querySelector('script[data-botnest]');
    if (!script) return;
    const botId = script.getAttribute('data-bot-id');
    const apiUrl = script.getAttribute('data-api-url') || window.location.origin;
    fetch(apiUrl + '/api/config/' + botId)
      .then(r => r.json())
      .then(({ config }) => createWidget({ ...config, botId, apiUrl }))
      .catch(() => createWidget({ botId, apiUrl }));
  }
  initFromScriptTag();
})();
