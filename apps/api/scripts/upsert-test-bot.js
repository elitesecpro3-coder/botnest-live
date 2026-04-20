const path = require('path');
const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BOT_ID = process.env.BOT_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !BOT_ID) {
  console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BOT_ID.');
  process.exit(1);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const tenant = {
  id: BOT_ID,
  business_name: "Rick's AI Demo",
  welcome_message: 'Hey! I help businesses capture leads automatically.',
  system_prompt: 'You are a professional AI assistant that helps convert website visitors into leads.',
  booking_link: 'https://example.com',
};

async function upsertTestBot() {
  const { data: existing, error: fetchError } = await supabase
    .from('bots')
    .select('id')
    .eq('id', tenant.id)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('bots')
      .update(tenant)
      .eq('id', tenant.id);

    if (updateError) {
      throw updateError;
    }

    console.log('Updated tenant:', tenant.id);
    return;
  }

  const { error: insertError } = await supabase
    .from('bots')
    .insert(tenant);

  if (insertError) {
    throw insertError;
  }

  console.log('Inserted tenant:', tenant.id);
}

upsertTestBot().catch((err) => {
  console.error('Failed to upsert test tenant:', err.message || err);
  process.exit(1);
});
