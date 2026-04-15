const cron = require('node-cron');
const Service = require('../models/service.model');

/**
 * Cron job to handle service expiry
 * Runs every hour to check and update expired services
 */
const handleServiceExpiry = () => {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('Running service expiry check...');
      const now = new Date();

      // Move expired services to draft status
      const expiredServicesResult = await Service.updateMany(
        {
          expires_at: { $lt: now },
          status: { $in: ['active', 'inactive'] }
        },
        {
          $set: { status: 'draft' }
        }
      );

      if (expiredServicesResult.modifiedCount > 0) {
        console.log(`Moved ${expiredServicesResult.modifiedCount} expired services to draft status`);
      }

      // Update expired priority plans
      const expiredPriorityResult = await Service.updateMany(
        {
          is_priority: true,
          priority_expires_at: { $lt: now }
        },
        {
          $set: { is_priority: false }
        }
      );

      if (expiredPriorityResult.modifiedCount > 0) {
        console.log(`Removed priority status from ${expiredPriorityResult.modifiedCount} services`);
      }

      // Hide expired listing services
      const expiredListingResult = await Service.updateMany(
        {
          listing_expires_at: { $lt: now },
          status: 'active'
        },
        {
          $set: { status: 'inactive' }
        }
      );

      if (expiredListingResult.modifiedCount > 0) {
        console.log(`Set ${expiredListingResult.modifiedCount} services to inactive due to expired listings`);
      }

    } catch (error) {
      console.error('Error in service expiry cron job:', error);
    }
  });

  console.log('Service expiry cron job scheduled');
};

module.exports = {
  handleServiceExpiry
};