import './helpers/harness';

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { backend } from './helpers/harness';
import { createOrUpdateLead } from '../lib/supabaseClient';

const BOT_A = '11111111-1111-4111-8111-111111111111';
const BOT_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  backend.leads.length = 0;
  backend.writes.length = 0;
});

function ageLeadMinutes(id: string, minutesAgo: number) {
  const lead = backend.leads.find((l) => l.id === id);
  if (!lead) throw new Error('lead not found in fake backend');
  lead.created_at = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

describe('createOrUpdateLead — duplicate detection', () => {
  it('a first-time submission is inserted, not merged', async () => {
    const { row, isDuplicate } = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(isDuplicate, false);
    assert.equal(row.name, 'Jane Doe');
    assert.equal(backend.writes.filter((w) => w.table === 'leads' && w.method === 'POST').length, 1);
  });

  it('does NOT suppress two genuinely distinct leads (different phone and email)', async () => {
    const a = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    const b = await createOrUpdateLead({ bot_id: BOT_A, name: 'John Smith', phone: '5559876543', email: 'john@example.com', source: 'widget' });
    assert.equal(a.isDuplicate, false);
    assert.equal(b.isDuplicate, false);
    assert.notEqual(a.row.id, b.row.id);
    assert.equal(backend.leads.length, 2);
  });

  it('merges a same-bot, same-phone resubmission within the window instead of inserting a duplicate', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(second.isDuplicate, true);
    assert.equal(second.row.id, first.row.id, 'must return the SAME canonical lead, not a new one');
    assert.equal(backend.leads.length, 1, 'exactly one lead row must exist');
  });

  it('matches phone regardless of formatting ("(555) 123-4567" vs "5551234567" vs "+1 555 123 4567")', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '(555) 123-4567', source: 'widget' });
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '+1 555 123 4567', source: 'widget' });
    assert.equal(second.isDuplicate, true);
    assert.equal(second.row.id, first.row.id);
    // The originally stored format is untouched — dedupe never rewrites what's on disk.
    assert.equal(first.row.phone, '(555) 123-4567');
  });

  it('matches by email, case-insensitively, even if the phone differs', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551111111', email: 'Jane@Example.com', source: 'widget' });
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5552222222', email: 'jane@example.com', source: 'widget' });
    assert.equal(second.isDuplicate, true);
    assert.equal(second.row.id, first.row.id);
  });

  it('merges additional information into the canonical row instead of discarding it', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane', phone: '5551234567', source: 'widget' });
    const second = await createOrUpdateLead({
      bot_id: BOT_A,
      name: 'Jane Doe', // fuller name
      phone: '5551234567',
      email: 'jane@example.com', // new info the first submission didn't have
      industry: 'Dental',
      pain_points: ['after-hours calls'],
      intent_score: 8,
      source: 'widget',
    });
    assert.equal(second.isDuplicate, true);
    assert.equal(second.row.id, first.row.id);
    assert.equal(second.row.name, 'Jane Doe', 'keeps the fuller name');
    assert.equal((second.row as any).email, 'jane@example.com');
    assert.equal((second.row as any).industry, 'Dental');
    assert.deepEqual((second.row as any).pain_points, ['after-hours calls']);
    assert.equal((second.row as any).intent_score, 8);
  });

  it('does not overwrite an existing value with a shorter/emptier one', async () => {
    const first = await createOrUpdateLead({
      bot_id: BOT_A,
      name: 'Jane Doe',
      phone: '5551234567',
      email: 'jane@example.com',
      intent_score: 9,
      source: 'widget',
    });
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane', phone: '5551234567', intent_score: 3, source: 'widget' });
    assert.equal(second.isDuplicate, true);
    assert.equal(second.row.name, 'Jane Doe', 'does not replace the fuller name with a shorter one');
    assert.equal((second.row as any).email, 'jane@example.com', 'does not drop existing email');
    assert.equal((second.row as any).intent_score, 9, 'does not overwrite an existing intent score');
  });

  it('performs no write at all when the duplicate adds nothing new', async () => {
    await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    backend.writes.length = 0;
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(second.isDuplicate, true);
    assert.deepEqual(backend.writes, [], 'an identical resubmission must not issue an UPDATE at all');
  });

  it('does NOT merge the same phone across two different bots', async () => {
    const a = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    const b = await createOrUpdateLead({ bot_id: BOT_B, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(b.isDuplicate, false, 'a different business must get its own lead row for the same visitor');
    assert.notEqual(a.row.id, b.row.id);
  });

  it('does NOT merge a resubmission outside the dedupe window (30 minutes)', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    ageLeadMinutes(first.row.id, 31);
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(second.isDuplicate, false, 'a genuinely new visit later on should not be silently merged away');
    assert.equal(backend.leads.length, 2);
  });

  it('does merge just inside the window boundary', async () => {
    const first = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    ageLeadMinutes(first.row.id, 29);
    const second = await createOrUpdateLead({ bot_id: BOT_A, name: 'Jane Doe', phone: '5551234567', source: 'widget' });
    assert.equal(second.isDuplicate, true);
  });

  it('a lead with neither phone nor email is always inserted (nothing to match on)', async () => {
    const a = await createOrUpdateLead({ bot_id: BOT_A, name: 'Anonymous', source: 'widget' });
    const b = await createOrUpdateLead({ bot_id: BOT_A, name: 'Anonymous', source: 'widget' });
    assert.equal(a.isDuplicate, false);
    assert.equal(b.isDuplicate, false);
    assert.equal(backend.leads.length, 2);
  });
});
