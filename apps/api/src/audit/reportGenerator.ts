/**
 * Audit Report HTML Generator
 * Produces a polished, print-ready HTML report using BotNest design system.
 * Self-contained — no external CSS or JS dependencies.
 */

import type { AuditAnalysis, Finding, Strength } from './analyzer';
import type { ScoreResult, CategoryScore } from './scorer';
import type { SiteSignals } from './extractor';

export type ReportData = {
  auditId: string;
  businessName: string;
  websiteUrl: string;
  contactName: string;
  businessType: string;
  createdAt: string;
  signals: SiteSignals;
  scores: ScoreResult;
  analysis: AuditAnalysis;
};

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.8) return '#22c55e';
  if (pct >= 0.6) return '#f2bf3a';
  return '#f87171';
}

function gradeColor(grade: string): string {
  if (grade === 'Strong') return '#22c55e';
  if (grade === 'Good') return '#4ade80';
  if (grade === 'Needs Improvement') return '#f2bf3a';
  return '#f87171';
}

function severityBadge(severity: string): string {
  const colors: Record<string, string> = {
    high: '#fee2e2|#dc2626',
    medium: '#fef3c7|#d97706',
    low: '#f0fdf4|#16a34a',
  };
  const [bg, fg] = (colors[severity] || colors.medium).split('|');
  const label = severity.charAt(0).toUpperCase() + severity.slice(1) + ' Impact';
  return `<span style="background:${bg};color:${fg};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;">${escHtml(label)}</span>`;
}

function factTypeBadge(factType: string): string {
  const isObserved = factType === 'OBSERVED';
  const bg = isObserved ? '#eff6ff' : '#f5f3ff';
  const fg = isObserved ? '#1d4ed8' : '#7c3aed';
  return `<span style="background:${bg};color:${fg};padding:1px 8px;border-radius:12px;font-size:10px;font-weight:600;letter-spacing:0.08em;">${isObserved ? '● OBSERVED' : '◎ INFERRED'}</span>`;
}

function categoryIcon(key: string): string {
  const icons: Record<string, string> = {
    conversion: '⚡',
    mobile: '📱',
    performance: '🚀',
    leadCapture: '🎯',
    lead_capture: '🎯',
    followUp: '🔄',
    follow_up: '🔄',
    reputation: '⭐',
    messaging: '💬',
  };
  return icons[key] || '📊';
}

function buildScoreCircle(total: number, max: number, grade: string): string {
  const pct = total / max;
  const circumference = 2 * Math.PI * 52;
  const dash = pct * circumference;
  const color = gradeColor(grade);

  return `
<div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
  <svg width="140" height="140" viewBox="0 0 120 120" style="transform:rotate(-90deg);">
    <circle cx="60" cy="60" r="52" fill="none" stroke="#e5e7eb" stroke-width="10"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="10"
      stroke-dasharray="${dash.toFixed(1)} ${circumference.toFixed(1)}"
      stroke-linecap="round"/>
  </svg>
  <div style="margin-top:-110px;text-align:center;width:140px;">
    <div style="font-size:36px;font-weight:900;color:#111827;line-height:1;">${total}</div>
    <div style="font-size:14px;color:#6b7280;font-weight:500;">out of ${max}</div>
  </div>
  <div style="margin-top:8px;font-size:15px;font-weight:700;color:${color};">${escHtml(grade)}</div>
</div>`;
}

function buildCategoryBars(categories: CategoryScore[]): string {
  return categories.map(cat => {
    const pct = Math.round((cat.score / cat.maxScore) * 100);
    const color = scoreColor(cat.score, cat.maxScore);
    const icon = categoryIcon(cat.key);
    return `
<div style="margin-bottom:14px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
    <span style="font-size:13px;font-weight:600;color:#374151;">${icon} ${escHtml(cat.name)}</span>
    <span style="font-size:13px;font-weight:700;color:${color};">${cat.score}/${cat.maxScore}</span>
  </div>
  <div style="height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
    <div style="height:100%;width:${pct}%;background:${color};border-radius:4px;transition:width 0.5s;"></div>
  </div>
</div>`;
  }).join('');
}

function buildFindingCard(finding: Finding, index: number): string {
  const catIcon = categoryIcon(finding.category);
  return `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;margin-bottom:16px;border-left:4px solid ${finding.severity === 'high' ? '#dc2626' : finding.severity === 'medium' ? '#d97706' : '#16a34a'};">
  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="background:#f3f4f6;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">${index + 1}</span>
      <h3 style="font-size:16px;font-weight:700;color:#111827;margin:0;">${escHtml(finding.title)}</h3>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap;">
      ${severityBadge(finding.severity)}
      ${factTypeBadge(finding.fact_type)}
    </div>
  </div>
  <div style="display:grid;gap:10px;">
    <div>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Evidence</span>
      <p style="margin:4px 0 0;font-size:14px;color:#374151;">${escHtml(finding.evidence)}</p>
    </div>
    <div>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Business Impact</span>
      <p style="margin:4px 0 0;font-size:14px;color:#374151;">${escHtml(finding.business_impact)}</p>
    </div>
    <div>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6b7280;">Recommendation</span>
      <p style="margin:4px 0 0;font-size:14px;color:#374151;">${escHtml(finding.recommendation)}</p>
    </div>
    <div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">🤖</span>
      <div>
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#78716c;">BotNest Solution</span>
        <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#292524;">${escHtml(finding.botnest_solution)}</p>
      </div>
    </div>
  </div>
</div>`;
}

