/**
 * BotNest Admin — Website Growth Audit Dashboard
 *
 * Security model:
 * - Browser authenticates with ADMIN_PASSWORD via POST /api/auth
 * - Session stored as httpOnly cookie (never in JS / localStorage)
 * - All data calls go to /api/audits/* (Next.js API routes)
 * - Those routes hold ADMIN_API_KEY server-side and proxy to Railway
 * - Browser NEVER sees ADMIN_API_KEY or RAILWAY credentials
 */

import { useEffect, useState, useCallback } from 'react';

type AuditRow = {
  id: string;
  contact_name: string;
  business_name: string;
  email: string;
  phone?: string;
  business_type?: string;
  website_url: string;
  status: string;
  failure_reason?: string;
  website_growth_score?: number;
  opportunity_score?: number;
  opportunity_label?: string;
  recommended_package?: string;
  executive_summary?: string;
  sales_angle?: string;
  findings?: any[];
  strengths?: any[];
  recommendations?: string[];
  category_scores?: Record<string, any>;
  created_at: string;
  completed_at?: string;
  reviewed_at?: string;
  contacted_at?: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending:       '#6b7280',
  processing:    '#2563eb',
  completed:     '#16a34a',
  failed:        '#dc2626',
  manual_review: '#d97706',
  reviewed:      '#7c3aed',
  contacted:     '#0891b2',
};

const OPPORTUNITY_COLORS: Record<string, string> = {
  HOT:          '#dc2626',
  WARM:         '#ea580c',
  LOW_PRIORITY: '#6b7280',
};

