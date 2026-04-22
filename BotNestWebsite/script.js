const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const navLinks = document.querySelectorAll('.site-nav a[href^="#"]');

if (menuToggle && siteNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener('click', () => {
    siteNav?.classList.remove('open');
    menuToggle?.setAttribute('aria-expanded', 'false');
  });
});

const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.2,
    rootMargin: '0px 0px -40px 0px',
  }
);

revealElements.forEach((el) => revealObserver.observe(el));

const sections = document.querySelectorAll('main section[id]');
const headerLinks = document.querySelectorAll('.site-nav a[href^="#"]');

const activateCurrentSection = () => {
  let current = '';

  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 120;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id') || '';
    }
  });

  headerLinks.forEach((link) => {
    link.classList.remove('active');
    const href = link.getAttribute('href');
    if (href === '#' + current) {
      link.classList.add('active');
    }
  });
};

window.addEventListener('scroll', activateCurrentSection);
activateCurrentSection();

const leadForm = document.getElementById('lead-form');
const formNote = document.getElementById('form-note');
const RAILWAY_APP = 'botnest-live-production';
const LEAD_API_URL = 'https://' + RAILWAY_APP + '.up.railway.app/api/lead';
const startPlanButtons = document.querySelectorAll('.start-plan');
const onboardingSection = document.getElementById('onboarding');
const selectedPlanLabel = document.getElementById('selected-plan-label');
const onboardingError = document.getElementById('onboarding-error');
const chatTooltip = document.getElementById('chat-tooltip');
const CREATE_BOT_API_URL = 'https://botnest-live-production.up.railway.app/api/create-bot';
let selectedPlan = '';
let chatTooltipDismissed = false;

const hideChatTooltip = () => {
  if (!chatTooltip) {
    return;
  }
  chatTooltipDismissed = true;
  chatTooltip.classList.remove('show');
};

const isLikelyChatTrigger = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const className = String(element.className || '').toLowerCase();
  const ariaLabel = String(element.getAttribute('aria-label') || '').toLowerCase();
  const text = String(element.textContent || '').trim().toLowerCase();
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  const hasChatIdentity = className.includes('botnest')
    || className.includes('chat')
    || ariaLabel.includes('chat')
    || text.includes('chat with us')
    || text === 'chat';

  const isFloatingCornerControl = style.position === 'fixed'
    && rect.right >= window.innerWidth - 180
    && rect.bottom >= window.innerHeight - 180;

  return hasChatIdentity && isFloatingCornerControl;
};

const registerChatTrigger = (element) => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (element.dataset.botnestChatBound === 'true') {
    return;
  }
  if (!isLikelyChatTrigger(element)) {
    return;
  }

  element.dataset.botnestChatBound = 'true';
  element.classList.add('widget-attention-pulse');
  element.addEventListener('click', hideChatTooltip, { once: true });
};

const scanForChatTrigger = () => {
  const candidates = document.querySelectorAll('button, a, [role="button"], div');
  candidates.forEach(registerChatTrigger);
};

if (chatTooltip) {
  setTimeout(() => {
    if (!chatTooltipDismissed) {
      chatTooltip.classList.add('show');
    }
  }, 2000);

  chatTooltip.addEventListener('click', hideChatTooltip);
  chatTooltip.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      hideChatTooltip();
    }
  });

  // Fallback: if user clicks in widget area, dismiss tooltip even if vendor markup differs.
  document.addEventListener('click', (event) => {
    if (chatTooltipDismissed || !(event instanceof MouseEvent)) {
      return;
    }
    const inBottomRight = event.clientX > window.innerWidth - 220 && event.clientY > window.innerHeight - 220;
    if (inBottomRight) {
      hideChatTooltip();
    }
  });

  const observer = new MutationObserver(() => {
    scanForChatTrigger();
  });

  observer.observe(document.body, { childList: true, subtree: true });
  scanForChatTrigger();
}