function buildStrengthChips(strengths: Strength[]): string {
  if (!strengths.length) return '<p style="color:#6b7280;font-style:italic;">No specific strengths were detected during this automated analysis.</p>';
  return strengths.map(s => `
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 18px;margin-bottom:10px;">
  <div style="font-size:14px;font-weight:700;color:#15803d;">✓ ${escHtml(s.title)}</div>
  <p style="margin:4px 0 0;font-size:13px;color:#166534;">${escHtml(s.detail)}</p>
</div>`).join('');
}

function buildConversionJourney(signals: SiteSignals): string {
  const steps = [
    { label: 'Visitor Arrives', ok: true, note: signals.hasViewportMeta ? 'Mobile-ready' : 'May not be mobile-optimized' },
    { label: 'Sees CTA', ok: signals.hasCtaAboveFold, note: signals.hasCtaAboveFold ? 'CTA above fold' : 'No above-fold CTA detected' },
    { label: 'Engages', ok: signals.hasContactForm || signals.hasLiveChat || signals.hasAiChat, note: [signals.hasContactForm && 'Form', signals.hasLiveChat && 'Live chat', signals.hasAiChat && 'AI chat'].filter(Boolean).join(', ') || 'Phone call only' },
    { label: 'Books / Schedules', ok: signals.hasOnlineBooking, note: signals.hasOnlineBooking ? 'Online booking available' : 'No online booking — must call' },
    { label: 'Receives Follow-Up', ok: signals.hasConfirmationFlow || signals.hasCrm, note: signals.hasConfirmationFlow ? 'Confirmation flow detected' : 'No automated follow-up detected' },
  ];

  const items = steps.map((step, i) => {
    const color = step.ok ? '#22c55e' : '#f87171';
    const bg = step.ok ? '#f0fdf4' : '#fef2f2';
    const border = step.ok ? '#86efac' : '#fca5a5';
    const connector = i < steps.length - 1
      ? `<div style="width:2px;height:20px;background:#e5e7eb;margin:0 auto;"></div>`
      : '';
    return `
<div style="background:${bg};border:1px solid ${border};border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:12px;">
  <span style="font-size:18px;width:24px;text-align:center;">${step.ok ? '✓' : '✗'}</span>
  <div>
    <div style="font-size:13px;font-weight:700;color:#111827;">${escHtml(step.label)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escHtml(step.note)}</div>
  </div>
</div>${connector}`;
  }).join('');

  return `<div style="max-width:340px;">${items}</div>`;
}

function packageLabel(pkg: string): string {
  const labels: Record<string, string> = {
    starter: 'Starter — $149/month',
    growth: 'Growth — Custom',
    scale: 'Scale — Custom',
  };
  return labels[pkg] || pkg;
}

