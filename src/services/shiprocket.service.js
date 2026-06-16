const axios = require('axios');
const config = require('../config/config');

let cachedToken = null;
let tokenExpiry = null;

/**
 * Log in to Shiprocket and fetch auth token
 * @returns {Promise<string|null>}
 */
const getShiprocketToken = async () => {
  const email = config.shiprocket.email || process.env.SHIPROCKET_EMAIL;
  const password = config.shiprocket.password || process.env.SHIPROCKET_PASSWORD;

  if (!email || !password) {
    console.warn('[Shiprocket] Credentials are not configured in environment variables. Shipping APIs will fail.');
    return null;
  }

  // Token cache check (typically valid for 10 days, refresh if older than 9 days)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken;
  }

  try {
    console.log('[Shiprocket] Logging in...');
    const response = await axios.post('https://apiv2.shiprocket.in/v1/external/auth/login', {
      email,
      password,
    });

    if (response.data && response.data.token) {
      cachedToken = response.data.token;
      // Expires in 9 days
      tokenExpiry = Date.now() + 9 * 24 * 60 * 60 * 1000;
      console.log('[Shiprocket] Login successful. Token cached.');
      return cachedToken;
    }
  } catch (error) {
    console.error('[Shiprocket] Authentication failed:', error.response ? error.response.data : error.message);
    throw new Error('Failed to authenticate with Shiprocket');
  }

  return null;
};

/**
 * Create an adhoc order in Shiprocket
 * @param {Object} orderData
 * @returns {Promise<Object>}
 */
const createShiprocketOrder = async (orderData) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  try {
    console.log(`[Shiprocket] Creating adhoc order for Order ID: ${orderData.order_id}...`);
    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/orders/create/adhoc',
      orderData,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log(`[Shiprocket] Order created successfully. Shipment ID: ${response.data?.shipment_id}`);
    return response.data;
  } catch (error) {
    console.error('[Shiprocket] Order creation failed:', error.response ? error.response.data : error.message);
    const apiErrorMsg = error.response && error.response.data && error.response.data.message
      ? error.response.data.message
      : (error.response && error.response.data && typeof error.response.data === 'string' ? error.response.data : '');
      
    throw new Error(apiErrorMsg ? `Shiprocket API Error: ${apiErrorMsg}` : 'Failed to create order in Shiprocket');
  }
};

/**
 * Get Shiprocket order details by Shiprocket order ID
 * @param {number|string} shiprocketOrderId
 * @returns {Promise<Object>}
 */
const getShiprocketOrder = async (shiprocketOrderId) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  try {
    console.log(`[Shiprocket] Fetching order details for Shiprocket Order ID: ${shiprocketOrderId}...`);
    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/orders/show/${shiprocketOrderId}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );
    
    console.log('[Shiprocket] Raw API Response:', JSON.stringify(response.data, null, 2));

    console.log(`[Shiprocket] Successfully fetched order details for Shiprocket Order ID: ${shiprocketOrderId}`);
    return response.data;
  } catch (error) {
    console.error('[Shiprocket] Failed to fetch order details:', error.response ? error.response.data : error.message);
    const apiErrorMsg = error.response && error.response.data && error.response.data.message
      ? error.response.data.message
      : (error.response && error.response.data && typeof error.response.data === 'string' ? error.response.data : '');
      
    throw new Error(apiErrorMsg ? `Shiprocket API Error: ${apiErrorMsg}` : 'Failed to fetch order details from Shiprocket');
  }
};

/**
 * Track shipment using AWB number
 * @param {string} awbCode
 * @returns {Promise<Object>}
 */
const trackShipment = async (awbCode) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  try {
    console.log(`[Shiprocket] Tracking shipment for AWB: ${awbCode}...`);
    const response = await axios.get(
      `https://apiv2.shiprocket.in/v1/external/courier/track/awb/${awbCode}`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log(`[Shiprocket] Successfully tracked shipment for AWB: ${awbCode}`);
    return response.data;
  } catch (error) {
    console.error('[Shiprocket] Failed to track shipment:', error.response ? error.response.data : error.message);
    const apiErrorMsg = error.response && error.response.data && error.response.data.message
      ? error.response.data.message
      : (error.response && error.response.data && typeof error.response.data === 'string' ? error.response.data : '');
      
    throw new Error(apiErrorMsg ? `Shiprocket API Error: ${apiErrorMsg}` : 'Failed to track shipment');
  }
};

