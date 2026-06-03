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

  const UI_EN = {
    launcherText: 'Chat with BotNest AI',
    headerSubtitle: 'Online now · replies instantly',
    inputPlaceholder: 'Type a message...',
    sendButton: 'Send',
    bookAppointment: 'Book a Demo',
    viewServices: 'View Services',
    askQuestion: 'Ask Anything',
    bookNow: 'Book Free Demo →',
    typingIndicator: 'typing...',
    openingPrompt: 'What would you like to do?',
    servicesIntro: "Here's what BotNest offers:",
    servicesFollowUp: 'Which would you like to know more about?',
    servicesEnd: 'Ready to see it in action? Tap Book Free Demo below.',
    postReplyPrompt: 'Anything else? Or tap the button below to get started.',
    industryQuestion: "Quick question — what type of business are you looking to automate?",
    industryDental: '🦷 Dental / Med Spa',
    industryLegal: '⚖️ Law / Finance',
    industryRealEstate: '🏠 Real Estate',
    industryOther: '🏪 Service / Other',
    bookLeadStart: "Let's get you set up! First, what's your name?",
    leadStartName: 'What\'s your name?',
    leadNameRetry: 'Could you share your name so I can save your details?',
    leadPhonePrompt: (name: string) => `Perfect, ${name}. What's the best number to reach you?`,
    leadPhoneInvalid: "That doesn't look like a valid number — could you try again?",
    leadEmailPrompt: 'Last step — share your email, or type "skip" to continue.',
    leadEmailInvalid: 'That email doesn\'t look right. Try again or type "skip".',
    leadSaveSuccess: "You're all set! ✓ We'll be in touch shortly.\n\nTap the button below to choose your demo time.",
    leadSaveError: 'Something went wrong saving your info. You can still book directly below.',
    leadBookCta: 'Tap the button below to choose a time that works for you.',
    chatError: 'Sorry, I could not process that. Please try again in a moment.',
    chatNoReply: 'Sorry, I could not generate a response.',
    chatConnectError: 'Sorry, I cannot connect right now. Please try again soon.',
    leadNameRequired: 'Please provide your name and phone number.',
    leadPhoneRequired: 'Please enter a valid phone number.',
    defaultWelcome: "Hi! I'm BotNest's AI assistant — I capture leads, answer questions, and book appointments automatically, 24/7.",
    askQuestionPrompt: 'Sure — what would you like to know?',
  };

  const UI_VI = {
    launcherText: 'Chat với BotNest AI',
    headerSubtitle: 'Đang trực tuyến · phản hồi ngay',
    inputPlaceholder: 'Nhập tin nhắn...',
    sendButton: 'Gửi',
    bookAppointment: 'Đặt lịch demo',
    viewServices: 'Xem dịch vụ',
    askQuestion: 'Hỏi bất cứ điều gì',
    bookNow: 'Đặt lịch demo miễn phí →',
    typingIndicator: 'đang nhập...',
    openingPrompt: 'Bạn muốn làm gì?',
    servicesIntro: 'Đây là các dịch vụ của BotNest:',
    servicesFollowUp: 'Bạn muốn tìm hiểu thêm về dịch vụ nào?',
    servicesEnd: 'Muốn xem thực tế? Nhấn nút Đặt lịch demo bên dưới.',
    postReplyPrompt: 'Còn gì khác không? Hoặc nhấn nút bên dưới để bắt đầu.',
    industryQuestion: 'Bạn đang kinh doanh trong lĩnh vực nào?',
    industryDental: '🦷 Nha khoa / Spa',
    industryLegal: '⚖️ Luật / Tài chính',
    industryRealEstate: '🏠 Bất động sản',
    industryOther: '🏪 Dịch vụ khác',
    bookLeadStart: 'Để bắt đầu, cho mình xin tên của bạn nhé?',
    leadStartName: 'Tên của bạn là gì?',
    leadNameRetry: 'Bạn có thể cho mình biết tên để lưu thông tin không?',
    leadPhonePrompt: (name: string) => `Tuyệt, ${name}. Số điện thoại tốt nhất để liên hệ là gì?`,
    leadPhoneInvalid: 'Số điện thoại này có vẻ chưa đúng. Bạn có thể thử lại không?',
    leadEmailPrompt: 'Cuối cùng — bạn có thể để lại email, hoặc nhập "bỏ qua".',
    leadEmailInvalid: 'Email này có vẻ chưa đúng. Bạn muốn nhập lại hay gõ "bỏ qua"?',
    leadSaveSuccess: 'Xong! ✓ Chúng mình sẽ liên hệ bạn sớm.\n\nNhấn nút bên dưới để chọn thời gian demo.',
    leadSaveError: 'Có lỗi khi lưu thông tin. Bạn vẫn có thể đặt lịch ngay bên dưới.',
    leadBookCta: 'Nhấn nút bên dưới để chọn thời gian phù hợp.',
    chatError: 'Xin lỗi, hiện tại mình chưa xử lý được. Vui lòng thử lại sau ít phút.',
    chatNoReply: 'Xin lỗi, mình không thể tạo phản hồi.',
    chatConnectError: 'Xin lỗi, hiện tại mình không thể kết nối. Vui lòng thử lại sau.',
    leadNameRequired: 'Vui lòng cung cấp tên và số điện thoại của bạn.',
    leadPhoneRequired: 'Vui lòng nhập số điện thoại hợp lệ.',
    defaultWelcome: 'Xin chào! Mình là trợ lý AI của BotNest — tự động thu thập khách hàng và đặt lịch 24/7.',
    askQuestionPrompt: 'Bạn muốn hỏi gì? Mình sẵn sàng giúp.',
  };

  type WidgetConfig = {
    botId: string;
    apiUrl: string;
    businessName?: string;
    welcomeMessage?: string;
    bookingLink?: string;
    fallbackContact?: string;
    buttonText?: string;
    services?: string[];
    language?: string;
  };

  type ChatMessage = {
    role: 'user' | 'assistant';
    content: string;
  };

  type LeadCaptureState = {
    active: boolean;
    captured: boolean;
    step: 'industry' | 'name' | 'phone' | 'email' | 'done';
    industry?: string;
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

  function injectWidgetStyles() {
    if (document.getElementById('botnest-widget-styles')) return;
    const style = document.createElement('style');
    style.id = 'botnest-widget-styles';
    style.textContent = `
      @keyframes bn-dot-pulse {
        0%, 60%, 100% { transform: translateY(0); opacity: 0.35; }
        30% { transform: translateY(-5px); opacity: 1; }
      }
      .bn-dot {
        width: 7px; height: 7px; border-radius: 50%; background: #9ca3af;
        display: inline-block;
        animation: bn-dot-pulse 1.3s ease-in-out infinite;
      }
      .bn-dot:nth-child(2) { animation-delay: 0.18s; }
      .bn-dot:nth-child(3) { animation-delay: 0.36s; }
      #botnest-messages::-webkit-scrollbar { width: 4px; }
      #botnest-messages::-webkit-scrollbar-track { background: transparent; }
      #botnest-messages::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 4px; }
      #botnest-close:hover { background: rgba(255,255,255,0.2) !important; }
      #botnest-input:focus { border-color: #6b7280 !important; background: #ffffff !important; }
      @keyframes bn-bubble-in {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .bn-bubble { animation: bn-bubble-in 180ms ease forwards; }
      .bn-quick-btn:active { transform: scale(0.94) !important; transition: transform 70ms ease !important; }
    `;
    document.head.appendChild(style);
  }

  function createWidget(config: WidgetConfig) {
    const ui = config.language === 'vi' ? UI_VI : UI_EN;

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

    injectWidgetStyles();

    const sessionId = getSessionId();
    if (!leadStates[sessionId]) {
      leadStates[sessionId] = {
        active: false,
        captured: false,
        step: 'name',
      };
    }

    const launcher = document.createElement('button');
    launcher.textContent = config.buttonText || ui.launcherText;
    launcher.style.position = 'fixed';
    launcher.style.bottom = '24px';
    launcher.style.right = '24px';
    launcher.style.padding = '12px 20px';
    launcher.style.border = 'none';
    launcher.style.borderRadius = '999px';
    launcher.style.background = '#111827';
    launcher.style.color = '#ffffff';
    launcher.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
    launcher.style.fontSize = '14px';
    launcher.style.fontWeight = '600';
    launcher.style.cursor = 'pointer';
    launcher.style.boxShadow = '0 10px 28px rgba(15,23,42,0.30)';
    launcher.style.zIndex = '9999';
    launcher.style.transition = 'transform 150ms ease, box-shadow 150ms ease';
    launcher.onmouseenter = function () {
      launcher.style.transform = 'translateY(-2px)';
      launcher.style.boxShadow = '0 14px 34px rgba(15,23,42,0.36)';
    };
    launcher.onmouseleave = function () {
      launcher.style.transform = 'translateY(0)';
      launcher.style.boxShadow = '0 10px 28px rgba(15,23,42,0.30)';
    };
    let isChatOpen = false;

    launcher.onclick = toggleChat;
    document.body.appendChild(launcher);

    function closeChat() {
      const chat = document.getElementById(BOTNEST_WIDGET_ID);
      if (chat) {
        chat.style.transform = 'translateY(14px)';
        chat.style.opacity = '0';
        setTimeout(function () {
          const el = document.getElementById(BOTNEST_WIDGET_ID);
          if (el) el.remove();
        }, 200);
        console.log('[Widget] Chat closed');
      }
      isChatOpen = false;
    }

    function toggleChat() {
      if (isChatOpen) {
        closeChat();
      } else {
        openChat();
      }
    }

    function openChat() {
      console.log('[Widget] openChat called');
      let chat = document.getElementById(BOTNEST_WIDGET_ID);
      if (chat) {
        console.log('[Widget] Chat already open');
        return;
      }
      isChatOpen = true;

      chat = document.createElement('div');
      chat.id = BOTNEST_WIDGET_ID;
      chat.style.position = 'fixed';
      chat.style.bottom = '74px';
      chat.style.right = '24px';
      chat.style.width = '360px';
      chat.style.maxWidth = 'calc(100vw - 16px)';
      chat.style.height = '540px';
      chat.style.maxHeight = 'calc(100vh - 100px)';
      chat.style.display = 'flex';
      chat.style.flexDirection = 'column';
      chat.style.background = '#ffffff';
      chat.style.border = '1px solid rgba(0,0,0,0.07)';
      chat.style.borderRadius = '18px';
      chat.style.boxShadow = '0 24px 64px rgba(15,23,42,0.22), 0 4px 18px rgba(15,23,42,0.07)';
      chat.style.overflow = 'hidden';
      chat.style.zIndex = '10000';
      chat.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif';
      // Entrance animation starting state
      chat.style.transform = 'translateY(18px)';
      chat.style.opacity = '0';
      chat.style.transition = 'transform 240ms cubic-bezier(0.16,1,0.3,1), opacity 190ms ease';

      const displayName = config.businessName || 'BotNest AI';

      console.log('[Widget] Building chat container HTML');

      chat.innerHTML = `
        <div style="padding:14px 16px 13px;background:linear-gradient(135deg,#0f172a 0%,#1e3752 100%);flex-shrink:0;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;border:1.5px solid rgba(255,255,255,0.14);">🤖</div>
              <div>
                <div style="font-size:14px;font-weight:700;color:#ffffff;line-height:1.25;">${displayName}</div>
                <div style="font-size:11px;color:rgba(255,255,255,0.62);margin-top:3px;display:flex;align-items:center;gap:5px;">
                  <span style="width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block;flex-shrink:0;box-shadow:0 0 6px rgba(74,222,128,0.55);"></span>
                  ${ui.headerSubtitle}
                </div>
              </div>
            </div>
            <button id="botnest-close" type="button" style="background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.14);color:rgba(255,255,255,0.75);width:30px;height:30px;border-radius:50%;font-size:18px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:background 120ms ease;flex-shrink:0;">×</button>
          </div>
        </div>
        <div id="botnest-messages" style="flex:1;overflow-y:auto;padding:16px 14px 8px;background:#ffffff;scroll-behavior:smooth;"></div>
        <div id="botnest-quick" style="padding:0 14px 8px;"></div>
        <div id="botnest-cta" style="padding:0 14px 10px;"></div>
        <form id="botnest-form" style="display:flex;gap:8px;padding:0 14px 14px;flex-shrink:0;">
          <input id="botnest-input" style="flex:1;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;outline:none;background:#f9fafb;transition:border-color 120ms ease,background 120ms ease;" placeholder="${ui.inputPlaceholder}" />
          <button id="botnest-send" type="submit" style="padding:10px 16px;border:none;border-radius:12px;background:#111827;color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:opacity 120ms ease,transform 120ms ease;flex-shrink:0;">${ui.sendButton}</button>
        </form>
      `;

      document.body.appendChild(chat);
      console.log('[Widget] Chat container appended');

      // Trigger entrance animation on next two frames
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          const el = document.getElementById(BOTNEST_WIDGET_ID);
          if (el) {
            el.style.transform = 'translateY(0)';
            el.style.opacity = '1';
          }
        });
      });

      const messagesDiv = chat.querySelector('#botnest-messages') as HTMLDivElement;
      const quickDiv = chat.querySelector('#botnest-quick') as HTMLDivElement;
      const ctaDiv = chat.querySelector('#botnest-cta') as HTMLDivElement;
      const form = chat.querySelector('#botnest-form') as HTMLFormElement;
      const input = chat.querySelector('#botnest-input') as HTMLInputElement;
      const sendButton = chat.querySelector('#botnest-send') as HTMLButtonElement;
      const closeButton = chat.querySelector('#botnest-close') as HTMLButtonElement;

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

      closeButton.onclick = toggleChat;

      void runOpeningSequence();
      renderBookingButton();

      sendButton.onmouseenter = function () {
        sendButton.style.opacity = '0.85';
        sendButton.style.transform = 'translateY(-1px)';
      };
      sendButton.onmouseleave = function () {
        sendButton.style.opacity = '1';
        sendButton.style.transform = 'translateY(0)';
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
        quickRow.style.gap = '7px';
        quickRow.style.flexWrap = 'wrap';

        const quickReplies = [ui.bookAppointment, ui.viewServices, ui.askQuestion];
        quickReplies.forEach(function (label, index) {
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.className = 'bn-quick-btn';
          button.style.padding = '9px 14px';
          button.style.border = '1.5px solid';
          button.style.borderRadius = '999px';
          button.style.fontSize = '12.5px';
          button.style.fontWeight = '500';
          button.style.cursor = 'pointer';
          button.style.transition = 'all 130ms ease';
          button.style.lineHeight = '1.3';

          if (index === 0) {
            // Book button — primary, dark fill
            button.style.background = '#111827';
            button.style.color = '#ffffff';
            button.style.borderColor = '#111827';
            button.onmouseenter = function () {
              button.style.background = '#1f2937';
              button.style.borderColor = '#1f2937';
              button.style.transform = 'translateY(-1px)';
            };
            button.onmouseleave = function () {
              button.style.background = '#111827';
              button.style.borderColor = '#111827';
              button.style.transform = 'translateY(0)';
            };
          } else {
            // Secondary buttons — outlined
            button.style.background = '#ffffff';
            button.style.color = '#374151';
            button.style.borderColor = '#d1d5db';
            button.onmouseenter = function () {
              button.style.background = '#f9fafb';
              button.style.borderColor = '#9ca3af';
              button.style.transform = 'translateY(-1px)';
            };
            button.onmouseleave = function () {
              button.style.background = '#ffffff';
              button.style.borderColor = '#d1d5db';
              button.style.transform = 'translateY(0)';
            };
          }

          button.onclick = function () {
            if (label === ui.bookAppointment) {
              quickDiv.innerHTML = '';
              addMessage('user', label);
              if (leadStates[sessionId].captured) {
                void addAssistantMessage(ui.leadBookCta);
                renderBookingButton();
                return;
              }
              // Lead capture gate before opening calendar
              leadStates[sessionId].active = true;
              leadStates[sessionId].step = 'name';
              void addAssistantMessage(ui.bookLeadStart);
              return;
            }

            if (label === ui.askQuestion) {
              quickDiv.innerHTML = '';
              addMessage('user', label);
              void addAssistantMessage(ui.askQuestionPrompt);
              input.focus();
              return;
            }

            if (label === ui.viewServices) {
              quickDiv.innerHTML = '';
              addMessage('user', label);
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

      function renderIndustryPicker() {
        quickDiv.innerHTML = '';
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gap = '7px';

        const industries = [ui.industryDental, ui.industryLegal, ui.industryRealEstate, ui.industryOther];
        industries.forEach(function (label) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = label;
          btn.className = 'bn-quick-btn';
          btn.style.padding = '10px 8px';
          btn.style.border = '1.5px solid #e5e7eb';
          btn.style.borderRadius = '10px';
          btn.style.background = '#f9fafb';
          btn.style.color = '#374151';
          btn.style.fontSize = '12.5px';
          btn.style.fontWeight = '500';
          btn.style.cursor = 'pointer';
          btn.style.textAlign = 'center';
          btn.style.transition = 'all 120ms ease';
          btn.style.lineHeight = '1.35';
          btn.onmouseenter = function () {
            btn.style.borderColor = '#111827';
            btn.style.background = '#ffffff';
            btn.style.color = '#111827';
          };
          btn.onmouseleave = function () {
            btn.style.borderColor = '#e5e7eb';
            btn.style.background = '#f9fafb';
            btn.style.color = '#374151';
          };
          btn.onclick = function () {
            quickDiv.innerHTML = '';
            const lead = leadStates[sessionId];
            lead.industry = label;
            lead.step = 'name';
            addMessage('user', label);
            void addAssistantMessage(ui.leadStartName);
          };
          grid.appendChild(btn);
        });

        quickDiv.appendChild(grid);
      }

      function renderBookingButton() {
        if (!config.bookingLink) return;
        ctaDiv.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.marginTop = '2px';

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = ui.bookNow;
        button.style.width = '100%';
        button.style.padding = '12px 14px';
        button.style.border = 'none';
        button.style.borderRadius = '12px';
        button.style.background = 'linear-gradient(135deg,#0f766e 0%,#0891b2 100%)';
        button.style.color = '#ffffff';
        button.style.fontSize = '13.5px';
        button.style.fontWeight = '700';
        button.style.cursor = 'pointer';
        button.style.boxShadow = '0 8px 24px rgba(15,118,110,0.32)';
        button.style.letterSpacing = '0.01em';
        button.style.transition = 'transform 150ms ease, box-shadow 150ms ease';
        button.onmouseenter = function () {
          button.style.transform = 'translateY(-2px)';
          button.style.boxShadow = '0 12px 30px rgba(15,118,110,0.40)';
        };
        button.onmouseleave = function () {
          button.style.transform = 'translateY(0)';
          button.style.boxShadow = '0 8px 24px rgba(15,118,110,0.32)';
        };
        button.onclick = function () {
          window.open(config.bookingLink, '_blank', 'noopener,noreferrer');
        };

        wrapper.appendChild(button);
        ctaDiv.appendChild(wrapper);
      }

      async function runOpeningSequence() {
        const intro = (config.welcomeMessage && config.welcomeMessage.trim())
          ? config.welcomeMessage.trim()
          : ui.defaultWelcome;
        await addAssistantMessage(intro);
        await addAssistantMessage(ui.openingPrompt);
        renderQuickReplies();
      }

      function showServices() {
        const hasCustomServices = Array.isArray(config.services) && config.services.length > 0;

        if (hasCustomServices) {
          const formatted = config.services!.slice(0, 6).map(function (s, i) {
            return `${i + 1}. ${s}`;
          }).join('\n');
          void addAssistantMessage(`${ui.servicesIntro}\n${formatted}`);
        } else {
          void addAssistantMessage(
            `${ui.servicesIntro}\n\n` +
            `🤖 AI Website Chatbots\n` +
            `Capture and qualify leads automatically.\n\n` +
            `⭐ Reputation Shield\n` +
            `Monitor, improve, and protect your reviews.\n\n` +
            `🎯 Lead Qualification\n` +
            `Filter serious prospects before they call.\n\n` +
            `🏷 White-Label AI\n` +
            `Launch branded AI solutions under your own name.\n\n` +
            `🏢 Industry-Specific Assistants\n` +
            `Built for dental, legal, med spa, and more.`
          );
        }

        void addAssistantMessage(ui.servicesFollowUp);
        void addAssistantMessage(ui.servicesEnd);
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
          || normalized.includes('đặt lịch')
          || normalized.includes('đặt hẹn')
          || normalized.includes('hẹn')
          || normalized.includes('tư vấn')
          || normalized.includes('gặp')
          || normalized.includes('liên hệ')
          || normalized.includes('báo giá')
        );
      }

      function startLeadCapture() {
        const lead = leadStates[sessionId];
        lead.active = true;
        lead.step = 'industry';
        void addAssistantMessage(ui.industryQuestion);
        renderIndustryPicker();
      }

      function isSkipEmail(value: string): boolean {
        const normalized = value.toLowerCase();
        return normalized === 'skip' || normalized === 'no' || normalized === 'none'
          || normalized === 'bỏ qua' || normalized === 'bo qua'
          || normalized === 'không' || normalized === 'khong';
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
          if (leadStates[sessionId].captured) {
            if (config.bookingLink) {
              await addAssistantMessage(ui.leadBookCta);
              renderBookingButton();
            }
            return;
          }
          startLeadCapture();
          return;
        }

        if (leadStates[sessionId].active) {
          await processLeadStep(text);
          return;
        }

        await sendChatToApi(text);
      }

      async function processLeadStep(text: string) {
        const lead = leadStates[sessionId];
        addMessage('user', text);

        if (lead.step === 'industry') {
          lead.industry = text;
          lead.step = 'name';
          quickDiv.innerHTML = '';
          void addAssistantMessage(ui.leadStartName);
          return;
        }

        if (lead.step === 'name') {
          if (text.trim().length < 2) {
            void addAssistantMessage(ui.leadNameRetry);
            return;
          }
          lead.name = text;
          lead.step = 'phone';
          void addAssistantMessage(ui.leadPhonePrompt(lead.name));
          return;
        }

        if (lead.step === 'phone') {
          if (!isValidPhone(text)) {
            void addAssistantMessage(ui.leadPhoneInvalid);
            return;
          }
          lead.phone = text;
          lead.step = 'email';
          void addAssistantMessage(ui.leadEmailPrompt);
          return;
        }

        if (lead.step === 'email') {
          if (!isSkipEmail(text) && !isValidEmail(text)) {
            void addAssistantMessage(ui.leadEmailInvalid);
            return;
          }

          if (!isSkipEmail(text)) {
            lead.email = text;
          }

          if (!lead.name || !lead.phone) {
            await addAssistantMessage(ui.leadNameRequired);
            return;
          }

          const cleanedPhone = (lead.phone || '').replace(/[^0-9]/g, '');
          if (cleanedPhone.length < 10) {
            await addAssistantMessage(ui.leadPhoneRequired);
            return;
          }

          lead.step = 'done';
          lead.active = false;
          lead.captured = true;

          const saveSuccessful = await sendLeadToApi({
            botId: config.botId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email || undefined,
            industry: lead.industry,
          });

          if (saveSuccessful) {
            await addAssistantMessage(ui.leadSaveSuccess);
          } else {
            await addAssistantMessage(ui.leadSaveError);
          }

          if (config.bookingLink) {
            await addAssistantMessage(ui.leadBookCta);
            renderBookingButton();
          }

          void addAssistantMessage(ui.postReplyPrompt);
          renderQuickReplies();
        }
      }

      async function sendLeadToApi(lead: {
        botId: string;
        name: string;
        phone: string;
        email?: string;
        industry?: string;
      }) {
        try {
          console.log('[Widget] Sending lead', { botId: lead.botId });
          const res = await fetch(config.apiUrl + '/api/lead', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botId: lead.botId,
              message: 'lead_capture',
              name: lead.name,
              phone: lead.phone,
              email: lead.email,
              industry: lead.industry,
            }),
          });

          if (!res.ok) {
            console.error('[Widget] Lead submit failed', res.status);
            return false;
          }
          return true;
        } catch (err) {
          console.error('[Widget] Lead submit error', err);
          return false;
        }
      }

      async function sendChatToApi(text: string) {
        addMessage('user', text);
        try {
          console.log('[Widget] Sending chat', { botId: config.botId });
          const res = await fetch(config.apiUrl + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              botId: config.botId,
              message: text,
              messages: history,
              sessionId: getSessionId(),
            }),
          });

          if (!res.ok) {
            await addAssistantMessage(ui.chatError);
            return;
          }

          const data = await res.json();
          await addAssistantMessage(data.reply || ui.chatNoReply);
          await addAssistantMessage(ui.postReplyPrompt);
          renderQuickReplies();
        } catch (_err) {
          await addAssistantMessage(ui.chatConnectError);
        }
      }

      function addAssistantMessage(text: string): Promise<void> {
        assistantQueue = assistantQueue.then(async () => {
          const typingRow = document.createElement('div');
          typingRow.style.display = 'flex';
          typingRow.style.justifyContent = 'flex-start';
          typingRow.style.marginBottom = '10px';
          typingRow.style.paddingLeft = '2px';

          const typingBubble = document.createElement('div');
          typingBubble.innerHTML = '<span class="bn-dot"></span><span class="bn-dot"></span><span class="bn-dot"></span>';
          typingBubble.style.display = 'flex';
          typingBubble.style.alignItems = 'center';
          typingBubble.style.gap = '4px';
          typingBubble.style.padding = '12px 14px';
          typingBubble.style.borderRadius = '14px';
          typingBubble.style.borderBottomLeftRadius = '4px';
          typingBubble.style.background = '#f3f4f6';

          typingRow.appendChild(typingBubble);
          messagesDiv.appendChild(typingRow);
          messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });

          const delay = text.length < 80
            ? 180 + Math.floor(Math.random() * 180)
            : 360 + Math.floor(Math.random() * 360);
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
        row.style.marginBottom = '10px';
        row.style.paddingLeft = role === 'user' ? '0' : '2px';
        row.style.paddingRight = role === 'user' ? '2px' : '0';

        const bubble = document.createElement('div');
        bubble.textContent = text;
        bubble.className = 'bn-bubble';
        bubble.style.maxWidth = '80%';
        bubble.style.padding = '10px 13px';
        bubble.style.borderRadius = '14px';
        bubble.style.fontSize = '13.5px';
        bubble.style.lineHeight = '1.5';
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
    const script = document.currentScript as HTMLScriptElement | null;
    const fallbackScript = document.querySelector('script[data-bot-id]') as HTMLScriptElement | null;
    const activeScript = script || fallbackScript;
    if (!activeScript) {
      console.error('[Widget] No script tag with data-bot-id found');
      return;
    }

    const botId = script?.dataset?.botId || activeScript.dataset?.botId;
    console.log('[Widget] botId:', botId);
    const scriptApiUrl = script?.dataset?.apiUrl || activeScript.dataset?.apiUrl;
    const scriptLang = activeScript.dataset?.lang;

    console.log('[Widget] Script tag detected', {
      src: activeScript.getAttribute('src'),
      dataBotId: activeScript.getAttribute('data-bot-id'),
      dataApiUrl: activeScript.getAttribute('data-api-url'),
      dataLang: activeScript.getAttribute('data-lang'),
    });
    const apiUrl = (scriptApiUrl || DEFAULT_API_URL).replace('BOTNEST_RAILWAY_APP', RAILWAY_APP);

    console.log('[Widget] Script config values', {
      botId,
      scriptApiUrl,
      resolvedApiUrl: apiUrl,
      scriptLang,
    });

    if (!botId) {
      console.error('[Widget] Missing data-bot-id. Widget initialization aborted.');
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
        const language = scriptLang === 'vi' || config.market === 'vn' ? 'vi' : 'en';
        const isVietnamese = language === 'vi';
        const isDemoConfig =
          botId === 'test-bot' ||
          config.botId === 'demo' ||
          config.businessName === 'BotNest AI Assistant';
        if (!isVietnamese && isDemoConfig) {
          config.businessName = 'BotNest AI Assistant';
          config.welcomeMessage = "👋 Welcome to BotNest!\n\nI help service businesses:\n• Capture more leads — 24/7\n• Manage and grow online reviews\n• Automate booking & follow-ups\n• Deploy in as little as one day";
          config.services = [
            'AI Website Chatbots',
            'Reputation Shield — Review Management',
            'Lead Capture & Qualification',
            'White-Label AI Solutions',
            'Industry-Specific AI Assistants',
          ];
          console.log('[Widget] Applied English demo BotNest config');
        }
        if (isVietnamese && isDemoConfig) {
          config.businessName = 'Trợ Lý AI BotNest';
          config.welcomeMessage = 'Xin chào! Tôi là trợ lý AI demo của BotNest. Tôi có thể trả lời câu hỏi, thu thập khách hàng tiềm năng và hướng dẫn khách đặt lịch tự động.';
          config.services = ['Tư vấn chatbot AI', 'Thu thập khách hàng tiềm năng', 'Hỗ trợ đặt lịch'];
          config.fallbackContact = 'Bạn có thể đặt lịch demo hoặc bắt đầu ngay — bảo đảm hoàn tiền 15 ngày.';
          console.log('[Widget] Applied Vietnamese demo fallback text');
        }
        createWidget({ ...config, botId, apiUrl, language });
      })
      .catch((err) => {
        console.error('[Widget] Config fetch error', err);
        const language = scriptLang === 'vi' ? 'vi' : 'en';
        createWidget({
          botId,
          apiUrl,
          businessName: 'BotNest AI Assistant',
          welcomeMessage: "👋 Welcome to BotNest!\n\nI help service businesses:\n• Capture more leads — 24/7\n• Manage and grow online reviews\n• Automate booking & follow-ups\n• Deploy in as little as one day",
          services: [
            'AI Website Chatbots',
            'Reputation Shield — Review Management',
            'Lead Capture & Qualification',
            'White-Label AI Solutions',
            'Industry-Specific AI Assistants',
          ],
          language,
        });
      });
  }

  initFromScriptTag();
})();