const formatPlanLabel = (plan) => {
  if (plan === 'starter') {
    return 'Starter ($149/month)';
  }
  if (plan === 'pro') {
    return 'Pro ($299/month)';
  }
  return 'none';
};

startPlanButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!onboardingSection) {
      return;
    }

    selectedPlan = button.getAttribute('data-plan') || '';

    startPlanButtons.forEach((btn) => {
      btn.removeAttribute('data-selected');
    });
    button.setAttribute('data-selected', 'true');

    if (selectedPlanLabel) {
      selectedPlanLabel.textContent = 'Selected plan: ' + formatPlanLabel(selectedPlan);
    }
    if (onboardingError) {
      onboardingError.textContent = '';
    }

    onboardingSection.classList.remove('hidden');
    onboardingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

if (document.getElementById("onboarding-form")) {
  document.getElementById("onboarding-form").addEventListener("submit", async function(e) {
    e.preventDefault();

    if (!this.checkValidity()) {
      this.reportValidity();
      return;
    }

    if (!selectedPlan) {
      if (onboardingError) {
        onboardingError.textContent = 'Please select a pricing plan first.';
      }
      return;
    }

    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.textContent = 'Creating your assistant...';
      submitButton.disabled = true;
    }

    const formData = new FormData(this);
    const payload = {
      business_name: String(formData.get('business_name') || '').trim(),
      website: String(formData.get('website') || '').trim(),
      industry: String(formData.get('industry') || '').trim(),
      description: String(formData.get('description') || '').trim(),
      booking_link: String(formData.get('booking_link') || '').trim(),
      tone: String(formData.get('tone') || 'professional'),
      selected_plan: selectedPlan,
    };

    try {
      // Step 1: Create the bot and get server-generated botId
      const createBotRes = await fetch(CREATE_BOT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!createBotRes.ok) {
        const text = await createBotRes.text();
        console.error('Create bot error:', text);
        throw new Error('Failed to create assistant');
      }

      const createBotData = await createBotRes.json();
      const botId = String(createBotData.botId || '');

      if (!botId) {
        throw new Error('No botId returned from server');
      }

      // Step 2: Create Stripe checkout session
      const checkoutRes = await fetch(
        'https://botnest-live-production.up.railway.app/api/create-checkout-session',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: selectedPlan, botId }),
        }
      );

      if (!checkoutRes.ok) {
        const text = await checkoutRes.text();
        console.error('Checkout session error:', text);
        throw new Error('Failed to create checkout session');
      }

      const checkoutData = await checkoutRes.json();

      if (!checkoutData.url) {
        throw new Error('No checkout URL returned');
      }

      // Step 3: Redirect to Stripe — success UI is shown only after payment
      window.location.href = checkoutData.url;
    } catch (err) {
      console.error('FRONTEND ERROR:', err);
      if (onboardingError) {
        onboardingError.textContent = 'Something went wrong while creating your assistant. Please try again.';
      }
      if (submitButton) {
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
      }
    }
  });
}

const submitLeadForm = async (event) => {
  event.preventDefault();

  if (!leadForm || !formNote) {
    return;
  }

  if (!leadForm.checkValidity()) {
    formNote.textContent = 'Please complete all fields before submitting.';
    formNote.style.color = '#ff9fad';
    return;
  }

  const formData = new FormData(leadForm);
  const payload = {
    name: String(formData.get('name') || '').trim(),
    phone: String(formData.get('phone') || '').trim(),
    email: String(formData.get('email') || '').trim(),
  };

  try {
    const response = await fetch(LEAD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error('Lead submission failed');
    }

    formNote.textContent = "Success! We'll contact you shortly.";
    formNote.style.color = '#9ef1de';
    leadForm.reset();
  } catch (error) {
    formNote.textContent = 'Something went wrong. Try again.';
    formNote.style.color = '#ff9fad';
  }
};

if (leadForm && formNote) {
  leadForm.addEventListener('submit', submitLeadForm);
}
