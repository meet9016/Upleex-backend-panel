const admin = require('../config/firebase.config');
const Vendor = require('../models/vendor/vendor.model');
const VendorNotification = require('../models/vendorNotification.model');
const { emitToVendor } = require('./socket.service');

const sendNotificationToVendor = async (vendorId, title, body, type = 'other', data = {}) => {
  try {
    // Save to DB
    const notification = await VendorNotification.create({ vendor_id: vendorId, title, body, type, data });

    // Emit via Socket.io
    emitToVendor(vendorId, 'new_notification', {
      id: notification._id,
      title,
      body,
      type,
      data,
      createdAt: notification.createdAt,
    });

    // Get vendor FCM tokens
    const vendor = await Vendor.findById(vendorId);
    if (!vendor || !vendor.fcmTokens || vendor.fcmTokens.length === 0) return;

    // All data values must be strings
    const stringData = Object.fromEntries(
      Object.entries({ type, ...data }).map(([k, v]) => [k, String(v ?? '')])
    );

    const message = {
      notification: { title, body },
      data: stringData,
      tokens: vendor.fcmTokens,
      webpush: {
        notification: {
          title,
          body,
          icon: '/favicon.png',
          click_action: '/',
        },
        fcm_options: {
          link: '/',
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`FCM Vendor: ${response.successCount}/${vendor.fcmTokens.length} sent for vendor ${vendorId}`);

    if (response.failureCount > 0) {
      const failedTokens = response.responses
        .map((r, i) => (!r.success ? vendor.fcmTokens[i] : null))
        .filter(Boolean);
      if (failedTokens.length > 0) {
        await Vendor.findByIdAndUpdate(vendorId, {
          $pull: { fcmTokens: { $in: failedTokens } },
        });
      }
    }
  } catch (error) {
    console.error('Error sending vendor notification:', error);
  }
};

module.exports = { sendNotificationToVendor };
