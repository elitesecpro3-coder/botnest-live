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
    content: 'BotNest cung cấp hai gói dịch vụ cho thị trường Việt Nam. Gói Starter: $39 USD mỗi tháng (khoảng 999.000₫). Gói Pro: $79 USD mỗi tháng (khoảng 2.000.000₫). Thanh toán qua Stripe bằng USD. Bảo đảm hoàn tiền 5 ngày nếu không hài lòng. Không có hợp đồng dài hạn, hủy bất cứ lúc nào.',
  },
  {
    type: 'pricing',
    title: 'So Sánh Gói Starter và Pro — Việt Nam',
    content: 'Gói Starter ($39/tháng): chatbot cơ bản cho website, trả lời câu hỏi thường gặp, thu thập khách hàng tiềm năng đơn giản, nút đặt lịch tiêu chuẩn, giao diện mặc định, cài đặt nhanh. Gói Pro ($79/tháng): tất cả tính năng Starter cộng với thiết lập AI theo ngành nghề cụ thể, nút Đặt Lịch kết nối với link của bạn, thu thập tên, số điện thoại và email, gửi thông báo khách hàng tiềm năng qua email, hỗ trợ thiết lập ưu tiên, tư vấn quy trình tùy chỉnh.',
  },
  {
    type: 'faq',
    title: 'Giá BotNest bao nhiêu? (Việt Nam)',
    content: 'Tại thị trường Việt Nam, BotNest có hai mức giá: Gói Starter $39/tháng và Gói Pro $79/tháng. Đây là giá tính bằng USD. Bảo đảm hoàn tiền trong 5 ngày đầu. Không phí cài đặt, không hợp đồng dài hạn.',
  },
  {
    type: 'faq',
    title: 'BotNest có bảo đảm hoàn tiền không? (Việt Nam)',
    content: 'Có. BotNest bảo đảm hoàn tiền 5 ngày cho khách hàng Việt Nam. Nếu bạn không hài lòng trong 5 ngày đầu, liên hệ rick@bot-nest.com để được hoàn tiền đầy đủ. Không cần giải thích, không phí hủy.',
  },
  {
    type: 'faq',
    title: 'Cài đặt BotNest mất bao lâu?',
    content: 'BotNest có thể hoạt động trong vòng 5 phút. Sau khi đăng ký và thanh toán, bạn nhận email chứa mã nhúng — một dòng HTML. Dán vào website trước thẻ đóng </body> là chatbot AI của bạn hoạt động ngay lập tức. Không cần lập trình viên.',
  },
  {
    type: 'faq',
    title: 'BotNest có hỗ trợ đặt lịch tự động không?',
    content: 'Có. BotNest tích hợp với link đặt lịch của bạn (Calendly, Acuity hoặc bất kỳ URL nào). Khi khách sẵn sàng đặt lịch, chatbot hiển thị nút Đặt Lịch kết nối với lịch thực của bạn. Khách đặt trực tiếp — không cần bạn can thiệp.',
  },
  {
    type: 'faq',
    title: 'Tôi nhận thông báo khách hàng tiềm năng như thế nào?',
    content: 'Mỗi khi chatbot thu thập được thông tin khách hàng (tên, số điện thoại, email), BotNest gửi ngay thông báo qua email đến địa chỉ bạn đã cấu hình khi đăng ký. Bạn nhận được thông tin đầy đủ để liên hệ lại ngay.',
  },
  {
    type: 'policy',
    title: 'Bảo Đảm Hoàn Tiền 5 Ngày (Việt Nam)',
    content: 'BotNest cam kết hoàn tiền 5 ngày cho tất cả khách hàng thị trường Việt Nam. Nếu không hài lòng trong 5 ngày đầu, liên hệ rick@bot-nest.com để được hoàn tiền đầy đủ, không cần giải thích. Không có phí hủy, không hợp đồng dài hạn.',
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
