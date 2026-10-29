// Bot Zalo HO Synergy League - chạy mỗi sáng 8:00 (giờ VN) qua Vercel Cron
const T = ["Mượt mà", "Hài vãi", "Phòng kính", "VPS United", "Platform", "Lá chắn"];
const E = process.env;
const fd = s => s.slice(8, 10) + "/" + s.slice(5, 7);

const sbGet = async (table, extra = "") => {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${table}?select=*${extra}`, {
    headers: { apikey: E.SUPABASE_ANON_KEY, Authorization: "Bearer " + E.SUPABASE_ANON_KEY }
  });
  if (!r.ok) throw new Error(table + ": " + (await r.text()));
  return r.json();
};
const zalo = async (method, body) => {
  const r = await fetch(`https://bot-api.zaloplatforms.com/bot${E.ZALO_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
  });
  return r.json();
};

function standings(ms) {
  const t = T.map((n, i) => ({ i, p: 0, w: 0, d: 0, gf: 0, ga: 0 }));
  ms.forEach(m => {
    if (m.hg == null || m.ag == null) return;
    const H = t[m.home], A = t[m.away];
    H.p++; A.p++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
    if (m.hg > m.ag) H.w++; else if (m.hg < m.ag) A.w++; else { H.d++; A.d++; }
  });
  t.forEach(x => { x.gd = x.gf - x.ga; x.pt = x.w * 3 + x.d; });
  return t.sort((a, b) => b.pt - a.pt || b.gd - a.gd || b.gf - a.gf);
}
const rankText = ms => "🏆 Bảng xếp hạng:\n" + standings(ms).map((x, k) =>
  `${k + 1}. ${T[x.i]}: ${x.pt} điểm (${x.p} trận, HS ${x.gd > 0 ? "+" : ""}${x.gd})`).join("\n");
const link = "👉 Xem chi tiết: " + (E.SITE_URL || "");

function remind(day, today, all) {
  return `⚽ HO SYNERGY LEAGUE 2026\n📅 Hôm nay (${fd(today)}) có ${day.length} trận:\n` +
    day.map((m, k) => `${k + 1}. ${T[m.home]} vs ${T[m.away]}${m.referee ? " (Trọng tài: " + m.referee + ")" : ""}`).join("\n") +
    "\n\n" + rankText(all) + "\n\n" + link;
}

function recap(day, yest, all, events) {
  const ids = new Set(day.map(m => m.id));
  let s = `📣 KẾT QUẢ NGÀY ${fd(yest)}\n` + day.map(m => `⚽ ${T[m.home]} ${m.hg} - ${m.ag} ${T[m.away]}`).join("\n");
  const wins = [], draws = [];
  day.forEach(m => {
    if (m.hg > m.ag) wins.push(T[m.home]); else if (m.hg < m.ag) wins.push(T[m.away]);
    else draws.push(`${T[m.home]} và ${T[m.away]}`);
  });
  if (wins.length) s += `\n\n🎉 Chúc mừng ${wins.join(", ")} giành chiến thắng!`;
  if (draws.length) s += `\n🤝 ${draws.join("; ")} chia điểm.`;
  const ev = events.filter(x => ids.has(x.match_id));
  const goals = {}, cards = {};
  ev.forEach(x => {
    const k = `${x.player} (${T[x.team]})`;
    if (x.type === "g") goals[k] = (goals[k] || 0) + 1;
    else { cards[k] = cards[k] || { y: 0, r: 0 }; cards[k][x.type]++; }
  });
  const g = Object.entries(goals);
  if (g.length) s += `\n\n🥅 Cầu thủ ghi bàn: ` + g.map(([k, c]) => k + (c > 1 ? ` x${c}` : "")).join(", ") + ". Chúc mừng các cầu thủ! 👏";
  const c = Object.entries(cards);
  if (c.length) s += `\n🟨🟥 Thẻ phạt: ` + c.map(([k, v]) => k + " " + (v.y ? "🟨".repeat(v.y) : "") + (v.r ? "🟥".repeat(v.r) : "")).join(", ");
  return s + "\n\n" + rankText(all) + "\n\n" + link;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const okAuth = E.CRON_SECRET && (req.headers.authorization === `Bearer ${E.CRON_SECRET}` || q.key === E.CRON_SECRET);
  if (!okAuth) return res.status(401).json({ error: "unauthorized" });
  try {
    if (q.mode === "updates") return res.status(200).json(await zalo("getUpdates", { timeout: "5" }));
    if (q.mode === "webhookinfo") return res.status(200).json(await zalo("getWebhookInfo"));
    if (q.mode === "setwebhook") return res.status(200).json(await zalo("setWebhook", { url: E.SITE_URL.replace(/\/$/, "") + "/api/hook", secret_token: E.CRON_SECRET }));
    if (q.mode === "delwebhook") return res.status(200).json(await zalo("deleteWebhook"));
    const today = q.date || new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    const yest = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
    const [all, events] = await Promise.all([sbGet("matches", "&order=round,id"), sbGet("events")]);
    const msgs = [];
    const todays = all.filter(m => m.match_date === today);
    const ydone = all.filter(m => m.match_date === yest && m.hg != null && m.ag != null);
    if (q.mode !== "recap" && todays.length) msgs.push(remind(todays, today, all));
    if (q.mode !== "remind" && ydone.length) msgs.push(recap(ydone, yest, all, events));
    if (q.dry) return res.status(200).json({ today, messages: msgs });
    const results = [];
    for (const text of msgs) results.push(await zalo("sendMessage", { chat_id: E.ZALO_CHAT_ID, text }));
    return res.status(200).json({ today, sent: msgs.length, results });
  } catch (x) {
    return res.status(500).json({ error: String(x.message || x) });
  }
};
