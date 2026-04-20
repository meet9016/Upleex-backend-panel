const cron = require('node-cron');
const { processKycIncompleteNotifications } = require('../services/kycEmail.service');

// Run every hour to check for pending KYC notifications
const startKycReminderCron = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    try {
      await processKycIncompleteNotifications();
    } catch (error) {
      console.error('Error in KYC reminder cron job:', error);
    }
  });

};

module.exports = {
  startKycReminderCron
};