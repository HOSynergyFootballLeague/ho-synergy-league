// Trả lời câu hỏi tự nhiên của người dùng bằng dữ liệu thật (xếp hạng, lịch, vua phá lưới...)
const { T, standings } = require("./core.js");
const { weatherText } = require("./weather.js");

const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const fd = s => s.slice(8, 10) + "/" + s.slice(5, 7);
const hdr = E => ({ apikey: E.SUPABASE_ANON_KEY, Authorization: "Bearer " + E.SUPABASE_ANON_KEY, "Content-Type": "application/json" });
const sbGet = async (E, table, extra = "") => {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/${table}?select=*${extra}`, { headers: hdr(E) });
  if (!r.ok) throw new Error(table);
  return r.json();
};
const rpc = async (E, fn, body) => {
  const r = await fetch(`${E.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr(E), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(fn);
  return r.json();
};

const INTENT = {
  rank: ["hang may", "thu may", "hang bao nhieu", "xep hang", "xep thu may", "dung thu", "dung hang", "vi tri nao", "bxh", "hang nao", "thu hang", "bang xep hang"],
  next: ["tran tiep theo", "tran ke tiep", "tran sap toi", "tran toi", "khi nao da", "bao gio da", "luc nao da", "da khi nao", "da voi ai", "gap ai", "doi thu"],
  weather: ["thoi tiet", "du bao", "troi mua", "co mua khong", "mua khong", "mua ko", "troi nang", "nang khong", "troi nong", "troi lanh", "nhiet do", "bao nhieu do"],
  result: ["ty so", "ti so", "ket qua", "ai thang", "ai thua", "thang thua", "da xong chua", "ra sao roi"],
  scorer: ["vua pha luoi", "pha luoi", "ghi nhieu ban", "ghi ban nhieu", "top ghi ban", "ai ghi ban", "cau thu ghi ban"],
  leader: ["dan dau", "dung dau", "dau bang", "nhat bang", "ngoi dau", "top 1", "hang nhat", "hang 1", "thu nhat", "thu 1", "dang dan", "dang nhat", "xep nhat", "vo dich"]
};
const SELF = ["minh", "tao", "toi", "tui", "em", "tau"];
const ALIAS = [["muot ma"], ["hai vai"], ["phong kinh"], ["vps united", "vps"], ["platform"], ["la chan"]];
const TITLES = ["a", "anh", "chi", "em", "ban", "thang", "ong", "cau", "co", "thay", "bac"];

async function answer(E, text, ids, priv = false) {
  const t = " " + norm(text) + " ";
  const has = list => list.some(k => t.includes(" " + k + " "));
  const isToday = has(["hom nay"]) && has(["tran", "da", "lich", "gap"]);
  const intent = has(INTENT.scorer) ? "scorer" : has(INTENT.leader) ? "leader" : has(INTENT.rank) ? "rank" : has(INTENT.weather) ? "weather" : (has(INTENT.result) && !has(["du doan"])) ? "result" : isToday ? "today" : has(INTENT.next) ? "next" : null;
  if (!intent) return lookup(E, t, has, priv);
  if (intent === "weather") {
    if (!E.ACCUWEATHER_API_KEY) return "Admin chưa cài khóa AccuWeather nên mình chưa xem được thời tiết nhé.";
    try { return await weatherText(E); } catch (x) { return "Mình chưa lấy được dự báo thời tiết lúc này, bạn thử lại sau nhé."; }
  }

  const [ms, events, profiles] = await Promise.all([sbGet(E, "matches", "&order=round,id"), sbGet(E, "events"), sbGet(E, "profiles")]);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const notYet = "Mình chưa biết bạn thuộc đội nào. Bạn liên kết Zalo (web → tab Cầu thủ → Lấy mã liên kết Zalo → nhắn riêng LINK <mã>) hoặc hỏi kèm tên đội nhé.";

  if (intent === "scorer") {
    const g = {};
    events.filter(x => x.type === "g").forEach(x => { const k = `${x.player} (${T[x.team]})`; g[k] = (g[k] || 0) + 1; });
    const all = Object.entries(g).sort((a, b) => b[1] - a[1]);
    if (!all.length) return "Chưa có bàn thắng nào được ghi nhận.";
    const mx = all[0][1], kings = all.filter(x => x[1] === mx).map(x => x[0]);
    const top = all.slice(0, Math.max(3, kings.length));
    return `👑 Vua phá lưới hiện tại: ${kings.join(", ")} với ${mx} bàn.\n` + top.map(([k, c], i) => `${c === mx ? "👑 " : ""}${i + 1}. ${k}: ${c} bàn`).join("\n");
  }
  if (intent === "leader") {
    const st = standings(ms, events);
    if (!st[0].p) return "Giải chưa có trận nào có kết quả, chưa có đội dẫn đầu.";
    const l = st[0], tie = st.slice(1).filter(x => x.pt === l.pt).map(x => T[x.i]);
    return `🥇 ${T[l.i]} đang dẫn đầu với ${l.pt} điểm (${l.p} trận, hiệu số ${l.gd > 0 ? "+" : ""}${l.gd}).` + (tie.length ? `\nĐồng điểm: ${tie.join(", ")} (xếp dưới theo hiệu số, đối đầu hoặc thẻ phạt).` : "");
  }
  if (intent === "today") {
    const d = ms.filter(m => m.match_date === today);
    if (d.length) return `📅 Hôm nay (${fd(today)}) có ${d.length} trận:\n` + d.map((m, i) => `${i + 1}. ${T[m.home]} vs ${T[m.away]}${m.referee ? " (Trọng tài: " + m.referee + ")" : ""}`).join("\n");
    const nx = ms.filter(m => m.hg == null && m.match_date > today).sort((a, b) => a.match_date.localeCompare(b.match_date))[0];
    return "Hôm nay không có trận nào." + (nx ? ` Ngày thi đấu tiếp theo: ${fd(nx.match_date)}.` : "");
  }

  // xác định đội được hỏi: tên đội > tên cầu thủ > đại từ chỉ bản thân
  let team = null, who = null, self = false;
  const ti = ALIAS.findIndex(a => a.some(k => t.includes(" " + k + " ")));
  if (ti >= 0) team = ti;
  else {
    const pl = profiles.filter(p => p.team != null).map(p => ({ p, n: norm(p.name) })).filter(x => x.n);
    const tokenCount = {};
    pl.forEach(x => new Set(x.n.split(" ").filter(w => w.length >= 3)).forEach(w => { tokenCount[w] = (tokenCount[w] || 0) + 1; }));
    const cands = [];
    pl.forEach(x => {
      if (t.includes(" " + x.n + " ") && (x.n.length >= 3 || TITLES.some(w => t.includes(" " + w + " " + x.n + " ")))) cands.push({ p: x.p, l: x.n.length });
      else x.n.split(" ").filter(w => w.length >= 3 && tokenCount[w] === 1).forEach(w => { if (t.includes(" " + w + " ")) cands.push({ p: x.p, l: w.length }); });
    });
    cands.sort((a, b) => b.l - a.l);
    if (cands[0]) { who = cands[0].p; team = who.team; }
    else if (has(SELF) && (intent !== "result" || has(["doi"]))) {
      self = true;
      try {
        const r = await rpc(E, "bot_whoami", { p_secret: E.CRON_SECRET, p_chats: ids });
        if (r[0] && r[0].team != null) { team = r[0].team; who = { name: r[0].name }; }
      } catch (x) { /* chưa tạo hàm SQL */ }
      if (team == null) return notYet;
    }
  }

  if (intent === "rank") {
    const st = standings(ms, events);
    if (team == null) return "🏆 Bảng xếp hạng:\n" + st.map((x, k) => `${k + 1}. ${T[x.i]}: ${x.pt} điểm (${x.p} trận, HS ${x.gd > 0 ? "+" : ""}${x.gd})`).join("\n");
    const k = st.findIndex(x => x.i === team), x = st[k];
    const pre = self ? `Đội của bạn là ${T[team]}. ` : who ? `${who.name} thuộc đội ${T[team]}. ` : "";
    return `🏆 ${pre}${T[team]} đang đứng thứ ${k + 1}/6 với ${x.pt} điểm (${x.p} trận: ${x.w}T ${x.d}H ${x.l}B, hiệu số ${x.gd > 0 ? "+" : ""}${x.gd}).`;
  }
  if (intent === "result") {
    const past = ms.filter(m => m.match_date <= today && (team == null || m.home === team || m.away === team)).sort((a, b) => a.match_date.localeCompare(b.match_date) || a.id.localeCompare(b.id));
    if (!past.length) return "Chưa có trận nào diễn ra.";
    const day = past[past.length - 1].match_date;
    const sel = team == null ? past.filter(m => m.match_date === day) : [past[past.length - 1]];
    const lines = sel.map(m => m.hg != null ? `• ${T[m.home]} ${m.hg}-${m.ag} ${T[m.away]}` : `• ${T[m.home]} vs ${T[m.away]}: chưa có tỷ số`);
    return `⚽ Kết quả ngày ${fd(sel[0].match_date)}:\n` + lines.join("\n") + (sel.some(m => m.hg == null) ? "\n\nadmin cần nhập tỷ số nhé anh zai" : "");
  }
  // next
  if (team == null) return "Bạn hỏi trận của đội nào? Hãy ghi kèm tên đội, hoặc liên kết Zalo để mình biết đội của bạn nhé.";
  const nx = ms.filter(m => m.hg == null && m.match_date >= today && (m.home === team || m.away === team)).sort((a, b) => a.match_date.localeCompare(b.match_date))[0];
  if (!nx) return `${T[team]} không còn trận sắp tới trong lịch.`;
  const opp = nx.home === team ? nx.away : nx.home;
  return `📅 ${T[team]} sắp đá với ${T[opp]} vào ngày ${fd(nx.match_date)} (vòng ${nx.round})${nx.referee ? ", trọng tài: " + nx.referee : ""}.`;
}

// ---- Tra cứu cầu thủ theo tên ----
const STRONG = ["la ai", "ai la", "tim", "tim kiem", "tra cuu", "thong tin"];
const WEAK = ["cau thu", "ten la", "so ao", "o doi nao", "thuoc doi nao", "doi nao"];
const STOP = new Set(["la", "ai", "thong", "tin", "tim", "kiem", "tra", "cuu", "cau", "thu", "ten", "so", "ao", "o", "doi", "nao", "thuoc", "cua", "hoi", "cho", "minh", "toi", "tao", "muon", "biet", "ve", "vi", "tri", "cao", "nang", "bao", "nhieu", "vay", "the", "anh", "chi", "em", "ban", "oi", "nhe", "nha", "di", "xin", "da", "dang", "co", "khong", "bot", "gi", "can", "giup"]);
const POS = { GK: "Thủ môn", LB: "Hậu vệ trái", CB: "Trung vệ", RB: "Hậu vệ phải", MF: "Tiền vệ", CF: "Tiền đạo cắm" };

async function lookup(E, t, has, priv) {
  const strong = has(STRONG), weak = has(WEAK);
  const all = t.trim().split(" ").filter(Boolean);
  const words = all.filter(w => !STOP.has(w));
  const pure = !strong && !weak && all.length <= 4 && priv;
  if (!strong && !weak && !pure) return null;
  if (!words.length) return null;
  const [profiles, events, roles] = await Promise.all([sbGet(E, "profiles"), sbGet(E, "events"), sbGet(E, "team_roles").catch(() => [])]);
  const pl = profiles.filter(p => p.team != null).map(p => ({ p, n: norm(p.name), tk: norm(p.name).split(" ").filter(Boolean) })).filter(x => x.n);
  const relax = strong || pure;
  let hit;
  if (pure) {
    // chỉ gõ tên (không kèm câu hỏi): mọi từ trong tin nhắn phải thuộc tên cầu thủ
    const exact = pl.filter(x => x.n === all.join(" "));
    hit = exact.length ? exact : pl.filter(x => words.every(w => x.tk.some(k => k === w || (w.length >= 3 && k.startsWith(w)))));
  } else {
    hit = pl.filter(x => t.includes(" " + x.n + " ") && (x.n.length >= 3 || relax || TITLES.some(w => t.includes(" " + w + " " + x.n + " "))));
    if (hit.length) { const mx = Math.max(...hit.map(x => x.n.length)); hit = hit.filter(x => x.n.length === mx); }
    else hit = pl.filter(x => words.some(w => w.length >= 3 && x.tk.includes(w)));
  }
  if (!hit.length) return strong && words.length <= 3 ? `🔎 Mình không tìm thấy cầu thủ nào tên "${words.join(" ")}" trong danh sách đã đăng ký.` : null;
  if (hit.length > 5) return `🔎 Có ${hit.length} cầu thủ trùng tên, bạn gõ đầy đủ họ tên để mình tìm chính xác nhé.`;
  if (hit.length > 1) return `🔎 Tìm thấy ${hit.length} cầu thủ:\n` + hit.map(x => `• ${x.p.name} (${T[x.p.team]}, số áo ${x.p.num})`).join("\n") + "\nGõ đầy đủ tên để xem chi tiết.";
  const p = hit[0].p, nm = hit[0].n;
  let g = 0, y = 0, r = 0;
  events.forEach(x => {
    const mine = x.player_id ? x.player_id === p.id : (x.team === p.team && norm(x.player) === nm);
    if (!mine) return;
    if (x.type === "g") g++; else if (x.type === "y") y++; else if (x.type === "r") r++;
  });
  const rl = roles.find(x => x.team === p.team) || {};
  const lines = [`👤 ${p.name} - ${T[p.team]}, số áo ${p.num}`];
  const body = [];
  if (p.pos) body.push(`Vị trí ${p.pos} (${POS[p.pos] || p.pos})`);
  if (p.height) body.push(`cao ${p.height}cm`);
  if (p.weight) body.push(`nặng ${p.weight}kg`);
  if (body.length) lines.push("📍 " + body.join(", "));
  if (rl.captain_id === p.id) lines.push(`🎖 Đội trưởng ${T[p.team]}`);
  if (rl.owner_id === p.id) lines.push(`💼 Ông bầu ${T[p.team]}`);
  lines.push(`⚽ ${g} bàn · 🟨 ${y} · 🟥 ${r}`);
  if (E.SITE_URL) lines.push("👉 Xem chi tiết: " + E.SITE_URL);
  return lines.join("\n");
}
module.exports = { answer };
