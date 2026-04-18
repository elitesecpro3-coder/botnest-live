// Embeddable BotNest Widget
(function () {
  console.log('[Widget] Loaded');

  window.onerror = function (message, source, lineno, colno, error) {
    console.error('[Widget ERROR]', {
      message,
      source,
      lineno,
      colno,
      error,
    });
    return false;
  };

  window.onunhandledrejection = function (event) {
    console.error('[Widget PROMISE ERROR]', event.reason);
  };

  const BOTNEST_WIDGET_ID = 'botnest-widget';
  const BOTNEST_SESSION_KEY = 'botnest_session_id';
  const RAILWAY_APP = 'botnest-live-production';
  const DEFAULT_API_URL = `https://${RAILWAY_APP}.up.railway.app`;

  type WidgetConfig = {
    botId: string;
    apiUrl: string;
    businessName?: string;
    welcomeMessage?: string;
    bookingLink?: string;
    fallbackContact?: string;
    buttonText?: string;
    services?: string[];
  };

  type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
  };

  type LeadCaptureState = {
    active: boolean;
    step: 'name' | 'phone' | 'email' | 'done';
    name?: string;
    phone?: string;
    email?: string;
  };

  const leadStates: Record<string, LeadCaptureState> = {};

  function getSessionId() {
    let id = localStorage.getItem(BOTNEST_SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now();
      localStorage.setItem(BOTNEST_SESSION_KEY, id);
    }
    return id;
  }

  function createWidget(config: WidgetConfig) {
    console.log('[Widget] Creating widget', {
      botId: config.botId,
      apiUrl: config.apiUrl,
      hasWelcomeMessage: Boolean(config.welcomeMessage),
      hasBookingLink: Boolean(config.bookingLink),
    });

    if (document.getElementById(BOTNEST_WIDGET_ID)) {
      console.log('[Widget] Existing widget found, skipping create');
      return;
    }

    const sessionId = getSessionId();
    if (!leadStates[sessionId]) {
      leadStates[sessionId] = {
        active: false,
        step: 'name'
      };
    }

    const launcher = document.createElement('button');
    launcher.textContent = config.buttonText || 'Chat with us';
    launcher.style.position = 'fixed';
    launcher.style.bottom = '24px';
    launcher.style.right = '24px';
    launcher.style.padding = '12px 16px';
    launcher.style.border = 'none';
    launcher.style.borderRadius = '999px';
    launcher.style.background = '#1f2937';
    launcher.style.color = '#ffffff';
    launcher.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    launcher.style.fontSize = '14px';
    launcher.style.cursor = 'pointer';
    launcher.style.boxShadow = '0 10px 24px rgba(31,41,55,0.25)';
    launcher.style.zIndex = '9999';
    launcher.onmouseenter = function () {
      launcher.style.transform = 'translateY(-1px)';
    };
    launcher.onmouseleave = function () {
      launcher.style.transform = 'translateY(0)';
    };
    launcher.onclick = openChat;
    document.body.appendChild(launcher);

    function openChat() {
      console.log('[Widget] openChat called');
      let chat = document.getElementById(BOTNEST_WIDGET_ID);
      if (chat) {
        console.log('[Widget] Chat already open');
        return;
      }

      chat = document.createElement('div');
      chat.id = BOTNEST_WIDGET_ID;
      chat.style.position = 'fixed';
      chat.style.bottom = '74px';
      chat.style.right = '24px';
      chat.style.width = '360px';
      chat.style.maxWidth = 'calc(100vw - 24px)';
      chat.style.height = '520px';
      chat.style.maxHeight = 'calc(100vh - 100px)';
      chat.style.display = 'flex';
      chat.style.flexDirection = 'column';
      chat.style.background = '#ffffff';
      chat.style.border = '1px solid #e5e7eb';
      chat.style.borderRadius = '16px';
      chat.style.boxShadow = '0 20px 45px rgba(15, 23, 42, 0.18)';
      chat.style.overflow = 'hidden';
      chat.style.zIndex = '10000';
      chat.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';

      console.log('[Widget] Building chat container HTML');
      console.log('[Widget] Creating input field');

      chat.innerHTML = `
        <div style="padding:14px 14px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:14px;font-weight:700;color:#111827;">${config.businessName || 'Chat Assistant'}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">${isDemoBot(config.botId) ? 'Live BotNest demo for business owners' : 'Typically replies in under a minute'}</div>
        </div>
        <div id="botnest-messages" style="flex:1;overflow-y:auto;padding:14px 14px 10px;background:#ffffff;scroll-behavior:smooth;"></div>
        <div id="botnest-quick" style="padding:0 14px 8px;"></div>
        <div id="botnest-cta" style="padding:0 14px 10px;"></div>
        <form id="botnest-form" style="display:flex;gap:8px;padding:0 14px 14px;">
          <input id="botnest-input" style="flex:1;padding:10px 12px;border:1px solid #d1d5db;border-radius:10px;font-size:14px;outline:none;" placeholder="Type your message..." />
          <button id="botnest-send" type="submit" style="padding:10px 14px;border:none;border-radius:10px;background:#111827;color:#fff;font-size:13px;cursor:pointer;transition:opacity 120ms ease;">Send</button>
        </form>
      `;

      document.body.appendChild(chat);
      console.log('[Widget] Chat container appended');

      const messagesDiv = chat.querySelector('#botnest-messages') as HTMLDivElement;
      const quickDiv = chat.querySelector('#botnest-quick') as HTMLDivElement;
      const ctaDiv = chat.querySelector('#botnest-cta') as HTMLDivElement;
      const form = chat.querySelector('#botnest-form') as HTMLFormElement;
      const input = chat.querySelector('#botnest-input') as HTMLInputElement;
      const sendButton = chat.querySelector('#botnest-send') as HTMLButtonElement;
      console.log('[Widget] Input field created', {
        hasMessagesDiv: Boolean(messagesDiv),
        hasQuickDiv: Boolean(quickDiv),
        hasCtaDiv: Boolean(ctaDiv),
        hasForm: Boolean(form),
        hasInput: Boolean(input),
        hasSendButton: Boolean(sendButton),
      });
      const history: ChatMessage[] = [];
      let assistantQueue = Promise.resolve();

      void runOpeningSequence();
      renderBookingButton();

      sendButton.onmouseenter = function () {
        sendButton.style.opacity = '0.9';
      };
      sendButton.onmouseleave = function () {
        sendButton.style.opacity = '1';
      };

      form.onsubmit = async function (e) {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        quickDiv.innerHTML = '';
        await handleUserInput(text);
        if (!leadStates[sessionId].active) {
          renderQuickReplies();
        }
      };

      function renderQuickReplies() {
        quickDiv.innerHTML = '';
        const quickRow = document.createElement('div');
        quickRow.style.display = 'flex';
        quickRow.style.gap = '8px';
        quickRow.style.flexWrap = 'wrap';

        const quickReplies = ['Book Appointment', 'View Services', 'Ask a Question'];
        quickReplies.forEach((label) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.style.padding = '7px 10px';
          button.style.border = '1px solid #d1d5db';
          button.style.borderRadius = '999px';
          button.style.background = '#ffffff';
          button.style.color = '#374151';
          button.style.fontSize = '12px';
          button.style.cursor = 'pointer';
          button.onmouseenter = function () {
            button.style.background = '#f9fafb';
            button.style.borderColor = '#9ca3af';
          };
          button.onmouseleave = function () {
            button.style.background = '#ffffff';
            button.style.borderColor = '#d1d5db';
          };
          button.onclick = function () {
            if (label === 'Book Appointment') {
              quickDiv.innerHTML = '';
              startLeadCapture();
              return;
            }

            if (label === 'Ask a Question') {
              void addAssistantMessage('Great. Ask me anything and I will keep it short and helpful.');
              input.focus();
              return;
            }

            if (label === 'View Services') {
              quickDiv.innerHTML = '';
              showServices();
              return;
            }

            quickDiv.innerHTML = '';
            handleUserInput(label);
          };
          quickRow.appendChild(button);
        });

        quickDiv.appendChild(quickRow);
      }

      function renderBookingButton() {
        if (!config.bookingLink) return;
        ctaDiv.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '2px';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Book Now';
        button.style.width = '100%';
        button.style.padding = '11px 12px';
        button.style.border = 'none';
        button.style.borderRadius = '10px';
        button.style.background = '#0f766e';
        button.style.color = '#ffffff';
        button.style.fontSize = '13px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 8px 20px rgba(15,118,110,0.25)';
        button.onmouseenter = function () {
          button.style.background = '#0d9488';
          button.style.transform = 'translateY(-1px)';
        };
        button.onmouseleave = function () {
          button.style.background = '#0f766e';
          button.style.transform = 'translateY(0)';
        };
        button.onclick = function () {
          window.open(config.bookingLink, '_blank', 'noopener,noreferrer');
        };

        wrapper.appendChild(button);
        ctaDiv.appendChild(wrapper);
      }

      function buildOpeningMessage(baseMessage?: string): string {
        const intro = baseMessage && baseMessage.trim()
          ? baseMessage.trim()
          : 'Hi! I can help you get booked quickly or answer any questions.';

        return `${intro}\n\nWhat would you like to do?\n1. Book an appointment\n2. View services\n3. Ask a question`;
      }

      function isDemoBot(botId: string): boolean {
        return botId === 'test-bot';
      }

      function buildDemoIntroMessage(): string {
        return 'Welcome. This is a live BotNest demo assistant showing how your business can engage visitors 24/7, capture leads, and convert more bookings automatically.';
      }

      async function runOpeningSequence() {
        if (isDemoBot(config.botId)) {
          await addAssistantMessage(buildDemoIntroMessage());
        }

        await addAssistantMessage(buildOpeningMessage(config.welcomeMessage));
        renderQuickReplies();
      }

      function showServices() {
        const serviceList = Array.isArray(config.services) && config.services.length > 0
          ? config.services.slice(0, 6)
          : ['Consultation', 'Core service package', 'Premium service package'];

        const formatted = serviceList.map((service, index) => `${index + 1}. ${service}`).join('\n');
        void addAssistantMessage(`Here are our most requested services:\n${formatted}`);
        void addAssistantMessage('Want to book one of these? I can get you started in under a minute.');
        void addAssistantMessage('Want to book an appointment or have another question?');
        renderQuickReplies();
      }

      function looksLikeBookingIntent(text: string): boolean {
        const normalized = text.toLowerCase();
        return (
          normalized.includes('book')
          || normalized.includes('appointment')
          || normalized.includes('schedule')
          || normalized.includes('available')
          || normalized.includes('call me')
        );
      }

      function startLeadCapture() {
        const lead = leadStates[sessionId];
        lead.active = true;
        lead.step = 'name';
        void addAssistantMessage('Sure. What is your name?');
      }

      function isSkipEmail(value: string): boolean {
        const normalized = value.toLowerCase();
        return normalized === 'skip' || normalized === 'no' || normalized === 'none';
      }

      function isValidPhone(value: string): boolean {
        const digits = value.replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15;
      }

      function isValidEmail(value: string): boolean {
        const normalized = value.trim();
        return normalized.includes('@') && normalized.includes('.');
      }

      async function handleUserInput(text: string) {
        if (!leadStates[sessionId].active && looksLikeBookingIntent(text)) {
          addMessage('user', text);
          startLeadCapture();
          return;
        }

        if (leadStates[sessionId].active) {
          processLeadStep(text);
          return;
        }

        await sendChatToApi(text);
      }

      function processLeadStep(text: string) {
        const lead = leadStates[sessionId];
        addMessage('user', text);

        if (lead.step === 'name') {
          if (text.trim().length < 2) {
            void addAssistantMessage('Could you share your name so I can save your request?');
            return;
          }
          lead.name = text;
          lead.step = 'phone';
          void addAssistantMessage(`Great, ${lead.name}. What is the best number to reach you?`);
          return;
        }

        if (lead.step === 'phone') {
          if (!isValidPhone(text)) {
            void addAssistantMessage('That doesn’t look like a valid phone number. Could you try again?');
            return;
          }
          lead.phone = text;
          lead.step = 'email';
          void addAssistantMessage('Perfect. If you want, share your email too, or type "skip".');
          return;
        }

        if (lead.step === 'email') {
          if (!isSkipEmail(text) && !isValidEmail(text)) {
            void addAssistantMessage('That email doesn’t look right. Want to try again or type \"skip\"?');
            return;
          }

          if (!isSkipEmail(text)) {
            lead.email = text;
          }
          lead.step = 'done';
          lead.active = false;

          const businessName = config.businessName || 'our team';
          void addAssistantMessage(`Got it, ${lead.name || 'there'}. We will take great care of you.`);

          let confirmation = `Perfect. You are all set. Someone from ${businessName} will reach out shortly.`;
          if (config.fallbackContact) {
            confirmation += ` You can also ${config.fallbackContact}.`;
          }
          void addAssistantMessage(confirmation);

          if (config.bookingLink) {
            void addAssistantMessage('If you want to lock in your spot now, tap Book Now. It is the fastest way.');
            renderBookingButton();
          }

          void addAssistantMessage('Want to book an appointment or have another question?');
          renderQuickReplies();
        }
      }

      async function sendChatToApi(text: string) {
        addMessage('user', text);
        try {
          const res = await fetch(config.apiUrl + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botId: config.botId,
              messages: history,
              sessionId: getSessionId()
            })
          });

          if (!res.ok) {
            await addAssistantMessage('Sorry, I could not process that. Please try again in a moment.');
            return;
          }

          const data = await res.json();
          await addAssistantMessage(data.reply || 'Sorry, I could not generate a response.');
          await addAssistantMessage('Want to book an appointment or have another question?');
          renderQuickReplies();
        } catch (_err) {
          await addAssistantMessage('Sorry, I cannot connect right now. Please try again soon.');
        }
      }

      function addAssistantMessage(text: string): Promise<void> {
        assistantQueue = assistantQueue.then(async () => {
          const typingRow = document.createElement('div');
          typingRow.style.display = 'flex';
          typingRow.style.justifyContent = 'flex-start';
          typingRow.style.marginBottom = '12px';

          const typingBubble = document.createElement('div');
          typingBubble.textContent = 'typing...';
          typingBubble.style.maxWidth = '82%';
          typingBubble.style.padding = '8px 11px';
          typingBubble.style.borderRadius = '12px';
          typingBubble.style.borderBottomLeftRadius = '4px';
          typingBubble.style.background = '#f3f4f6';
          typingBubble.style.color = '#6b7280';
          typingBubble.style.fontSize = '12px';

          typingRow.appendChild(typingBubble);
          messagesDiv.appendChild(typingRow);
          messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });

          const delay = 300 + Math.floor(Math.random() * 500);
          await new Promise((resolve) => setTimeout(resolve, delay));

          typingRow.remove();
          addMessage('assistant', text);
        });

        return assistantQueue;
      }

      function addMessage(role: ChatMessage['role'], text: string) {
        console.log('[Widget] Rendering message', {
          role,
          textLength: text.length,
        });
        history.push({ role, content: text });
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = role === 'user' ? 'flex-end' : 'flex-start';
        row.style.marginBottom = '12px';

        const bubble = document.createElement('div');
        bubble.textContent = text;
        bubble.style.maxWidth = '82%';
        bubble.style.padding = '10px 12px';
        bubble.style.borderRadius = '12px';
        bubble.style.fontSize = '13px';
        bubble.style.lineHeight = '1.45';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.style.wordBreak = 'break-word';

        if (role === 'user') {
          bubble.style.background = '#111827';
          bubble.style.color = '#ffffff';
          bubble.style.borderBottomRightRadius = '4px';
        } else {
          bubble.style.background = '#f3f4f6';
          bubble.style.color = '#111827';
          bubble.style.borderBottomLeftRadius = '4px';
        }

        row.appendChild(bubble);
        messagesDiv.appendChild(row);
        messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });
      }
    }
  }

  // Auto-init from script tag
  function initFromScriptTag() {
    console.log('[Widget] Init started');
    const script = (document.currentScript as HTMLScriptElement | null)
      || (document.querySelector('script[data-bot-id]') as HTMLScriptElement | null);
    if (!script) {
      console.error('[Widget] No script tag with data-bot-id found');
      return;
    }

    console.log('[Widget] Script tag detected', {
      src: script.getAttribute('src'),
      dataBotId: script.getAttribute('data-bot-id'),
      dataApiUrl: script.getAttribute('data-api-url'),
    });

    const botId = script.getAttribute('data-bot-id');
    const scriptApiUrl = script.getAttribute('data-api-url');
    const apiUrl = (scriptApiUrl || DEFAULT_API_URL).replace('BOTNEST_RAILWAY_APP', RAILWAY_APP);

    console.log('[Widget] Script config values', {
      botId,
      scriptApiUrl,
      resolvedApiUrl: apiUrl,
    });

    if (!botId) {
      console.error('[Widget] Missing data-bot-id, creating fallback widget');
      createWidget({
        botId: 'unknown',
        apiUrl,
        businessName: 'BotNest Assistant',
        welcomeMessage: 'Widget configuration is missing data-bot-id.'
      });
      return;
    }

    console.log('[Widget] Fetching config', apiUrl + '/api/config/' + botId);
    fetch(apiUrl + '/api/config/' + botId)
      .then((r) => {
        console.log('[Widget] Config response status', r.status);
        if (!r.ok) throw new Error('Config fetch failed');
        return r.json();
      })
      .then((config) => {
        console.log('[Widget] Config payload', config);
        createWidget({ ...config, botId, apiUrl });
      })
      .catch((err) => {
        console.error('[Widget] Config fetch error', err);
        createWidget({
          botId,
          apiUrl,
          businessName: 'BotNest Assistant',
          welcomeMessage: 'Hi! I can help you get booked quickly or answer any questions.'
        });
      });
  }

  initFromScriptTag();
})();