const OPPORTUNITY_LABELS: Record<string, string> = {
  HOT:          '🔥 HOT',
  WARM:         '🟠 WARM',
  LOW_PRIORITY: '🔵 LOW',
};

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      background: color + '22',
      color,
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function ScoreBar({ score, max = 100 }: { score?: number; max?: number }) {
  if (score == null) return <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>;
  const pct = Math.round((score / max) * 100);
  const color = score >= 70 ? '#16a34a' : score >= 50 ? '#d97706' : '#dc2626';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 36 }}>{score}/{max}</span>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid password');
      }
    } catch {
      setError('Network error — try again');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 48px', width: '100%', maxWidth: 380 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#f2bf3a', marginBottom: 8 }}>BotNest</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: '#111827' }}>Audit Admin</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Authorized access only</p>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Admin password"
            autoFocus
            required
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, marginBottom: 12, boxSizing: 'border-box' }}
          />
          {error && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 10px' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: '#111827', color: '#fff', border: 'none', padding: '11px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </main>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AuditsAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Check if already authed (session cookie present and valid)
  useEffect(() => {
    fetch('/api/audits?limit=1')
      .then(r => {
        setAuthed(r.status !== 401);
      })
      .catch(() => setAuthed(false));
  }, []);

  const fetchAudits = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/audits?${params}`);
      if (res.status === 401) { setAuthed(false); return; }
      if (!res.ok) { setError('Failed to load audits'); setLoading(false); return; }
      const data = await res.json();
      setAudits(data.audits || []);
      setTotal(data.total || 0);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (authed) fetchAudits();
  }, [authed, fetchAudits]);

  async function updateStatus(auditId: string, status: string) {
    setActionMsg('Updating...');
    try {
      const res = await fetch(`/api/audits/${auditId}?action=status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) { setAuthed(false); return; }
      if (res.ok) {
        setActionMsg(`Marked as ${status}`);
        await fetchAudits();
        if (selected?.id === auditId) {
          const refreshed = await fetch(`/api/audits/${auditId}`);
          if (refreshed.ok) setSelected(await refreshed.json());
        }
      } else {
        setActionMsg('Update failed');
      }
    } catch {
      setActionMsg('Network error');
    }
  }

  async function reanalyze(auditId: string) {
    setActionMsg('Reanalysis queued...');
    try {
      const res = await fetch(`/api/audits/${auditId}?action=reanalyze`, { method: 'POST' });
      if (res.status === 401) { setAuthed(false); return; }
      setActionMsg(res.ok ? 'Reanalysis started — refresh in ~60s' : 'Failed to start reanalysis');
    } catch {
      setActionMsg('Network error');
    }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    setAuthed(false);
  }

  if (authed === null) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: '#6b7280' }}>Loading...</div>;
  }

  if (!authed) {
    return <LoginScreen onLogin={() => setAuthed(true)} />;
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Header */}
      <div style={{ background: '#111827', color: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ color: '#f2bf3a', fontWeight: 700, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase' }}>BotNest</span>
          <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: 13 }}>/ Growth Audit Admin</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #374151', background: '#1f2937', color: '#f9fafb', fontSize: 13 }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="manual_review">Manual Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="contacted">Contacted</option>
          </select>
          <button onClick={fetchAudits} style={{ background: '#374151', color: '#f9fafb', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            ↻ Refresh
          </button>
          <span style={{ color: '#6b7280', fontSize: 12 }}>{total} total</span>
          <button onClick={logout} style={{ background: 'none', border: '1px solid #374151', color: '#9ca3af', padding: '4px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
            Sign out
          </button>
        </div>
      </div>

      {actionMsg && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #fbbf24', padding: '8px 24px', fontSize: 13, color: '#92400e' }}>
          {actionMsg} <button onClick={() => setActionMsg('')} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', height: 'calc(100vh - 57px)' }}>
        {/* Audit List */}
        <div style={{ width: 380, flexShrink: 0, borderRight: '1px solid #e5e7eb', background: '#fff', overflowY: 'auto' }}>
          {loading && <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>Loading...</div>}
          {error && <div style={{ padding: 24, color: '#dc2626' }}>{error}</div>}
          {!loading && audits.length === 0 && <div style={{ padding: 24, color: '#6b7280', textAlign: 'center' }}>No audits found.</div>}
          {audits.map(audit => (
            <div
              key={audit.id}
              onClick={() => setSelected(audit)}
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                background: selected?.id === audit.id ? '#f0f9ff' : '#fff',
                borderLeft: selected?.id === audit.id ? '3px solid #2563eb' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>{audit.business_name}</div>
                <Badge label={audit.status} color={STATUS_COLORS[audit.status] || '#6b7280'} />
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audit.website_url}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {audit.website_growth_score != null && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: audit.website_growth_score >= 70 ? '#16a34a' : audit.website_growth_score >= 50 ? '#d97706' : '#dc2626' }}>
                    Score: {audit.website_growth_score}/100
                  </span>
                )}
                {audit.opportunity_label && (
                  <span style={{ fontSize: 11, color: OPPORTUNITY_COLORS[audit.opportunity_label] || '#6b7280', fontWeight: 700 }}>
                    {OPPORTUNITY_LABELS[audit.opportunity_label]}
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>
                  {new Date(audit.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Detail Panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af' }}>
              Select an audit to review
            </div>
          ) : (
            <div style={{ maxWidth: 760 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: '#111827' }}>{selected.business_name}</h2>
                  <a href={selected.website_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 14 }}>{selected.website_url}</a>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Badge label={selected.status} color={STATUS_COLORS[selected.status] || '#6b7280'} />
                  {selected.opportunity_label && <Badge label={OPPORTUNITY_LABELS[selected.opportunity_label]} color={OPPORTUNITY_COLORS[selected.opportunity_label] || '#6b7280'} />}
                </div>
              </div>

              {/* Contact */}
              <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  ['Contact', selected.contact_name],
                  ['Email', selected.email, `mailto:${selected.email}`],
                  ['Phone', selected.phone || '—'],
                  ['Business Type', selected.business_type || '—'],
                  ['Submitted', new Date(selected.created_at).toLocaleString()],
                  ['Completed', selected.completed_at ? new Date(selected.completed_at).toLocaleString() : '—'],
                ].map(([label, value, href]) => (
                  <div key={String(label)}>
                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
                    <div style={{ fontSize: 14 }}>
                      {href ? <a href={String(href)} style={{ color: '#2563eb' }}>{String(value)}</a> : String(value)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Scores */}
              {selected.website_growth_score != null && (
                <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#111827' }}>Scores</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Website Growth Score</div>
                      <ScoreBar score={selected.website_growth_score} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>BotNest Opportunity</div>
                      <ScoreBar score={selected.opportunity_score} />
                    </div>
                  </div>
                  {selected.category_scores && (
                    <div style={{ display: 'grid', gap: 8 }}>
                      {Object.entries(selected.category_scores).map(([key, val]: [string, any]) => (
                        <div key={key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#374151', fontWeight: 500, textTransform: 'capitalize' }}>{key.replace(/([A-Z])/g, ' $1')}</span>
                          <ScoreBar score={val.score} max={val.max} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Executive Summary */}
              {selected.executive_summary && (
                <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#78716c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Executive Summary</div>
                  <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>{selected.executive_summary}</p>
                </div>
              )}

              {/* Sales Angle — internal */}
              {selected.sales_angle && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#c2410c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>🎯 Sales Angle (Internal Only)</div>
                  <p style={{ fontSize: 14, color: '#431407', margin: 0, lineHeight: 1.6 }}>{selected.sales_angle}</p>
                  {selected.recommended_package && (
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: '#9a3412' }}>
                      Recommended: {selected.recommended_package.charAt(0).toUpperCase() + selected.recommended_package.slice(1)}
                    </div>
                  )}
                </div>
              )}

              {/* Findings */}
              {selected.findings && selected.findings.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#111827' }}>Top Findings</div>
                  {selected.findings.map((f: any, i: number) => (
                    <div key={i} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px', marginBottom: 10, borderLeft: `4px solid ${f.severity === 'high' ? '#dc2626' : f.severity === 'medium' ? '#d97706' : '#16a34a'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{i + 1}. {f.title}</span>
                        <span style={{ fontSize: 11, background: f.severity === 'high' ? '#fee2e2' : f.severity === 'medium' ? '#fef3c7' : '#f0fdf4', color: f.severity === 'high' ? '#dc2626' : f.severity === 'medium' ? '#d97706' : '#16a34a', padding: '2px 8px', borderRadius: 12, fontWeight: 700 }}>
                          {f.severity?.toUpperCase()} · {f.fact_type}
                        </span>
                      </div>
                      <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 4px' }}><b>Evidence:</b> {f.evidence}</p>
                      <p style={{ fontSize: 13, color: '#374151', margin: '0 0 4px' }}><b>Impact:</b> {f.business_impact}</p>
                      <p style={{ fontSize: 13, color: '#374151', margin: 0 }}><b>BotNest:</b> {f.botnest_solution}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Failure reason */}
              {selected.failure_reason && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Failure Reason</div>
                  <p style={{ fontSize: 13, color: '#991b1b', margin: 0 }}>{selected.failure_reason}</p>
                </div>
              )}

              {/* Actions */}
              <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14, color: '#111827' }}>Actions</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <a
                    href={`/api/audits/${selected.id}?action=report`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: '#111827', color: '#fff', padding: '8px 18px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                  >
                    View Report →
                  </a>
                  <button onClick={() => updateStatus(selected.id, 'reviewed')} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Mark Reviewed
                  </button>
                  <button onClick={() => updateStatus(selected.id, 'contacted')} style={{ background: '#0891b2', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Mark Contacted
                  </button>
                  <button onClick={() => reanalyze(selected.id)} style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                    Reanalyze
                  </button>
                  <a
                    href={`mailto:${selected.email}?subject=Your BotNest Website Growth Audit — ${encodeURIComponent(selected.business_name)}`}
                    style={{ background: '#16a34a', color: '#fff', padding: '8px 18px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}
                  >
                    Email Prospect
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
