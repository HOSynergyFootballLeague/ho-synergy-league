// Dùng chung cho bot: tên đội và luật xếp hạng
const T = ["Mượt mà", "Hài vãi", "Phòng kính", "VPS United", "Platform", "Lá chắn"];

// ms: danh sách trận (home, away, hg, ag); events: sự kiện (type, team)
function standings(ms, events = []) {
  const t = T.map((n, i) => ({ i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, cd: 0 }));
  events.forEach(x => { if (x.type === "y") t[x.team].cd += 1; else if (x.type === "r") t[x.team].cd += 3; });
  ms.forEach(m => {
    if (m.hg == null || m.ag == null) return;
    const H = t[m.home], A = t[m.away];
    H.p++; A.p++; H.gf += m.hg; H.ga += m.ag; A.gf += m.ag; A.ga += m.hg;
    if (m.hg > m.ag) { H.w++; A.l++; } else if (m.hg < m.ag) { A.w++; H.l++; } else { H.d++; A.d++; }
  });
  t.forEach(x => { x.gd = x.gf - x.ga; x.pt = x.w * 3 + x.d; });
  const h2 = (i, j) => {
    const m = ms.find(m => m.hg != null && m.ag != null && ((m.home === i && m.away === j) || (m.home === j && m.away === i)));
    if (!m) return 0; const d = m.hg - m.ag; if (!d) return 0;
    return (m.home === i) === (d > 0) ? -1 : 1;
  };
  return t.sort((a, b) => b.pt - a.pt || b.gd - a.gd || h2(a.i, b.i) || a.cd - b.cd || b.gf - a.gf);
}
module.exports = { T, standings };
