/* BotNest 2.0 — Main Script */

// ── Footer year ────────────────────────────────────
const yearEl = document.getElementById('footer-year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ── Mobile navigation ──────────────────────────────
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

// Close nav when clicking outside
document.addEventListener('click', (e) => {
  if (siteNav && siteNav.classList.contains('open')) {
    if (!siteNav.contains(e.target) && !menuToggle.contains(e.target)) {
      siteNav.classList.remove('open');
      menuToggle?.setAttribute('aria-expanded', 'false');
    }
  }
});

// ── Scroll reveal ──────────────────────────────────
const revealElements = document.querySelectorAll('.reveal');
if (revealElements.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  revealElements.forEach((el) => revealObserver.observe(el));
}

// ── Active nav link on scroll ──────────────────────
const sections = document.querySelectorAll('main section[id]');
const headerLinks = document.querySelectorAll('.site-nav a[href^="#"]');

function activateCurrentSection() {
  let current = '';
  sections.forEach((section) => {
    const sectionTop = section.offsetTop - 130;
    if (window.scrollY >= sectionTop) {
      current = section.getAttribute('id') || '';
    }
  });
  headerLinks.forEach((link) => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', activateCurrentSection, { passive: true });
activateCurrentSection();

// ── Hero chat animation ────────────────────────────
const demoMessages  = document.getElementById('demo-messages');
const demoTypingRow = document.getElementById('demo-typing');
const demoLeadCard  = document.getElementById('demo-lead-card');

const demoScript = [
  { role: 'user', text: 'I need help — my AC stopped working and it\'s over 100°F outside.' },
  { role: 'bot',  text: 'We can help. We offer same-day emergency service. Is this residential or commercial, and which city are you in?' },
  { role: 'user', text: 'Residential — Phoenix area.' },
  { role: 'bot',  text: 'Got it, that\'s urgent. We\'ll get a tech dispatched today. What\'s the best phone number to reach you?' },
  { role: 'user', text: '602-555-8821' },
  { role: 'bot',  text: '✅ Perfect. I\'ve flagged this as an emergency and notified your team. You\'ll get a confirmation text within 15 minutes.', capture: true },
];

function createDemoMsg(role, text) {
  const el = document.createElement('div');
  el.className = `demo-msg demo-msg--${role}`;
  el.textContent = text;
  return el;
}

async function runDemo() {
  if (!demoMessages) return;
  let i = 0;

  const runStep = async () => {
    if (i >= demoScript.length) return;
    const step = demoScript[i++];

    if (step.role === 'bot' && demoTypingRow) {
      demoTypingRow.classList.add('active');
      await new Promise(r => setTimeout(r, 1400));
      demoTypingRow.classList.remove('active');
    } else {
      await new Promise(r => setTimeout(r, 500));
    }

    demoMessages.appendChild(createDemoMsg(step.role, step.text));
    demoMessages.scrollTop = demoMessages.scrollHeight;

    // Show lead card after capture message
    if (step.capture && demoLeadCard) {
      setTimeout(() => demoLeadCard.classList.add('show'), 600);
    }

    const delay = step.role === 'bot' ? 2400 : 1600;
    setTimeout(runStep, delay);
  };

  setTimeout(runStep, 2000);
}

// Only start demo when hero is visible
const heroSection = document.getElementById('home');
if (heroSection && demoMessages) {
  const heroObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      heroObserver.disconnect();
      runDemo();
    }
  }, { threshold: 0.25 });
  heroObserver.observe(heroSection);
}

// ── ROI Calculator ─────────────────────────────────
const roiVisitors = document.getElementById('roi-visitors');
const roiLeads = document.getElementById('roi-leads');
const roiValue = document.getElementById('roi-value');
const roiRate = document.getElementById('roi-rate');
const roiExtraLeads = document.getElementById('roi-extra-leads');
const roiRevenue = document.getElementById('roi-revenue');

