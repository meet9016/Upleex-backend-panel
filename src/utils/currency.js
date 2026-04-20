const axios = require("axios");

async function getCurrencyFromCountry(countryName) {
  try {
    if (!countryName) return "USD";

    // Fix common abbreviations
    const countryMap = {
      USA: "United States",
      UK: "United Kingdom",
      UAE: "United Arab Emirates",
      Europe: "Germany", // pick major EUR country
      EU: "Germany",
      Russia: "Russian Federation",
    };

    if (countryMap[countryName]) {
      countryName = countryMap[countryName];
    }

    // Try full match
    let response = null;
    try {
      response = await axios.get(
        `https://restcountries.com/v3.1/name/${countryName}?fullText=true`
      );
    } catch (_) {
      // If fullText fails → try partial match
      response = await axios.get(
        `https://restcountries.com/v3.1/name/${countryName}`
      );
    }

    const currencies = response.data[0].currencies;
    const currencyCode = Object.keys(currencies)[0]; // Example: USD, EUR, AUD

    return currencyCode;
  } catch (err) {
    return "USD"; // fallback
  }
}

module.exports = { getCurrencyFromCountry };

