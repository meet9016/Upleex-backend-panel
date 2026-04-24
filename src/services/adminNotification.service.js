const AdminNotification = require('../models/adminNotification.model');

const sendAdminNotification = async (title, body, type = 'other', data = {}) => {
  try {
    await AdminNotification.create({ title, body, type, data });
  } catch (error) {
    console.error('Error saving admin notification:', error);
  }
};

module.exports = { sendAdminNotification };
