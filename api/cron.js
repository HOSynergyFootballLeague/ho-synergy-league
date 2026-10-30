// Bot Zalo HO Synergy League - chạy mỗi sáng 8:00 (giờ VN) qua Vercel Cron
const T = ["Mượt mà", "Hài vãi", "Phòng kính", "VPS United", "Platform", "Lá chắn"];
const E = process.env;
const MIN = 7; // số người đăng ký tối thiểu mỗi đội
const PR_RIGHT = 1, PR_EXACT = 3; // thưởng 🍺 khi dự đoán đúng kết quả / đúng tỷ số
const fd = s => s.slice(8, 10) + "/" + s.slice(5, 7);

const sbGet = async (table, extra = "") => {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${table}?select=*${extra}`, {
    headers: { apikey: E.SUPABASE_ANON_KEY, Authorization: "Bearer " + E.SUPABASE_ANON_KEY }
  });
  if (!r.ok) throw new Error(table + ": " + (await r.text()));
  return r.json();
};
const sbRpc = async (fn, body = {}) => {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: E.SUPABASE_ANON_KEY, Authorization: "Bearer " + E.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(fn + ": " + (await r.text()));
  return r.json();
};
const zalo = async (method, body) => {
  const r = await fetch(`https://bot-api.zaloplatforms.com/bot${E.ZALO_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {})
  });
  return r.json();
};

let EV = [];
function standings(ms) {
  const t = T.map((n, i) => ({ i, p: 0, w: 0, d: 0, gf: 0, ga: 0, cd: 0 }));
  EV.forEach(x => { if (x.type === "y") t[x.team].cd += 1; else if (x.type === "r") t[x.team].cd += 3; });
  ms.forEach(m => {
    if (m.hg == null || m.ag == null) return;
    const H = t[m.home], A = t[m.away];
    H.p++; A.p++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
    if (m.hg > m.ag) H.w++; else if (m.hg < m.ag) A.w++; else { H.d++; A.d++; }
  });
  t.forEach(x => { x.gd = x.gf - x.ga; x.pt = x.w * 3 + x.d; });
  const h2 = (i, j) => {
    const m = ms.find(m => m.hg != null && m.ag != null && ((m.home === i && m.away === j) || (m.home === j && m.away === i)));
    if (!m) return 0; const d = m.hg - m.ag; if (!d) return 0;
    return (m.home === i) === (d > 0) ? -1 : 1;
  };
  return t.sort((a, b) => b.pt - a.pt || b.gd - a.gd || h2(a.i, b.i) || a.cd - b.cd || b.gf - a.gf);
}
const rankText = ms => "🏆 Bảng xếp hạng:\n" + standings(ms).map((x, k) =>
  `${k + 1}. ${T[x.i]}: ${x.pt} điểm (${x.p} trận, HS ${x.gd > 0 ? "+" : ""}${x.gd})`).join("\n");
const link = "👉 Xem chi tiết: " + (E.SITE_URL || "");

function remind(day, today, all) {
  return `⚽ HO SYNERGY LEAGUE 2026\n📅 Hôm nay (${fd(today)}) có ${day.length} trận:\n` +
    day.map((m, k) => `${k + 1}. ${T[m.home]} vs ${T[m.away]}${m.referee ? " (Trọng tài: " + m.referee + ")" : ""}`).join("\n") +
    "\n\n" + rankText(all) + "\n\n" + link;
}

const outcome = m => (m.hg > m.ag ? "h" : m.hg < m.ag ? "a" : "d");
const hasScore = p => p.pred_home != null && p.pred_away != null;
const wOf = p => p.winner || (hasScore(p) ? (p.pred_home > p.pred_away ? "h" : p.pred_home < p.pred_away ? "a" : "d") : null);
const pscore = (p, m) => {
  if (!m || m.hg == null || m.ag == null) return 0;
  if (hasScore(p) && p.pred_home === m.hg && p.pred_away === m.ag) return PR_EXACT;
  return wOf(p) === outcome(m) ? PR_RIGHT : 0;
};
const pdesc = (p, m) => {
  const w = wOf(p), parts = [];
  if (w) parts.push(w === "h" ? `${T[m.home]} thắng` : w === "a" ? `${T[m.away]} thắng` : "Hòa");
  if (hasScore(p)) parts.push(`tỷ số ${p.pred_home}-${p.pred_away}`);
  return parts.join(", ") || "—";
};

