import {
  FormEvent,
  useEffect,
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

  useEffect(() => {
    supabase.from('bots').select('*').then(({ data }) => setBots(data || []));
  }, []);

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

      const createBotResponse = await fetch(API_BASE_URL + '/api/create-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const createBotData = await createBotResponse.json();
      if (!createBotResponse.ok) {
        setCreateError(createBotData?.error || 'Failed to create bot');
        return;
      }

      if (!createBotData?.botId) {
        setCreateError('API response is missing botId');
        return;
      }

      const checkoutResponse = await fetch(API_BASE_URL + '/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: form.selectedPlan?.trim() || 'pro',
          botId: createBotData.botId,
        }),
      });

      const checkoutData = await checkoutResponse.json();
      if (!checkoutResponse.ok) {
        setCreateError(checkoutData?.error || 'Failed to create checkout session');
        return;
      }

      if (!checkoutData?.url) {
        setCreateError('Checkout response is missing url');
        return;
      }

      const { data: refreshedBots } = await supabase.from('bots').select('*');
      setBots(refreshedBots || []);

      window.location.href = checkoutData.url;
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