// ── Main generator ─────────────────────────────────────────────────────────────
export function generateReportHtml(data: ReportData): string {
  const { businessName, websiteUrl, contactName, createdAt, scores, analysis, signals, auditId } = data;
  const topFindings = [...analysis.findings].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.severity] - order[b.severity];
  }).slice(0, 5);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>BotNest Website Growth Audit — ${escHtml(businessName)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 860px; margin: 0 auto; background: #fff; }
  @media print {
    body { background: #fff; }
    .page { max-width: 100%; box-shadow: none; }
    .no-print { display: none !important; }
    .page-break { page-break-before: always; }
  }
  @media (max-width: 640px) {
    .grid-2 { grid-template-columns: 1fr !important; }
  }
</style>
</head>
<body>
<div class="page">

<!-- Header -->
<div style="background:linear-gradient(135deg,#060c1a 0%,#0a1a28 100%);padding:40px 48px;color:#fff;">
  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:28px;">
    <div>
      <div style="font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#f2bf3a;margin-bottom:6px;">BotNest AI Growth Platform</div>
      <h1 style="font-size:26px;font-weight:900;margin:0;letter-spacing:-0.02em;">Website Growth Audit</h1>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;color:#a8b8d8;">Prepared for</div>
      <div style="font-size:18px;font-weight:700;">${escHtml(businessName)}</div>
      <div style="font-size:12px;color:#a8b8d8;margin-top:4px;">${formatDate(createdAt)}</div>
    </div>
  </div>
  <div style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:14px 18px;display:flex;gap:24px;flex-wrap:wrap;">
    <div><span style="font-size:11px;color:#a8b8d8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Website</span><div style="font-size:13px;color:#6eb5ff;font-weight:500;margin-top:2px;">${escHtml(websiteUrl)}</div></div>
    <div><span style="font-size:11px;color:#a8b8d8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Contact</span><div style="font-size:13px;color:#edf2ff;font-weight:500;margin-top:2px;">${escHtml(contactName)}</div></div>
    <div><span style="font-size:11px;color:#a8b8d8;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">Audit ID</span><div style="font-size:11px;color:#a8b8d8;font-weight:400;margin-top:2px;font-family:monospace;">${escHtml(auditId)}</div></div>
  </div>
</div>

<!-- Score Section -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 28px;color:#111827;">Website Growth Score</h2>
  <div class="grid-2" style="display:grid;grid-template-columns:auto 1fr;gap:40px;align-items:start;">
    ${buildScoreCircle(scores.total, scores.maxTotal, scores.grade)}
    <div>
      <p style="font-size:15px;color:#374151;margin:0 0 20px;line-height:1.6;">${escHtml(analysis.executiveSummary)}</p>
      ${buildCategoryBars(scores.categories)}
    </div>
  </div>
</div>

<!-- What You're Doing Well -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 20px;color:#111827;">What You're Doing Well</h2>
  ${buildStrengthChips(analysis.strengths)}
</div>

<!-- Top Growth Opportunities -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;color:#111827;">Top Revenue Leaks</h2>
  <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">These are the highest-priority areas where your website may be losing potential customers.</p>
  ${topFindings.map((f, i) => buildFindingCard(f, i)).join('')}
</div>

<!-- Conversion Journey -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;color:#111827;">Customer Conversion Journey</h2>
  <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">How a visitor moves from landing on your site to becoming a customer — and where gaps exist.</p>
  ${buildConversionJourney(signals)}
</div>

<!-- Recommendations -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 20px;color:#111827;">Recommended Next Steps</h2>
  <ol style="margin:0;padding-left:20px;">
    ${analysis.recommendations.map(r => `<li style="font-size:14px;color:#374151;margin-bottom:10px;line-height:1.5;">${escHtml(r)}</li>`).join('')}
  </ol>
</div>

<!-- How BotNest Helps -->
<div style="padding:40px 48px;border-bottom:1px solid #e5e7eb;background:#fafaf9;">
  <h2 style="font-size:20px;font-weight:800;margin:0 0 8px;color:#111827;">How BotNest Can Help</h2>
  <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">Based on this audit, the recommended BotNest package for your business is:</p>
  <div style="background:#fff;border:2px solid #f2bf3a;border-radius:12px;padding:20px 24px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
    <span style="font-size:28px;">🏆</span>
    <div>
      <div style="font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;color:#92400e;">Recommended Package</div>
      <div style="font-size:20px;font-weight:800;color:#111827;">${escHtml(packageLabel(analysis.recommendedPackage))}</div>
    </div>
  </div>
  <div style="display:grid;gap:10px;">
    ${topFindings.map(f => `
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 18px;display:flex;gap:12px;align-items:flex-start;">
      <span style="font-size:18px;flex-shrink:0;">🤖</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:#111827;">${escHtml(f.botnest_solution)}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:3px;">${escHtml(f.title)}</div>
      </div>
    </div>`).join('')}
  </div>
</div>

<!-- CTA -->
<div style="padding:48px;background:linear-gradient(135deg,#060c1a 0%,#0a1a28 100%);text-align:center;">
  <div style="font-size:13px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#f2bf3a;margin-bottom:12px;">Ready to Grow?</div>
  <h2 style="font-size:26px;font-weight:900;color:#fff;margin:0 0 12px;letter-spacing:-0.02em;">Book Your Growth Strategy Call</h2>
  <p style="font-size:15px;color:#a8b8d8;margin:0 0 28px;max-width:480px;margin-left:auto;margin-right:auto;">We'll walk through your audit results, answer your questions, and show you exactly how BotNest can turn your website into a customer acquisition engine.</p>
  <a href="https://calendly.com/rick-bot-nest/30min" style="display:inline-block;background:linear-gradient(135deg,#f2bf3a 0%,#ffd76d 100%);color:#0f1e2d;font-size:16px;font-weight:800;padding:16px 36px;border-radius:8px;text-decoration:none;letter-spacing:-0.01em;">Book Free Strategy Call →</a>
  <div style="margin-top:20px;font-size:12px;color:#a8b8d8;">bot-nest.com · rick@bot-nest.com</div>
</div>

<!-- Footer -->
<div style="padding:20px 48px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
  <p style="font-size:11px;color:#9ca3af;margin:0;line-height:1.6;">
    This audit was generated automatically by BotNest's Website Growth Audit Engine based on publicly observable signals from ${escHtml(websiteUrl)}.
    Findings marked INFERRED represent reasonable business inferences, not directly measured facts.
    Traffic, revenue, and conversion rate data were not available and have not been estimated.
    Audit ID: ${escHtml(auditId)} · ${formatDate(createdAt)}
  </p>
</div>

</div>
</body>
</html>`;
}
