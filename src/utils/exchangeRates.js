const axios = require("axios");

async function getLiveRates() {
  try {
    const { data } = await axios.get("https://open.er-api.com/v6/latest/USD");
    return data.rates; // { USD:1, AUD:1.52, GBP:0.79 ... }
  } catch (err) {
     return {
      USD: 1,
      INR: 83,
      CAD: 1.48,
      AUD: 1.52,
      GBP: 0.79,
      EUR: 0.92,
    }; // fallback
  }
}

module.exports = { getLiveRates };
