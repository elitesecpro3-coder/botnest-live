import {
  useEffect,
  useState,
} from 'react';

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function Home() {
  const [bots, setBots] = useState<any[]>([]);
  useEffect(() => {
    supabase.from('bots').select('*').then(({ data }) => setBots(data || []));
  }, []);
  return (
    <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>BotNest Admin</h1>
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
