// Webhook tạm: ai nhắn bot (chat riêng hoặc trong nhóm) thì bot trả lại chat_id để cài ZALO_CHAT_ID
const E = process.env;
const find = o => {
  if (!o || typeof o !== "object") return null;
  if (o.chat && o.chat.id) return o.chat;
  for (const k of Object.keys(o)) { const r = find(o[k]); if (r) return r; }
  return null;
};
module.exports = async (req, res) => {
  if (!E.CRON_SECRET || req.headers["x-bot-api-secret-token"] !== E.CRON_SECRET) return res.status(401).json({ ok: false });
  try {
    const chat = find(req.body);
    if (chat) {
      await fetch(`https://bot-api.zaloplatforms.com/bot${E.ZALO_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chat.id, text: `chat_id: ${chat.id}\nLoại: ${chat.chat_type || "?"}` })
      });
    }
  } catch (x) {}
  return res.status(200).json({ ok: true });
};