function predText(day, preds) {
  const lines = [];
  day.forEach(m => {
    const ps = preds.filter(p => p.match_id === m.id);
    if (!ps.length) return;
    const exact = ps.filter(p => pscore(p, m) === PR_EXACT).map(p => p.name);
    const right = ps.filter(p => pscore(p, m) === PR_RIGHT).map(p => p.name);
    let l = `⚽ ${T[m.home]} ${m.hg}-${m.ag} ${T[m.away]} (${exact.length + right.length}/${ps.length} người đoán đúng)`;
    if (exact.length) l += `\n🎯 Đúng tỷ số (+${PR_EXACT}🍺): ${exact.join(", ")}`;
    if (right.length) l += `\n✅ Đúng kết quả (+${PR_RIGHT}🍺): ${right.join(", ")}`;
    if (!exact.length && !right.length) l += `\n😅 Chưa ai đoán đúng`;
    lines.push(l);
  });
  if (!lines.length) return "";
  return "🔮 DỰ ĐOÁN - Chúc mừng các nhà tiên tri!\n" + lines.join("\n");
}

// Tin nhắn riêng cho từng người đã liên kết Zalo
function dmRemind(todays, mine) {
  const lines = todays.map(m => { const p = mine.find(x => x.match_id === m.id); return p ? `⚽ ${T[m.home]} vs ${T[m.away]}: ${pdesc(p, m)}` : null; }).filter(Boolean);
  return lines.length ? `🔮 Hôm nay bạn đã dự đoán:\n${lines.join("\n")}\nChúc bạn may mắn! 🍀` : null;
}
function dmRecap(day, mine, all) {
  const lines = day.map(m => {
    const p = mine.find(x => x.match_id === m.id);
    if (!p) return null;
    const s = pscore(p, m);
    return `⚽ ${T[m.home]} ${m.hg}-${m.ag} ${T[m.away]}\n   Bạn dự đoán: ${pdesc(p, m)}\n   ${s === PR_EXACT ? `🎯 Đúng tỷ số! +${PR_EXACT}🍺` : s === PR_RIGHT ? `✅ Đúng kết quả! +${PR_RIGHT}🍺` : "❌ Chưa đúng lần này"}`;
  }).filter(Boolean);
  if (!lines.length) return null;
  const total = mine.reduce((a, p) => a + pscore(p, all.find(m => m.id === p.match_id)), 0);
  return `🔮 KẾT QUẢ DỰ ĐOÁN CỦA BẠN\n${lines.join("\n")}\n\n🍺 Tổng thưởng dự đoán của bạn: ${total}🍺 (không tính vào giá trị chuyển nhượng)\n${link}`;
}