/**
 * Check courier serviceability and get available couriers
 * @param {Object} params - { pickup_postcode, delivery_postcode, cod, weight }
 * @returns {Promise<Object>}
 */
const checkCourierServiceability = async (params) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  try {
    console.log('[Shiprocket] Checking courier serviceability with params:', params);
    const response = await axios.get(
      'https://apiv2.shiprocket.in/v1/external/courier/serviceability/',
      {
        params: params,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log('[Shiprocket] Serviceability Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('[Shiprocket] Failed to check serviceability:', error.response ? error.response.data : error.message);
    const apiErrorMsg = error.response && error.response.data && error.response.data.message
      ? error.response.data.message
      : (error.response && error.response.data && typeof error.response.data === 'string' ? error.response.data : '');
      
    throw new Error(apiErrorMsg ? `Shiprocket API Error: ${apiErrorMsg}` : 'Failed to check courier serviceability');
  }
};

/**
 * Get available couriers for a shipment (deprecated - use checkCourierServiceability instead)
 * @param {number|string} shipmentId
 * @returns {Promise<Object>}
 */
const getAvailableCouriers = async (shipmentId) => {
  console.log(`[Shiprocket] Note: getAvailableCouriers is deprecated, use checkCourierServiceability instead`);
  return { data: { available_courier_companies: [] } };
};

/**
 * Assign AWB to a shipment
 * @param {number|string} shipmentId
 * @param {number|string} courierId
 * @returns {Promise<Object>}
 */
const assignAwbToShipment = async (shipmentId, courierId) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  try {
    console.log(`[Shiprocket] Assigning AWB to Shipment ID: ${shipmentId} with Courier ID: ${courierId}...`);
    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/courier/assign/awb',
      {
        shipment_id: shipmentId,
        courier_id: courierId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    );

    console.log(`[Shiprocket] Successfully assigned AWB to Shipment ID: ${shipmentId}`);
    console.log('[Shiprocket] AWB Assignment Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('[Shiprocket] Failed to assign AWB:', error.response ? error.response.data : error.message);
    const apiErrorMsg = error.response && error.response.data && error.response.data.message
      ? error.response.data.message
      : (error.response && error.response.data && typeof error.response.data === 'string' ? error.response.data : '');
      
    throw new Error(apiErrorMsg ? `Shiprocket API Error: ${apiErrorMsg}` : 'Failed to assign AWB');
  }
};

/**
 * Generate pickup request
 * @param {Array|number|string} shipmentIds
 * @returns {Promise<Object>}
 */
const generatePickup = async (shipmentIds) => {
  const token = await getShiprocketToken();
  if (!token) {
    throw new Error('Shiprocket API credentials are not set up or authentication failed.');
  }

  if (!Array.isArray(shipmentIds)) {
    shipmentIds = [shipmentIds];
  }

  try {
    console.log('[Shiprocket] Generating pickup for shipments:', shipmentIds);

    const response = await axios.post(
      'https://apiv2.shiprocket.in/v1/external/courier/generate/pickup',
      {
        shipment_id: shipmentIds,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('[Shiprocket] Pickup generated successfully');
    console.log('[Shiprocket] Pickup Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error(
      '[Shiprocket] Pickup generation failed:',
      error.response?.data || error.message
    );

    throw new Error(
      error.response?.data?.message || 'Failed to generate pickup'
    );
  }
};

module.exports = {
  getShiprocketToken,
  createShiprocketOrder,
  getShiprocketOrder,
  trackShipment,
  getAvailableCouriers,
  checkCourierServiceability,
  assignAwbToShipment,
  generatePickup,
};