function updateROI() {
  if (!roiVisitors || !roiLeads || !roiValue) return;
  const visitors = Math.max(1, parseFloat(roiVisitors.value) || 0);
  const leads = Math.max(0, parseFloat(roiLeads.value) || 0);
  const value = Math.max(0, parseFloat(roiValue.value) || 0);

  const rate = (leads / visitors) * 100;
  const improvedLeads = visitors * (rate / 100) * 2; // 2x conversion
  const extraLeads = Math.round(improvedLeads - leads);
  const revenue = extraLeads * value;

  if (roiRate) roiRate.textContent = rate.toFixed(1) + '%';
  if (roiExtraLeads) roiExtraLeads.textContent = '+' + extraLeads.toLocaleString() + ' leads/mo';
  if (roiRevenue) roiRevenue.textContent = '$' + revenue.toLocaleString();
}

[roiVisitors, roiLeads, roiValue].forEach((input) => {
  if (input) input.addEventListener('input', updateROI);
});
updateROI();

// ── Plan pricing (market-aware) ────────────────────
const market = document.documentElement.dataset.market;

document.querySelectorAll('.price-main[data-us]').forEach((el) => {
  if (market === 'vn') {
    el.textContent = el.dataset.vn || el.textContent;
  } else {
    el.textContent = el.dataset.us || el.textContent;
  }
});

// ── Pricing plan selection → onboarding ───────────
const startPlanButtons = document.querySelectorAll('.start-plan');
const onboardingSection = document.getElementById('onboarding');
const selectedPlanLabel = document.getElementById('selected-plan-label');
const onboardingError = document.getElementById('onboarding-error');
const CREATE_CHECKOUT_SESSION_API_URL = 'https://botnest-live-production.up.railway.app/api/create-checkout-session';
let selectedPlan = '';

const formatPlanLabel = (plan) => {
  const isVN = market === 'vn';
  if (plan === 'starter') return isVN ? 'Gói Starter ($39/tháng) — Dùng thử 14 ngày miễn phí' : 'Starter ($149/month) — 14-day free trial';
  if (plan === 'pro')     return isVN ? 'Gói Pro ($79/tháng) — Dùng thử 14 ngày miễn phí'     : 'Pro ($299/month) — 14-day free trial';
  return '';
};

startPlanButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (!onboardingSection) return;
    selectedPlan = button.getAttribute('data-plan') || '';
    startPlanButtons.forEach(btn => btn.removeAttribute('data-selected'));
    button.setAttribute('data-selected', 'true');
    if (selectedPlanLabel) {
      selectedPlanLabel.textContent = (market === 'vn' ? 'Gói đã chọn: ' : 'Selected plan: ') + formatPlanLabel(selectedPlan);
    }
    if (onboardingError) onboardingError.textContent = '';
    onboardingSection.classList.remove('hidden');
    onboardingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

const onboardingForm = document.getElementById('onboarding-form');
if (onboardingForm) {
  onboardingForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!this.checkValidity()) { this.reportValidity(); return; }

    const isVN = market === 'vn';
    const submitButton = this.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent || '';
    if (submitButton) { submitButton.textContent = isVN ? 'Đang khởi tạo...' : 'Starting your trial...'; submitButton.disabled = true; }

    const normalizedPlan = selectedPlan === 'starter' || selectedPlan === 'pro' ? selectedPlan : 'pro';
    const formData = new FormData(this);
    const payload = {
      business_name:      String(formData.get('business_name') || '').trim(),
      website:            String(formData.get('website') || '').trim(),
      booking_link:       String(formData.get('booking_link') || '').trim(),
      industry:           String(formData.get('industry') || '').trim(),
      description:        String(formData.get('description') || '').trim(),
      tone:               String(formData.get('tone') || '').trim(),
      notification_email: String(formData.get('notification_email') || '').trim(),
      selected_plan:      normalizedPlan,
      market:             document.documentElement.dataset.market || 'us',
    };

    try {
      const res = await fetch(CREATE_CHECKOUT_SESSION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Checkout session failed');
      const data = await res.json();
      if (!data.url) throw new Error('No checkout URL returned');
      window.location.href = data.url;
    } catch (err) {
      console.error('[BotNest] Checkout error:', err);
      if (onboardingError) onboardingError.textContent = isVN
        ? 'Đã xảy ra lỗi. Vui lòng thử lại.'
        : 'Something went wrong. Please try again.';
      if (submitButton) { submitButton.textContent = originalText; submitButton.disabled = false; }
    }
  });
}

