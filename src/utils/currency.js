// const currencyRates = {
//   INR_USD: 0.012,
//   INR_AUD: 0.018,
//   INR_EUR: 0.011,
// };

// const convertPrice = (inr, country) => {
//   switch (country) {
//     case "USA":
//       return { price: (inr * currencyRates.INR_USD).toFixed(2), currency: "USD" };

//     case "Australia":
//       return { price: (inr * currencyRates.INR_AUD).toFixed(2), currency: "AUD" };

//     case "Europe":
//       return { price: (inr * currencyRates.INR_EUR).toFixed(2), currency: "EUR" };

//     default:
//       return { price: inr, currency: "INR" };   // India
//   }
// };

// module.exports = { convertPrice };
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

