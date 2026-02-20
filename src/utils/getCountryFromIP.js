const axios = require("axios");

async function getCountryFromIP(ip) {
  try {
    const res = await axios.get(`http://ip-api.com/json/${ip}`);
    return res.data.countryCode || "US";  // US / CA / AU / IN
  } catch (err) {
    return "US";
  }
}

module.exports = getCountryFromIP;