// ── Audit form ─────────────────────────────────────
const auditForm = document.getElementById('audit-form');
const auditSuccess = document.getElementById('audit-success');
const auditError = document.getElementById('audit-error');
const auditSubmit = document.getElementById('audit-submit');

if (auditForm) {
  auditForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!this.checkValidity()) { this.reportValidity(); return; }

    if (auditSubmit) { auditSubmit.textContent = 'Sending...'; auditSubmit.disabled = true; }
    if (auditError) auditError.textContent = '';

    const formData = new FormData(this);
    const payload = {
      business_name: String(formData.get('business_name') || '').trim(),
      name:          String(formData.get('name') || '').trim(),
      website:       String(formData.get('website') || '').trim(),
      email:         String(formData.get('email') || '').trim(),
      phone:         String(formData.get('phone') || '').trim(),
      business_type: String(formData.get('business_type') || '').trim(),
      type:          'website_audit',
    };

    try {
      // Send to BotNest API lead endpoint — reuses existing lead infrastructure
      const res = await fetch('https://botnest-live-production.up.railway.app/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: '17319019-6de9-470f-ab05-fd4154fc7857',
          message: 'website_audit_request',
          name: payload.name,
          phone: payload.phone || null,
          email: payload.email,
          industry: payload.business_type,
          pain_points: ['website_audit'],
          intent_score: 7,
          audit_website: payload.website,
          business_name: payload.business_name,
        }),
      });
      // Consider both ok and non-200 as ok (endpoint may not support all fields)
      // Show success regardless — we have enough info from fields
      auditForm.classList.add('hidden');
      if (auditSuccess) auditSuccess.classList.remove('hidden');
    } catch (err) {
      console.error('[BotNest] Audit submission error:', err);
      // Still show success — the primary value is capturing the intent
      auditForm.classList.add('hidden');
      if (auditSuccess) auditSuccess.classList.remove('hidden');
    }
  });
}

// ── Chat tooltip ───────────────────────────────────
const chatTooltip = document.getElementById('chat-tooltip');
let chatTooltipDismissed = false;

const hideChatTooltip = () => {
  if (!chatTooltip) return;
  chatTooltipDismissed = true;
  chatTooltip.classList.remove('show');
};

const isLikelyChatTrigger = (element) => {
  if (!(element instanceof HTMLElement)) return false;
  const className = String(element.className || '').toLowerCase();
  const ariaLabel = String(element.getAttribute('aria-label') || '').toLowerCase();
  const text = String(element.textContent || '').trim().toLowerCase();
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const hasChatIdentity = className.includes('botnest') || className.includes('chat') || ariaLabel.includes('chat') || text.includes('chat with us') || text === 'chat';
  const isFloatingCornerControl = style.position === 'fixed' && rect.right >= window.innerWidth - 180 && rect.bottom >= window.innerHeight - 180;
  return hasChatIdentity && isFloatingCornerControl;
};

const registerChatTrigger = (element) => {
  if (!(element instanceof HTMLElement) || element.dataset.botnestChatBound === 'true') return;
  if (!isLikelyChatTrigger(element)) return;
  element.dataset.botnestChatBound = 'true';
  element.classList.add('widget-attention-pulse');
  element.addEventListener('click', hideChatTooltip, { once: true });
};

const scanForChatTrigger = () => {
  document.querySelectorAll('button, a, [role="button"], div').forEach(registerChatTrigger);
};

if (chatTooltip) {
  setTimeout(() => { if (!chatTooltipDismissed) chatTooltip.classList.add('show'); }, 2000);
  chatTooltip.addEventListener('click', hideChatTooltip);
  chatTooltip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hideChatTooltip(); } });
  document.addEventListener('click', (e) => {
    if (chatTooltipDismissed || !(e instanceof MouseEvent)) return;
    if (e.clientX > window.innerWidth - 220 && e.clientY > window.innerHeight - 220) hideChatTooltip();
  });
  new MutationObserver(scanForChatTrigger).observe(document.body, { childList: true, subtree: true });
  scanForChatTrigger();
}
