// Cron 10:00 giờ VN hằng ngày: nhắc đăng ký tham gia nếu hôm nay hoặc ngày mai có trận
const cron = require("./cron.js");
module.exports = (req, res) => {
  req.query = { ...(req.query || {}), mode: "regcheck" };
  return cron(req, res);
};
