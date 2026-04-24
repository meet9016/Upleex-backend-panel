const admin = require('../config/firebase.config');
const Notification = require('../models/notification.model');
const User = require('../models/user.model');

/**
 * Send notification to a specific user
 * @param {string} userId
 * @param {string} title
 * @param {string} body
 * @param {Object} data
 */
const sendNotificationToUser = async (userId, title, body, data = {}) => {
  try {
    // 1. Save to DB
    await Notification.create({
      user_id: userId,
      title,
      body,
      data,
    });

    // 2. Get User's FCM tokens
    const user = await User.findById(userId);
    if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
      return;
    }

    // 3. Send via Firebase Admin
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        ...data,
        click_action: 'FLUTTER_NOTIFICATION_CLICK', // For Android/Mobile if needed
      },
      tokens: user.fcmTokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    console.log(`${response.successCount} messages were sent successfully`);
    
    // Optional: Cleanup invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(user.fcmTokens[idx]);
        }
      });
      if (failedTokens.length > 0) {
        await User.findByIdAndUpdate(userId, {
          $pull: { fcmTokens: { $in: failedTokens } },
        });
      }
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

/**
 * Send notification to multiple users
 * @param {Array} userIds
 * @param {string} title
 * @param {string} body
 */
const sendNotificationToMultipleUsers = async (userIds, title, body, data = {}) => {
  const promises = userIds.map((id) => sendNotificationToUser(id, title, body, data));
  await Promise.all(promises);
};

module.exports = {
  sendNotificationToUser,
  sendNotificationToMultipleUsers,
};
