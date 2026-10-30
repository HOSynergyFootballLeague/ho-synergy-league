// Cron chiều thứ 6 (15:00 giờ VN): nhắc đăng ký tham gia trận. Dùng lại logic trong cron.js
const cron = require("./cron.js");
module.exports = (req, res) => {
  req.query = { ...(req.query || {}), mode: "friday" };
  return cron(req, res);
};
