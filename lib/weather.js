// Dự báo thời tiết hôm nay từ AccuWeather cho Yên Sở, Hà Nội
const BASE = "https://dataservice.accuweather.com";
let LOC = null;                      // nhớ mã địa điểm để đỡ tốn lượt gọi API
let CACHE = { t: 0, data: null };    // nhớ dự báo 30 phút

async function aw(E, path, params = {}) {
  const qs = new URLSearchParams({ apikey: E.ACCUWEATHER_API_KEY, ...params });
  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: "Bearer " + E.ACCUWEATHER_API_KEY, Accept: "application/json" } });
  const body = await r.text();
  if (!r.ok) throw new Error(`AccuWeather ${r.status} (${path.split("/").slice(1, 4).join("/")}): ${body.slice(0, 160)}`);
  try { return JSON.parse(body); } catch (x) { throw new Error("AccuWeather trả dữ liệu không đọc được"); }
}
// thử tiếng Việt trước, nếu lỗi thì thử lại không kèm ngôn ngữ
const awVi = async (E, path, params = {}) => {
  try { return await aw(E, path, { ...params, language: "vi-vn" }); }
  catch (x) { try { return await aw(E, path, params); } catch (y) { throw x; } }
};

async function location(E) {
  if (E.ACCUWEATHER_LOCATION_KEY) return { key: E.ACCUWEATHER_LOCATION_KEY, place: E.WEATHER_PLACE || "Yên Sở, Hà Nội" };
  if (LOC) return LOC;
  const tries = [[E.WEATHER_QUERY || "Yen So, Hanoi", "Yên Sở, Hà Nội"], ["Hanoi", "Hà Nội"]];
  for (const [q, place] of tries) {
    const r = await awVi(E, "/locations/v1/cities/search", { q });
    const hit = Array.isArray(r) ? (r.find(x => x.Country && x.Country.ID === "VN") || r[0]) : null;
    if (hit) { LOC = { key: hit.Key, place }; return LOC; }
  }
  throw new Error("Không tìm thấy địa điểm trên AccuWeather");
}

const n = x => Math.round(x);
async function weatherData(E) {
  if (!E.ACCUWEATHER_API_KEY) throw new Error("Chưa cài ACCUWEATHER_API_KEY");
  if (CACHE.data && Date.now() - CACHE.t < 30 * 60 * 1000) return CACHE.data;
  const loc = await location(E);
  let f, firstErr;
  for (const span of ["1day", "5day"]) {
    try {
      const data = await awVi(E, `/forecasts/v1/daily/${span}/${loc.key}`, { details: "true", metric: "true" });
      f = data.DailyForecasts && data.DailyForecasts[0];
      if (f) break;
    } catch (x) { firstErr = firstErr || x; }
  }
  if (!f) throw firstErr || new Error("Không có dữ liệu dự báo");
  const day = f.Day || {}, night = f.Night || {};
  const rainDay = day.PrecipitationProbability, rainNight = night.PrecipitationProbability;
  const rain = Math.max(rainDay || 0, rainNight || 0);
  const d = {
    place: loc.place,
    tmin: f.Temperature ? n(f.Temperature.Minimum.Value) : null,
    tmax: f.Temperature ? n(f.Temperature.Maximum.Value) : null,
    rfMin: f.RealFeelTemperature ? n(f.RealFeelTemperature.Minimum.Value) : null,
    rfMax: f.RealFeelTemperature ? n(f.RealFeelTemperature.Maximum.Value) : null,
    day: { phrase: day.ShortPhrase || day.IconPhrase || "", rain: rainDay },
    night: { phrase: night.ShortPhrase || night.IconPhrase || "", rain: rainNight },
    wind: day.Wind && day.Wind.Speed ? n(day.Wind.Speed.Value) : null,
    rain,
    link: f.Link || ""
  };
  d.line = `🌤 ${d.place} hôm nay: ${d.tmin}° - ${d.tmax}°C${d.day.phrase ? " · " + d.day.phrase : ""}${rainDay != null ? " · mưa " + rainDay + "%" : ""}`;
  CACHE = { t: Date.now(), data: d };
  return d;
}

async function weatherText(E) {
  if (!E.ACCUWEATHER_API_KEY) return null;
  const d = await weatherData(E);
  const t = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const lines = [`🌤 Thời tiết hôm nay (${t.slice(8, 10)}/${t.slice(5, 7)}) - ${d.place}`];
  if (d.tmin != null) lines.push(`🌡 ${d.tmin}° - ${d.tmax}°C` + (d.rfMin != null ? ` (cảm giác ${d.rfMin}° - ${d.rfMax}°C)` : ""));
  if (d.day.phrase) lines.push(`☀️ Ban ngày: ${d.day.phrase}${d.day.rain != null ? ` (mưa ${d.day.rain}%)` : ""}`);
  if (d.night.phrase) lines.push(`🌙 Ban đêm: ${d.night.phrase}${d.night.rain != null ? ` (mưa ${d.night.rain}%)` : ""}`);
  if (d.wind != null) lines.push(`💨 Gió ${d.wind} km/h`);
  lines.push(d.rain >= 60 ? "☔ Khả năng mưa cao, nhớ mang áo mưa, sân có thể trơn nhé!" : d.rain >= 30 ? "🌦 Có thể có mưa rào, anh em chuẩn bị áo mưa nhé." : "👍 Thời tiết ổn để ra sân.");
  lines.push("Nguồn: AccuWeather" + (d.link ? " " + d.link : ""));
  return lines.join("\n");
}
module.exports = { weatherText, weatherData };
