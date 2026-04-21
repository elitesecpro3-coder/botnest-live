import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://botnest-live-production.up.railway.app';

type CreateBotForm = {
  id?: string;
  businessName: string;
  website: string;
  bookingLink: string;
  tone: string;
  selectedPlan: string;
  industry?: string;
  description?: string;
};

export default function Home() {
  const [bots, setBots] = useState<any[]>([]);
  const [form, setForm] = useState<CreateBotForm>({
    businessName: '',
    website: '',
    bookingLink: '',
    tone: '',
    selectedPlan: 'pro',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdBotId, setCreatedBotId] = useState('');

  useEffect(() => {
    supabase.from('bots').select('*').then(({ data }) => setBots(data || []));
  }, []);

  const embedCode = useMemo(() => {
    if (!createdBotId) return '';
    return `<script src="${API_BASE_URL}/widget.js"\n  data-bot-id="${createdBotId}"\n  data-api-url="${API_BASE_URL}">\n</script>`;
  }, [createdBotId]);

  async function onCreateBot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      const payload: {
        id?: string;
        business_name: string;
        website: string;
        booking_link: string;
        tone: string;
        selected_plan: string;
        industry?: string;
        description?: string;
      } = {
        business_name: form.businessName?.trim() ?? '',
        website: form.website?.trim() ?? '',
        booking_link: form.bookingLink?.trim() ?? '',
        tone: form.tone?.trim() || 'professional',
        selected_plan: form.selectedPlan?.trim() || 'pro',
      };

      const industry = form.industry?.trim();
      const description = form.description?.trim();

      if (industry) {
        payload.industry = industry;
      }

      if (description) {
        payload.description = description;
      }

      delete payload.id;

      const response = await fetch(API_BASE_URL + '/api/createBot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        setCreateError(data?.error || 'Failed to create bot');
        return;
      }

      if (!data?.botId) {
        setCreateError('API response is missing botId');
        return;
      }

      setCreatedBotId(data.botId);
      const { data: refreshedBots } = await supabase.from('bots').select('*');
      setBots(refreshedBots || []);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create bot');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>BotNest Admin</h1>
      <h2>Create Bot</h2>
      <form onSubmit={onCreateBot} style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
        <input
          placeholder="Business name"
          value={form.businessName}
          onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
          required
        />
        <input
          placeholder="Website URL"
          value={form.website}
          onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
          required
        />
        <input
          placeholder="Booking link"
          value={form.bookingLink}
          onChange={(e) => setForm((prev) => ({ ...prev, bookingLink: e.target.value }))}
          required
        />
        <input
          placeholder="Tone (friendly, professional, etc.)"
          value={form.tone}
          onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}
          required
        />
        <button type="submit" disabled={isCreating}>
          {isCreating ? 'Creating...' : 'Create Bot'}
        </button>
      </form>

      {createError ? (
        <p style={{ color: '#b91c1c' }}>{createError}</p>
      ) : null}

      {createdBotId ? (
        <section style={{ marginBottom: 30 }}>
          <h3>Embed Code</h3>
          <p>Use this script on your website:</p>
          <textarea
            readOnly
            value={embedCode}
            style={{ width: '100%', minHeight: 110, fontFamily: 'monospace' }}
          />
        </section>
      ) : null}

      <h2>Bots</h2>
      <ul>
        {bots.map(bot => (
          <li key={bot.id}><b>{bot.name}</b> ({bot.slug})<br/>{bot.prompt}</li>
        ))}
      </ul>
      <p style={{marginTop:40, color:'#888'}}>Lean MVP. No auth. Add bots in Supabase directly.</p>
    </main>
  );
}
