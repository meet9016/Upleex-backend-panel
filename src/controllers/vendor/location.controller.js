const axios = require('axios');
const Joi = require('joi');
const httpStatus = require('http-status');

const paginate = (items, page = 1, limit = 20) => {
  const start = (page - 1) * limit;
  return items.slice(start, start + limit);
};

// Helper function for A to Z sorting
const sortAToZ = (items, key) => {
  return items.sort((a, b) => {
    const valueA = String(a[key] || '').toLowerCase();
    const valueB = String(b[key] || '').toLowerCase();
    if (valueA < valueB) return -1;
    if (valueA > valueB) return 1;
    return 0;
  });
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
      const resp = await axios.get('https://restcountries.com/v3.1/all?fields=cca3,name');
      
      // Map and sort A to Z
      let all = (resp.data || []).map((c) => ({
        id: String(c.cca3 || ''),
        country_name: String(c.name?.common || ''),
      }));
      
      // Sort A to Z by country_name
      all = sortAToZ(all, 'country_name');
      
      // Apply search filter
      const filtered = search
        ? all.filter((c) => c.country_name.toLowerCase().includes(String(search).toLowerCase()))
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
      country_id: Joi.string().required(),
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { country_id, search = '', page = 1, limit = 20 } = req.body || {};
      
      // Get country name from ID
      const countryResp = await axios.get(
        `https://restcountries.com/v3.1/alpha/${encodeURIComponent(country_id)}?fields=name`
      );
      const countryName = String(countryResp.data?.name?.common || '');
      
      // Get states for the country
      const resp = await axios.post('https://countriesnow.space/api/v0.1/countries/states', {
        country: countryName,
      });
      
      const statesArr = resp.data?.data?.states || [];
      
      // Map and sort A to Z
      let all = statesArr.map((s) => ({
        id: `${country_id}-${String(s.name || '')}`,
        state_name: String(s.name || ''),
      }));
      
      // Sort A to Z by state_name
      all = sortAToZ(all, 'state_name');
      
      // Apply search filter
      const filtered = search
        ? all.filter((s) => s.state_name.toLowerCase().includes(String(search).toLowerCase()))
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
      
      // Parse state_id to get country and state
      const [country_id, ...rest] = String(state_id).split('-');
      const state_name = rest.join('-');
      
      // Get country name from ID
      const countryResp = await axios.get(
        `https://restcountries.com/v3.1/alpha/${encodeURIComponent(country_id)}?fields=name`
      );
      const countryName = String(countryResp.data?.name?.common || '');
      
      // Get cities for the state
      const resp = await axios.post('https://countriesnow.space/api/v0.1/countries/state/cities', {
        country: countryName,
        state: state_name,
      });
      
      const citiesArr = resp.data?.data || [];
      
      // Map and sort A to Z
      let all = citiesArr.map((city) => ({
        id: `${country_id}-${state_name}-${String(city || '')}`,
        city_name: String(city || ''),
      }));
      
      // Sort A to Z by city_name
      all = sortAToZ(all, 'city_name');
      
      // Apply search filter
      const filtered = search
        ? all.filter((c) => c.city_name.toLowerCase().includes(String(search).toLowerCase()))
        : all;
        
      const data = paginate(filtered, page, limit);
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
      const now = Date.now();
      if (!global.__indiaCitiesCache) {
        global.__indiaCitiesCache = { data: [], fetchedAt: 0 };
      }
      const ttl = 24 * 60 * 60 * 1000;
      let all = [];
      if (global.__indiaCitiesCache.data.length && (now - global.__indiaCitiesCache.fetchedAt) < ttl) {
        all = global.__indiaCitiesCache.data;
      } else {
        const resp = await axios.post('https://countriesnow.space/api/v0.1/countries/cities', { country: 'India' });
        const citiesArr = Array.isArray(resp.data?.data) ? resp.data.data : [];
        all = citiesArr.map((city) => ({
          id: `IN-${String(city || '')}`,
          city_name: String(city || ''),
        }));
        all.sort((a, b) => a.city_name.localeCompare(b.city_name));
        global.__indiaCitiesCache = { data: all, fetchedAt: now };
      }
      const needle = String(search || '').toLowerCase();
      const filtered = needle ? all.filter((c) => c.city_name.toLowerCase().includes(needle)) : all;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = {
        total: filtered.length,
        page,
        limit,
        totalPages: Math.ceil(filtered.length / limit) || 1,
        data: filtered.slice(startIndex, endIndex),
      };
      return res.status(200).json({ status: 200, data: paginatedData });
    } catch (error) {
      const cache = global.__indiaCitiesCache && global.__indiaCitiesCache.data ? global.__indiaCitiesCache.data : [];
      if (cache.length) {
        const { search = '', page = 1, limit = 10 } = req.body || {};
        const needle = String(search || '').toLowerCase();
        const filtered = needle ? cache.filter((c) => c.city_name.toLowerCase().includes(needle)) : cache;
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedData = {
          total: filtered.length,
          page,
          limit,
          totalPages: Math.ceil(filtered.length / limit) || 1,
          data: filtered.slice(startIndex, endIndex),
        };
        return res.status(200).json({ status: 200, data: paginatedData });
      }
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
