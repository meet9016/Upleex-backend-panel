const admin = require('../config/firebase.config');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

const sendNotificationToUser = async (userId, title, body, data = {}) => {
  try {
    // Determine type from data
    const type = data.type || 'other';

    // Save to DB with correct type
    await Notification.create({ user_id: userId, title, body, type, data });

    // Get User's FCM tokens
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) return;

    // All data values must be strings
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
    );

    const message = {
      notification: { title, body },
      data: stringData,
      tokens: user.fcmTokens,
      webpush: {
        notification: { title, body, icon: '/favicon.png' },
        fcm_options: { link: '/' },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`FCM: ${response.successCount}/${user.fcmTokens.length} sent for user ${userId}`);

    if (response.failureCount > 0) {
      const failedTokens = response.responses
        .map((r, i) => (!r.success ? user.fcmTokens[i] : null))
        .filter(Boolean);
      if (failedTokens.length > 0) {
        await User.findByIdAndUpdate(userId, { $pull: { fcmTokens: { $in: failedTokens } } });
      }
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

const sendNotificationToMultipleUsers = async (userIds, title, body, data = {}) => {
  await Promise.all(userIds.map((id) => sendNotificationToUser(id, title, body, data)));
};

module.exports = { sendNotificationToUser, sendNotificationToMultipleUsers };
