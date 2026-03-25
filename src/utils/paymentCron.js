const cron = require('node-cron');
const { releaseScheduledPayments } = require('../services/vendorPayment.service');

/**
 * Initialize payment release cron job
 * Runs every day at 9:00 AM to check and release due payments
 */
const initPaymentReleaseCron = () => {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    console.log('Running scheduled payment release job...');
    
    try {
      const result = await releaseScheduledPayments();
      
      if (result.success) {
        console.log(`Payment release job completed. Released ${result.releasedCount} payments.`);
      } else {
        console.error('Payment release job failed:', result.error);
      }
    } catch (error) {
      console.error('Error in payment release cron job:', error);
    }
  });
  
  console.log('Payment release cron job initialized - runs daily at 9:00 AM');
};

module.exports = {
  initPaymentReleaseCron
};