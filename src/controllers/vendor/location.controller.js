const Joi = require('joi');
const httpStatus = require('http-status');
const { Country, State, City } = require('country-state-city');

const paginate = (items, page = 1, limit = 20) => {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
};

const countryList = {
  validation: {
    body: Joi.object().keys({
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { search = '', page = 1, limit = 20 } = req.body || {};
      
      let all = Country.getAllCountries().map(c => ({
        id: c.isoCode,
        country_name: c.name
      }));
      
      const needle = String(search).toLowerCase();
      const filtered = needle
        ? all.filter((c) => c.country_name.toLowerCase().includes(needle))
        : all;
        
      const data = paginate(filtered, page, limit);
      return res.status(200).json({ status: 200, data });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const stateList = {
  validation: {
    body: Joi.object().keys({
      country_id: Joi.string().allow(''),
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { country_id, search = '', page = 1, limit = 20 } = req.body || {};
      
      let allStates = [];
      if (country_id) {
          allStates = State.getStatesOfCountry(country_id);
      } else {
          allStates = State.getAllStates();
      }
      
      let all = allStates.map(s => ({
        id: `${s.countryCode}-${s.isoCode}`,
        state_name: s.name,
      }));
      
      const needle = String(search).toLowerCase();
      const filtered = needle
        ? all.filter((s) => s.state_name.toLowerCase().includes(needle))
        : all;
        
      const data = paginate(filtered, page, limit);
      return res.status(200).json({ status: 200, data });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const cityList = {
  validation: {
    body: Joi.object().keys({
      state_id: Joi.string().allow(''),
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { state_id, search = '', page = 1, limit = 20 } = req.body || {};
      
      let allCities = [];
      if (state_id) {
        // Find cities in specific state
        const [countryCode, stateCode] = String(state_id).split('-');
        allCities = City.getCitiesOfState(countryCode, stateCode);
      } else {
        // Global search fallback
        allCities = City.getAllCities();
      }

      const needle = String(search).toLowerCase();
      const filtered = needle
        ? allCities.filter((c) => c.name.toLowerCase().includes(needle))
        : allCities;
        
      const paginated = paginate(filtered, page, limit);
      
      // Map to the frontend expected schema, adding rich associations
      const data = paginated.map(city => {
        const stateObj = State.getStateByCodeAndCountry(city.stateCode, city.countryCode);
        const countryObj = Country.getCountryByCode(city.countryCode);
        return {
          id: `${city.countryCode}-${city.stateCode}-${city.name}`,
          city_name: city.name,
          state_id: stateObj ? `${city.countryCode}-${city.stateCode}` : null,
          state_name: stateObj ? stateObj.name : null,
          country_id: city.countryCode,
          country_name: countryObj ? countryObj.name : null
        };
      });

      return res.status(200).json({ status: 200, data });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const indiaCityList = {
  validation: {
    body: Joi.object().keys({
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { search = '', page = 1, limit = 10 } = req.body;
      const allCities = City.getCitiesOfCountry('IN');
      const needle = String(search || '').toLowerCase();
      
      const filtered = needle 
        ? allCities.filter((c) => c.name.toLowerCase().includes(needle))
        : allCities;
        
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1,
        data: filtered.slice(startIndex, endIndex).map(city => {
            const stateObj = State.getStateByCodeAndCountry(city.stateCode, 'IN');
            return {
                id: `IN-${city.stateCode}-${city.name}`,
                city_name: city.name,
                state_id: `IN-${city.stateCode}`,
                state_name: stateObj ? stateObj.name : null,
                country_id: 'IN',
                country_name: 'India'
            }
        }),
      };
      
      return res.status(200).json({ status: 200, data: paginatedData });
    } catch (error) {
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

module.exports = {
  countryList,
  stateList,
  cityList,
  indiaCityList
};
