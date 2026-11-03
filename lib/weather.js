// Dự báo thời tiết hôm nay từ AccuWeather cho Yên Sở, Hà Nội
const BASE = "https://dataservice.accuweather.com";
let LOC = null;                 // nhớ mã địa điểm để đỡ tốn lượt gọi API
let CACHE = { t: 0, text: "" }; // nhớ kết quả 30 phút

async function aw(E, path, params = {}) {
  const qs = new URLSearchParams({ apikey: E.ACCUWEATHER_API_KEY, language: "vi-vn", ...params });
  const r = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: "Bearer " + E.ACCUWEATHER_API_KEY } });
  if (!r.ok) throw new Error("AccuWeather " + r.status);
  return r.json();
}

async function location(E) {
  if (E.ACCUWEATHER_LOCATION_KEY) return { key: E.ACCUWEATHER_LOCATION_KEY, place: E.WEATHER_PLACE || "Yên Sở, Hà Nội" };
  if (LOC) return LOC;
  const tries = [[E.WEATHER_QUERY || "Yen So, Hanoi", "Yên Sở, Hà Nội"], ["Hanoi", "Hà Nội"]];
  for (const [q, place] of tries) {
    const r = await aw(E, "/locations/v1/cities/search", { q });
    if (Array.isArray(r) && r[0]) { LOC = { key: r[0].Key, place }; return LOC; }
  }
  throw new Error("Không tìm thấy địa điểm");
}

const n = x => Math.round(x);
async function weatherText(E) {
  if (!E.ACCUWEATHER_API_KEY) return null;
  if (Date.now() - CACHE.t < 30 * 60 * 1000 && CACHE.text) return CACHE.text;
  const loc = await location(E);
  const data = await aw(E, `/forecasts/v1/daily/1day/${loc.key}`, { details: "true", metric: "true" });
  const f = data.DailyForecasts && data.DailyForecasts[0];
  if (!f) throw new Error("Không có dữ liệu dự báo");
  const day = f.Day || {}, night = f.Night || {};
  const rain = Math.max(day.PrecipitationProbability || 0, night.PrecipitationProbability || 0);
  const d = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const lines = [`🌤 Thời tiết hôm nay (${d.slice(8, 10)}/${d.slice(5, 7)}) - ${loc.place}`];
  if (f.Temperature) lines.push(`🌡 ${n(f.Temperature.Minimum.Value)}° - ${n(f.Temperature.Maximum.Value)}°C` +
    (f.RealFeelTemperature ? ` (cảm giác ${n(f.RealFeelTemperature.Minimum.Value)}° - ${n(f.RealFeelTemperature.Maximum.Value)}°C)` : ""));
  if (day.ShortPhrase || day.IconPhrase) lines.push(`☀️ Ban ngày: ${day.ShortPhrase || day.IconPhrase}${day.PrecipitationProbability != null ? ` (mưa ${day.PrecipitationProbability}%)` : ""}`);
  if (night.ShortPhrase || night.IconPhrase) lines.push(`🌙 Ban đêm: ${night.ShortPhrase || night.IconPhrase}${night.PrecipitationProbability != null ? ` (mưa ${night.PrecipitationProbability}%)` : ""}`);
  if (day.Wind && day.Wind.Speed) lines.push(`💨 Gió ${n(day.Wind.Speed.Value)} km/h`);
  lines.push(rain >= 60 ? "☔ Khả năng mưa cao, nhớ mang áo mưa, sân có thể trơn nhé!" : rain >= 30 ? "🌦 Có thể có mưa rào, anh em chuẩn bị áo mưa nhé." : "👍 Thời tiết ổn để ra sân.");
  lines.push("Nguồn: AccuWeather" + (f.Link ? " " + f.Link : ""));
  CACHE = { t: Date.now(), text: lines.join("\n") };
  return CACHE.text;
}
module.exports = { weatherText };
