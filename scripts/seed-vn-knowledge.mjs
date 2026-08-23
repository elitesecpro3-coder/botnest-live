import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load env from apps/api/.env
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../apps/api/.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL) { console.error('Missing SUPABASE_URL'); process.exit(1); }
if (!SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
if (!OPENAI_API_KEY) { console.error('Missing OPENAI_API_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const BOT_ID = '17319019-6de9-470f-ab05-fd4154fc7857';

const items = [
  {
    type: 'pricing',
    title: 'Bảng Giá BotNest — Thị Trường Việt Nam',
    content: 'BotNest cung cấp hai gói dịch vụ cho thị trường Việt Nam. Gói Starter: 499.000₫ mỗi tháng. Gói Pro: 999.000₫ mỗi tháng. Thanh toán qua Stripe bằng VND. Dùng thử miễn phí 14 ngày, bảo đảm hoàn tiền 15 ngày sau khi thanh toán. Không có hợp đồng dài hạn, hủy bất cứ lúc nào.',
  },
  {
    type: 'pricing',
    title: 'So Sánh Gói Starter và Pro — Việt Nam',
    content: 'Gói Starter (499.000₫/tháng): trợ lý AI trên website, trả lời câu hỏi thường gặp, thu thập khách hàng tiềm năng, hỗ trợ đặt lịch, thông báo khách qua email, cài đặt nhanh. Gói Pro (999.000₫/tháng): tất cả tính năng Starter cộng với quản lý đánh giá Google (Reputation Shield), AI soạn phản hồi đánh giá, nhiều địa điểm kinh doanh, hỗ trợ ưu tiên, quy trình phân loại khách nâng cao.',
  },
  {
    type: 'faq',
    title: 'Giá BotNest bao nhiêu? (Việt Nam)',
    content: 'Tại thị trường Việt Nam, BotNest có hai mức giá: Gói Starter 499.000₫/tháng và Gói Pro 999.000₫/tháng, thanh toán bằng VND qua Stripe. Dùng thử miễn phí 14 ngày. Không phí cài đặt, không hợp đồng dài hạn.',
  },
  {
    type: 'faq',
    title: 'BotNest có bảo đảm hoàn tiền không? (Việt Nam)',
    content: 'Có. BotNest cung cấp dùng thử miễn phí 14 ngày — hủy trước khi hết thử nghiệm và bạn không bị tính phí. Khách hàng đã thanh toán được bảo đảm hoàn tiền 15 ngày. Liên hệ rick@bot-nest.com để yêu cầu hoàn tiền, không cần giải thích.',
  },
  {
    type: 'faq',
    title: 'Cài đặt BotNest mất bao lâu?',
    content: 'BotNest có thể hoạt động trong vòng vài phút. Sau khi đăng ký, bạn nhận mã nhúng — một dòng HTML. Dán vào website trước thẻ đóng </body> là trợ lý AI của bạn hoạt động ngay lập tức. Không cần lập trình viên.',
  },
  {
    type: 'faq',
    title: 'BotNest có hỗ trợ đặt lịch tự động không?',
    content: 'Có. BotNest tích hợp với link đặt lịch của bạn (Calendly, Acuity hoặc bất kỳ URL nào). Khi khách sẵn sàng đặt lịch, trợ lý hướng khách đến link đặt lịch thực của bạn. Khách đặt trực tiếp — không cần bạn can thiệp.',
  },
  {
    type: 'faq',
    title: 'Tôi nhận thông báo khách hàng tiềm năng như thế nào?',
    content: 'Mỗi khi trợ lý thu thập được thông tin khách hàng (tên, số điện thoại, email), BotNest gửi ngay thông báo qua email đến địa chỉ bạn đã cấu hình khi đăng ký. Bạn nhận được thông tin đầy đủ để liên hệ lại ngay.',
  },
  {
    type: 'policy',
    title: 'Chính Sách Hoàn Tiền BotNest (Việt Nam)',
    content: 'BotNest cung cấp dùng thử miễn phí 14 ngày cho tất cả khách hàng mới. Hủy trong thời gian dùng thử và bạn không bị tính phí. Khách hàng đã thanh toán được bảo đảm hoàn tiền 15 ngày. Liên hệ rick@bot-nest.com để yêu cầu hoàn tiền. Không có phí hủy, không hợp đồng dài hạn.',
  },
];

const TOTAL = items.length;
let successCount = 0;

console.log(`\nSeeding ${TOTAL} Vietnamese knowledge items for bot ${BOT_ID}\n`);

for (const item of items) {
  // Delete any existing record with the same bot_id + title to allow re-runs
  const { error: deleteErr } = await supabase
    .from('knowledge_items')
    .delete()
    .eq('bot_id', BOT_ID)
    .eq('title', item.title);

  if (deleteErr) {
    console.error(`  [${item.type}] ${item.title} — delete failed: ${deleteErr.message}`);
    continue;
  }

  // Insert new record
  const { data: inserted, error: insertErr } = await supabase
    .from('knowledge_items')
    .insert({
      bot_id: BOT_ID,
      type: item.type,
      title: item.title,
      content: item.content,
      metadata: { source: 'vn_seed', language: 'vi' },
      is_active: true,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error(`  [${item.type}] ${item.title} — insert failed: ${insertErr.message}`);
    continue;
  }

  // Generate embedding
  const text = `${item.title}\n${item.content}`.trim().slice(0, 8000);
  let embedding;
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    embedding = res.data[0].embedding;
  } catch (embErr) {
    console.error(`  [${item.type}] ${item.title} — embedding failed: ${embErr.message}`);
    continue;
  }

  // Update record with embedding
  const { error: updateErr } = await supabase
    .from('knowledge_items')
    .update({ embedding: `[${embedding.join(',')}]` })
    .eq('id', inserted.id);

  if (updateErr) {
    console.error(`  [${item.type}] ${item.title} — embedding update failed: ${updateErr.message}`);
    continue;
  }

  console.log(`  [${item.type}] ${item.title} — OK`);
  successCount++;
}

console.log(`\nSeeded ${successCount}/${TOTAL} items successfully\n`);

// Verify: count items with embeddings for this bot
const { count: embeddedCount } = await supabase
  .from('knowledge_items')
  .select('*', { count: 'exact', head: true })
  .eq('bot_id', BOT_ID)
  .not('embedding', 'is', null);

console.log(`Items with embeddings in DB for this bot: ${embeddedCount}`);
