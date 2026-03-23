const cron = require('node-cron');
const { processKycIncompleteNotifications } = require('../services/kycEmail.service');

// Run every hour to check for pending KYC notifications
const startKycReminderCron = () => {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    console.log('Running KYC reminder check...');
    try {
      await processKycIncompleteNotifications();
      console.log('KYC reminder check completed');
    } catch (error) {
      console.error('Error in KYC reminder cron job:', error);
    }
  });

  console.log('KYC reminder cron job started - runs every hour');
};

module.exports = {
  startKycReminderCron
};