function recap(day, yest, all, events, preds = []) {
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
  const goals = {}, cards = {}, owng = [];
  ev.forEach(x => {
    const k = `${x.player} (${T[x.team]})`;
    if (x.type === "g") goals[k] = (goals[k] || 0) + 1;
    else if (x.type === "og") owng.push(k);
    else if (x.type === "y" || x.type === "r") { cards[k] = cards[k] || { y: 0, r: 0 }; cards[k][x.type]++; }
  });
  const g = Object.entries(goals);
  if (g.length) s += `\n\n🥅 Cầu thủ ghi bàn: ` + g.map(([k, c]) => k + (c > 1 ? ` x${c}` : "")).join(", ") + ". Chúc mừng các cầu thủ! 👏";
  if (owng.length) s += `\n🙈 Phản lưới: ` + owng.join(", ") + ".";
  const c = Object.entries(cards);
  if (c.length) s += `\n🟨🟥 Thẻ phạt: ` + c.map(([k, v]) => k + " " + (v.y ? "🟨".repeat(v.y) : "") + (v.r ? "🟥".repeat(v.r) : "")).join(", ");
  const pt = predText(day, preds);
  if (pt) s += "\n\n" + pt;
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
    EV = events;
    if (q.mode === "friday") {
      const up = all.filter(m => m.hg == null && m.match_date >= today).sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id));
      if (!up.length) return res.status(200).json({ today, sent: 0, note: "Không còn trận sắp tới" });
      const day = up[0].match_date, ms = up.filter(m => m.match_date === day);
      const [att, prof] = await Promise.all([sbGet("attendance"), sbGet("profiles")]);
      const team = Object.fromEntries(prof.map(p => [p.id, p.team]));
      const cnt = (mid, tm) => att.filter(a => a.match_id === mid && team[a.user_id] === tm).length;
      const low = [];
      let s = `📋 ĐĂNG KÝ THAM GIA TRẬN ĐẤU\n📅 Ngày ${fd(day)}:`;
      ms.forEach(m => {
        s += `\n\n${T[m.home]} vs ${T[m.away]}`;
        [m.home, m.away].forEach(tm => {
          const n = cnt(m.id, tm);
          s += `\n• ${T[tm]}: ${n} người ${n < MIN ? "⚠️" : "✅"}`;
          if (n < MIN) low.push(`${T[tm]} (${n}/${MIN})`);
        });
      });
      s += low.length
        ? `\n\n📢 ${low.join(", ")} đang đăng ký dưới ${MIN} người. Các bạn vào web đăng ký tham gia sớm nhé!`
        : `\n\n🎉 Các đội đều đủ từ ${MIN} người đăng ký. Hẹn gặp ở sân!`;
      s += "\n\n👉 Đăng ký tại: " + (E.SITE_URL || "");
      if (q.dry) return res.status(200).json({ today, messages: [s] });
      return res.status(200).json({ today, sent: 1, results: [await zalo("sendMessage", { chat_id: E.ZALO_CHAT_ID, text: s })] });
    }
    const msgs = [], dms = [];
    const todays = all.filter(m => m.match_date === today);
    const ydone = all.filter(m => m.match_date === yest && m.hg != null && m.ag != null);
    let preds = [];
    if ((q.mode !== "recap" && todays.length) || (q.mode !== "remind" && ydone.length)) {
      try { preds = await sbRpc("bot_predictions", { p_secret: E.CRON_SECRET }); }
      catch (x) { try { preds = await sbRpc("finished_predictions"); } catch (y) { /* chưa tạo hàm SQL: bỏ qua phần dự đoán */ } }
    }
    const byUser = {};
    preds.forEach(p => { if (p.chat_id) (byUser[p.user_id] = byUser[p.user_id] || { chat_id: p.chat_id, list: [] }).list.push(p); });
    if (q.mode !== "recap" && todays.length) {
      msgs.push(remind(todays, today, all));
      Object.values(byUser).forEach(u => { const t = dmRemind(todays, u.list); if (t) dms.push({ chat_id: u.chat_id, text: t }); });
    }
    if (q.mode !== "remind" && ydone.length) {
      msgs.push(recap(ydone, yest, all, events, preds));
      Object.values(byUser).forEach(u => { const t = dmRecap(ydone, u.list, all); if (t) dms.push({ chat_id: u.chat_id, text: t }); });
    }
    if (q.dry) return res.status(200).json({ today, messages: msgs, dms: dms.map(d => d.text) });
    const results = [];
    for (const text of msgs) results.push(await zalo("sendMessage", { chat_id: E.ZALO_CHAT_ID, text }));
    const dmResults = [];
    for (const d of dms) dmResults.push((await zalo("sendMessage", d)).ok);
    return res.status(200).json({ today, sent: msgs.length, dmSent: dmResults.filter(Boolean).length, dmFailed: dmResults.filter(x => !x).length, results });
  } catch (x) {
    return res.status(500).json({ error: String(x.message || x) });
  }
};
