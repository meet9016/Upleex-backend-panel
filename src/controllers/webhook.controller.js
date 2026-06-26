const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { verifyWebhookSignature, handlePayoutWebhook } = require('../services/razorpayx.service');

/**
 * Handle RazorpayX Webhook
 * Receives payout status updates from RazorpayX
 */
const handleRazorpayXWebhook = {
  handler: catchAsync(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    
    // For webhook, we need raw body - req.body will be a Buffer for this route
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    
    // Verify webhook signature (skip in development if no secret)
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(body, signature)) {
        console.error('[Webhook] Invalid signature');
        return res.status(httpStatus.BAD_REQUEST).json({
          status: 400,
          success: false,
          message: 'Invalid webhook signature'
        });
      }
    }
    
    // Parse the body if it's a string
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    console.log('[Webhook] Received event:', payload.event || 'unknown');
    
    // Process the webhook
    const result = await handlePayoutWebhook(payload);
    
    if (result.success) {
      // Notify vendor about payout status update
      try {
        const VendorPayment = require('../models/vendorPayment.model');
        const vendorPayment = await VendorPayment.findById(result.vendor_payment_id);
        
        if (vendorPayment) {
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          
          let title = 'Payment Update';
          let message = '';
          
          if (vendorPayment.payout_status === 'processed') {
            title = 'Payment Received! 💰';
            message = `Your payment of ₹${vendorPayment.vendor_amount} has been successfully transferred to your bank account.`;
          } else if (vendorPayment.payout_status === 'failed' || vendorPayment.payout_status === 'reversed') {
            title = 'Payment Failed ❌';
            message = `Your payment of ₹${vendorPayment.vendor_amount} could not be processed. Reason: ${vendorPayment.notes || 'Unknown'}. Please contact support.`;
          }
          
          if (message) {
            await sendNotificationToVendor(
              vendorPayment.vendor_id,
              title,
              message,
              'payment_update',
              { paymentId: String(vendorPayment._id), amount: String(vendorPayment.vendor_amount) }
            );
          }
        }
      } catch (notifErr) {
        console.error('Webhook notification error:', notifErr);
      }
      
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: result.message
      });
    } else {
      return res.status(httpStatus.BAD_REQUEST).json({
        status: 400,
        success: false,
        message: result.message || result.error
      });
    }
  })
};

module.exports = {
  handleRazorpayXWebhook
};
