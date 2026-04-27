const AdminNotification = require('../models/adminNotification.model');
const { emitToAdmin } = require('./socket.service');

const sendAdminNotification = async (title, body, type = 'other', data = {}) => {
  try {
    const notification = await AdminNotification.create({ title, body, type, data });
    
    // Emit via Socket.io
    emitToAdmin('new_admin_notification', {
      id: notification._id,
      title,
      body,
      type,
      data,
      createdAt: notification.createdAt,
    });
  } catch (error) {
    console.error('Error saving admin notification:', error);
  }
};

module.exports = { sendAdminNotification };
