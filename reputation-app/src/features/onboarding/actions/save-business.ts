'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

import { createSupabaseServerClient } from '@/libs/supabase/supabase-server-client';

const BusinessSchema = z.object({
  name:               z.string().min(1, 'Business name is required').max(120),
  website:            z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  google_profile_url: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
  contact_email:      z.string().email('Enter a valid email').or(z.literal('')).optional(),
  contact_phone:      z.string().max(30).optional(),
  industry:           z.string().max(80).optional(),
  address:            z.string().max(200).optional(),
  city:               z.string().max(80).optional(),
  state:              z.string().max(60).optional(),
  zip:                z.string().max(20).optional(),
});

export type SaveBusinessState = {
  error?: string;
  fieldErrors?: Partial<Record<string, string>>;
};

export async function saveBusiness(
  _prevState: SaveBusinessState,
  formData: FormData
): Promise<SaveBusinessState> {
  const raw = {
    name:               formData.get('name'),
    website:            formData.get('website'),
    google_profile_url: formData.get('google_profile_url'),
    contact_email:      formData.get('contact_email'),
    contact_phone:      formData.get('contact_phone'),
    industry:           formData.get('industry'),
    address:            formData.get('address'),
    city:               formData.get('city'),
    state:              formData.get('state'),
    zip:                formData.get('zip'),
  };

  const parsed = BusinessSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = msgs?.[0] ?? 'Invalid';
    }
    return { fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const db = supabase as any; // Supabase types don't infer custom table mutations

  const existingRes = await db
    .from('businesses')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const existing = existingRes.data as { id: string } | null;

  const { name, website, google_profile_url, contact_email, contact_phone, industry,
          address, city, state, zip } = parsed.data;

  let businessId: string;

  if (existing) {
    const { error } = await db
      .from('businesses')
      .update({
        name, website, google_profile_url, contact_email, contact_phone, industry,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    if (error) return { error: error.message };
    businessId = existing.id;
  } else {
    const insertRes = await db
      .from('businesses')
      .insert({
        user_id: user.id,
        name, website, google_profile_url, contact_email, contact_phone, industry,
        onboarding_completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (insertRes.error || !insertRes.data) return { error: insertRes.error?.message ?? 'Failed to create business' };
    businessId = (insertRes.data as { id: string }).id;
  }

  // Upsert primary location
  const { error: locError } = await db
    .from('business_locations')
    .upsert({
      business_id: businessId,
      user_id: user.id,
      name: 'Primary Location',
      address, city, state, zip,
      is_primary: true,
    }, { onConflict: 'business_id,is_primary' });

  if (locError) return { error: locError.message };

  redirect('/dashboard');
}
