// Webhook Zalo Bot:
//  - Nhắn riêng "LINK <mã>" để liên kết tài khoản web với Zalo (bot sẽ nhắn riêng dự đoán)
//  - Nhắn "/id" để lấy chat_id (dùng khi cài ZALO_CHAT_ID)
const E = process.env;
const findMsg = o => {
  if (!o || typeof o !== "object") return null;
  if (o.chat && o.chat.id) return o;
  for (const k of Object.keys(o)) { const r = findMsg(o[k]); if (r) return r; }
  return null;
};
// ---- Trả lời tự động từ Google Sheet (cột A: từ khóa, cột B: câu trả lời) ----
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
function parseCsv(t) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
let FAQ = { t: 0, rows: [] };
async function faqRows() {
  if (!E.FAQ_SHEET_CSV_URL) return [];
  if (Date.now() - FAQ.t < 60000) return FAQ.rows;
  try {
    const r = await fetch(E.FAQ_SHEET_CSV_URL, { redirect: "follow" });
    if (!r.ok) return FAQ.rows;
    const rows = parseCsv(await r.text()).slice(1).filter(x => x[0] && x[1])
      .map(x => ({ kw: x[0].split(/[,;\n]/).map(norm).filter(Boolean), ans: x[1].trim() }));
    FAQ = { t: Date.now(), rows };
  } catch (x) { /* giữ bản cũ */ }
  return FAQ.rows;
}
function faqMatch(text, rows) {
  const t = " " + norm(text) + " ";
  let best = null, len = 0;
  rows.forEach(r => r.kw.forEach(k => { if (t.includes(" " + k + " ") && k.length > len) { len = k.length; best = r; } }));
  return best;
}

const send = (chat_id, text) => fetch(`https://bot-api.zaloplatforms.com/bot${E.ZALO_BOT_TOKEN}/sendMessage`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id, text })
});
module.exports = async (req, res) => {
  if (!E.CRON_SECRET || req.headers["x-bot-api-secret-token"] !== E.CRON_SECRET) return res.status(401).json({ ok: false });
  try {
    const m = findMsg(req.body);
    if (m) {
      const chat = m.chat, text = String(m.text || "").trim();
      const priv = String(chat.chat_type || "").toUpperCase() === "PRIVATE";
      const link = text.match(/^\/?link\s+([A-Za-z0-9]{4,16})/i);
      if (/^\/?id\b/i.test(text)) {
        await send(chat.id, `chat_id: ${chat.id}\nLoại: ${chat.chat_type || "?"}`);
      } else if (link && priv) {
        const r = await fetch(`${E.SUPABASE_URL}/rest/v1/rpc/link_zalo`, {
          method: "POST",
          headers: { apikey: E.SUPABASE_ANON_KEY, Authorization: "Bearer " + E.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ p_code: link[1], p_chat: String(chat.id) })
        });
        const ok = r.ok && (await r.json()) === true;
        await send(chat.id, ok ? "✅ Đã liên kết Zalo với tài khoản của bạn. Bot sẽ nhắn riêng phần dự đoán và kết quả cho bạn!" : "❌ Mã không đúng hoặc đã hết hạn (15 phút). Bạn vào web, tab Cầu thủ, bấm \"Lấy mã liên kết Zalo\" để lấy mã mới nhé.");
      } else if (priv || text) {
        const hit = faqMatch(text, await faqRows());
        if (hit) await send(chat.id, hit.ans.replace(/\{link\}/gi, E.SITE_URL || ""));
        else if (priv) await send(chat.id, "Xin chào! Mình chưa hiểu câu hỏi này. Bạn thử hỏi: lịch đấu, bảng xếp hạng, cách đăng ký... Để nhận tin dự đoán riêng, vào web giải đấu, tab Cầu thủ, bấm \"Lấy mã liên kết Zalo\" rồi nhắn mình: LINK <mã>");
      }
    }
  } catch (x) {}
  return res.status(200).json({ ok: true });
};
