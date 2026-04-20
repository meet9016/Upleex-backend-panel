const axios = require('axios');
const config = require('../config/config');

/**
 * Send OTP via SMS Gateway Hub
 * @param {string} phone
 * @param {string} otp
 * @returns {Promise}
 */
const sendOtp = async (phone, otp) => {
  const url = 'https://www.smsgatewayhub.com/api/mt/SendSMS';

  // Clean phone number and ensure 10-digit numbers have 91 prefix
  const cleanPhone = phone.replace(/\D/g, '');
  let formattedNumber = cleanPhone;
  if (formattedNumber.length === 10) {
    formattedNumber = '91' + formattedNumber;
  }

  const apiKey = (config.sms.apiKey || '').trim();
  const senderId = (config.sms.senderId || '').trim();
  const entityId = (config.sms.entityId || '').trim();
  const templateId = (config.sms.templateId || '').trim();

  const params = {
    APIKey: apiKey,
    senderid: senderId,
    channel: 2,
    DCS: 0,
    flashsms: 0,
    number: formattedNumber,
    text: `Your verification code is ${otp} to login in https://www.upleex.com/. Do not share this code with anyone. - Upleex`,
    route: 1,
    EntityId: entityId,
    dlttemplateid: templateId,
  };

  try {
    // Log URL without sensitve API key for debugging
    const response = await axios.get(url, { params });

    if (response.data.ErrorCode !== '000') {
    }
    return response.data;
  } catch (error) {
    throw new Error('Failed to send SMS');
  }
};

module.exports = {
  sendOtp,
};
