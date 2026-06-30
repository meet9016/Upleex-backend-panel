const cron = require('node-cron');
const { processKycIncompleteNotifications } = require('../services/kycEmail.service');
const VendorPayment = require('../models/vendorPayment.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const { processVendorPayout } = require('./razorpayx.service');

/**
 * Auto-release vendor payments after 7 days of delivery
 * Runs every hour to check for payments ready for release
 */
const startAutoReleasePaymentsCron = () => {
  // Run every 5 minutes to check for payments ready for release
  cron.schedule('* * * * *', async () => {
    console.log('[Cron] Checking for auto-release payments...');
    try {
      const now = new Date();
      
      // Find payments that are:
      // 1. Status = pending
      // 2. release_date <= now (7 days passed since delivery)
      const paymentsToRelease = await VendorPayment.find({
        payment_status: 'pending',
        release_date: { $lte: now }
      }).populate('order_id');
      
      if (paymentsToRelease.length === 0) {
        console.log('[Cron] No payments ready for auto-release');
        return;
      }
      
      console.log(`[Cron] Found ${paymentsToRelease.length} payments for auto-release`);
      
      for (const payment of paymentsToRelease) {
        try {
          // Get vendor KYC for bank details
          const vendorKyc = await VendorKyc.findOne({ 
            $or: [
              { 'ContactDetails.vendor_id': String(payment.vendor_id) },
              { vendor_id: String(payment.vendor_id) },
              { 'ContactDetails.vendor_id': payment.vendor_id },
              { vendor_id: payment.vendor_id }
            ]
          });
          
          if (!vendorKyc) {
            console.log(`[Cron] No KYC found for vendor ${payment.vendor_id}, skipping auto-release`);
            continue;
          }
          
          const bankDetails = vendorKyc.Bank;
          const hasBankDetails = bankDetails?.account_number && bankDetails?.ifsc_code && bankDetails?.account_holder_name;
          
          // Check if RazorpayX is configured
          const hasRazorpayX = process.env.RAZORPAYX_ACCOUNT_NUMBER;
          
          if (hasBankDetails && hasRazorpayX) {
            // Process real payout via RazorpayX
            console.log(`[Cron] Processing RazorpayX payout for payment ${payment._id}`);
            
            const payoutResult = await processVendorPayout(payment, vendorKyc);
            
            if (payoutResult.success) {
              console.log(`[Cron] ✅ Auto-released payment ${payment._id} via RazorpayX`);
            } else {
              console.error(`[Cron] ❌ Failed to auto-release payment ${payment._id}:`, payoutResult.error);
            }
          } else {
            // No RazorpayX - Just mark as released
            payment.payment_status = 'released';
            payment.released_at = new Date();
            payment.released_by = 'system';
            payment.notes = 'Auto-released after 7 days (no RazorpayX configured)';
            await payment.save();
            
            console.log(`[Cron] ✅ Auto-released payment ${payment._id} (marked only, no bank transfer)`);
          }
          
          // Notify vendor
          try {
            const { sendNotificationToVendor } = require('./vendorNotification.service');
            await sendNotificationToVendor(
              payment.vendor_id,
              'Payment Auto-Released! 💰',
              `Your payment of ₹${payment.vendor_amount} has been auto-released after 7 days of delivery.`,
              'payment_update',
              { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
            );
          } catch (notifErr) {
            console.error('[Cron] Notification error:', notifErr);
          }
          
        } catch (paymentError) {
          console.error(`[Cron] Error processing payment ${payment._id}:`, paymentError.message);
        }
      }
      
    } catch (error) {
      console.error('[Cron] Error in auto-release payments cron:', error);
    }
  });
  
  console.log('[Cron] Auto-release payments cron started (runs every 5 minutes)');
};

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
  startKycReminderCron,
  startAutoReleasePaymentsCron
};
