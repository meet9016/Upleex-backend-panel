const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const VendorPayment = require('../models/vendorPayment.model');
const Order = require('../models/order.model');
const Vendor = require('../models/vendor/vendor.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const { processVendorPayout } = require('../services/razorpayx.service');

// Get vendor payments (for vendor panel)
const getVendorPayments = {
  handler: catchAsync(async (req, res) => {
    const vendorId = req.user.id;
    const { page = 1, limit = 10, status, type } = req.query;
    
    const filter = { vendor_id: vendorId };
    
    if (status) {
      filter.payment_status = status;
    }

    if (type === 'sell') {
      filter.order_id = { $exists: true, $ne: null };
    } else if (type === 'rent') {
      filter.quote_id = { $exists: true, $ne: null };
    }
    
    const skip = (page - 1) * limit;
    
    const payments = await VendorPayment.find(filter)
      .populate('order_id', 'order_id total_amount user_name vendor_status')
      .populate({
        path: 'quote_id',
        select: 'calculated_price user_id status',
        populate: { path: 'user_id', select: 'name email first_name' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Add payment status info for vendor
    const paymentsWithStatus = payments.map(payment => ({
      ...payment.toObject(),
      payment_status_display: {
        status: payment.payment_status,
        status_text: payment.payment_status === 'pending' ? 'Payment Pending' : 
                    payment.payment_status === 'released' ? 'Payment Released' : 
                    payment.payment_status === 'failed' ? 'Payment Failed' : 'Payment Cancelled',
        can_be_released: payment.payment_status === 'pending' && new Date() >= new Date(payment.release_date),
        days_until_release: payment.payment_status === 'pending' ? 
          Math.max(0, Math.ceil((new Date(payment.release_date) - new Date()) / (1000 * 60 * 60 * 24))) : 0
      }
    }));
    
    const total = await VendorPayment.countDocuments(filter);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Vendor payments retrieved successfully',
      data: {
        payments: paymentsWithStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
};

// Get all vendor payments (for admin panel)
const getAllVendorPayments = {
  handler: catchAsync(async (req, res) => {
    const { page = 1, limit = 10, status, vendor_id, type } = req.query;
    
    const filter = {};
    
    if (status) {
      filter.payment_status = status;
    }
    
    if (vendor_id) {
      filter.vendor_id = vendor_id;
    }

    if (type === 'sell') {
      filter.order_id = { $exists: true, $ne: null };
    } else if (type === 'rent') {
      filter.quote_id = { $exists: true, $ne: null };
    }
    
    const skip = (page - 1) * limit;
    
    const payments = await VendorPayment.find(filter)
      .populate('order_id', 'order_id total_amount user_name vendor_status')
      .populate({
        path: 'quote_id',
        select: 'calculated_price user_id status',
        populate: { path: 'user_id', select: 'name email first_name' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get vendor information for each payment
    const paymentsWithVendorInfo = await Promise.all(
      payments.map(async (payment) => {
        try {
          const vendor = await Vendor.findById(payment.vendor_id).select('full_name business_name email number');
          return {
            ...payment.toObject(),
            vendor_info: vendor ? {
              full_name: vendor.full_name,
              business_name: vendor.business_name,
              email: vendor.email,
              number: vendor.number
            } : {
              full_name: `Vendor ${payment.vendor_id}`,
              business_name: `Business ${payment.vendor_id}`,
              email: 'N/A',
              number: 'N/A'
            },
            admin_actions: {
              can_release: payment.payment_status === 'pending',
              can_cancel: payment.payment_status === 'pending',
              is_overdue: payment.payment_status === 'pending' && new Date() > new Date(payment.release_date),
              days_since_delivery: Math.floor((new Date() - new Date(payment.delivered_at)) / (1000 * 60 * 60 * 24))
            }
          };
        } catch (error) {
          return {
            ...payment.toObject(),
            vendor_info: {
              full_name: `Vendor ${payment.vendor_id}`,
              business_name: `Business ${payment.vendor_id}`,
              email: 'N/A',
              number: 'N/A'
            },
            admin_actions: {
              can_release: payment.payment_status === 'pending',
              can_cancel: payment.payment_status === 'pending',
              is_overdue: payment.payment_status === 'pending' && new Date() > new Date(payment.release_date),
              days_since_delivery: Math.floor((new Date() - new Date(payment.delivered_at)) / (1000 * 60 * 60 * 24))
            }
          };
        }
      })
    );
    
    const total = await VendorPayment.countDocuments(filter);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'All vendor payments retrieved successfully',
      data: {
        payments: paymentsWithVendorInfo,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  })
};

// Release payment manually (admin only) - Now with Real Money Transfer
const releasePayment = {
  handler: catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const { notes, use_real_payout = false, demo_mode = false } = req.body;
    
    const payment = await VendorPayment.findById(paymentId)
      .populate('order_id')
      .populate({
        path: 'quote_id',
        populate: { path: 'product_id' }
      });
    
    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
    }
    
    if (payment.payment_status !== 'pending' && payment.payment_status !== 'processing') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment already processed');
    }
    
    // Get vendor KYC for bank details
    const vendorKyc = await VendorKyc.findOne({ vendor_id: payment.vendor_id });
    
    if (!vendorKyc) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor KYC not found. Cannot process payout.');
    }
    
    // Check if bank details are complete
    const bankDetails = vendorKyc.Bank;
    if (!bankDetails?.account_number || !bankDetails?.ifsc_code || !bankDetails?.account_holder_name) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor bank details incomplete. Please update bank details in KYC.');
    }
    
    // Get product info for notifications
    let productName = 'Product';
    let productType = 'Order';
    
    if (payment.quote_id) {
      productName = payment.quote_id.product_id?.product_name || 'Product';
      productType = payment.quote_id.product_id?.product_type_name || 'Rent';
    } else if (payment.order_id) {
      const vendorItems = payment.order_id.items?.filter(i => String(i.vendor_id) === String(payment.vendor_id)) || [];
      if (vendorItems.length > 0) {
        productName = vendorItems[0].product_name;
        if (vendorItems.length > 1) productName += ` (+${vendorItems.length - 1} more)`;
      }
      productType = 'Sell';
    }
    
    // DEMO MODE - Simulate payout without RazorpayX
    if (demo_mode) {
      console.log('[Demo Mode] Simulating payout for payment:', payment._id);
      
      // Simulate payout processing
      payment.payment_status = 'processing';
      payment.payout_id = `demo_payout_${Date.now()}`;
      payment.payout_status = 'processing';
      payment.released_at = new Date();
      payment.released_by = 'admin';
      payment.notes = notes || 'Demo payout - simulated';
      await payment.save();
      
      // Simulate webhook delay (in real scenario this takes 24-48 hours)
      // For demo, we auto-complete after 5 seconds
      setTimeout(async () => {
        try {
          payment.payment_status = 'released';
          payment.payout_status = 'processed';
          payment.notes = 'Demo payout completed successfully (simulated)';
          await payment.save();
          
          // Notify vendor
          const { sendNotificationToVendor } = require('../services/vendorNotification.service');
          await sendNotificationToVendor(
            payment.vendor_id,
            'Payment Received! 💰',
            `Your payment of ₹${payment.vendor_amount} for ${productType} "<b>${productName}</b>" has been successfully transferred to your bank account.`,
            'payment_update',
            { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
          );
          
          console.log('[Demo Mode] Payout completed for payment:', payment._id);
        } catch (err) {
          console.error('[Demo Mode] Error completing payout:', err);
        }
      }, 5000);
      
      // Notify vendor about payout initiation
      try {
        const { sendNotificationToVendor } = require('../services/vendorNotification.service');
        await sendNotificationToVendor(
          payment.vendor_id,
          'Payment Processing! 💸',
          `Your payment of ₹${payment.vendor_amount} for ${productType} "<b>${productName}</b>" is being transferred to your bank account.`,
          'payment_update',
          { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
        );
      } catch (notifErr) {
        console.error('Notification error:', notifErr);
      }
      
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'Demo payout initiated. Will complete in 5 seconds (simulating 24-48 hours).',
        data: {
          payment,
          payout_id: payment.payout_id,
          payout_status: payment.payout_status,
          demo_mode: true
        }
      });
    }
    
    // REAL PAYOUT - Process via RazorpayX
    if (use_real_payout) {
      const payoutResult = await processVendorPayout(payment, vendorKyc);
      
      if (!payoutResult.success) {
        throw new ApiError(httpStatus.BAD_REQUEST, `Payout failed: ${payoutResult.error}`);
      }
      
      // Notify vendor about payout initiation
      try {
        const { sendNotificationToVendor } = require('../services/vendorNotification.service');
        await sendNotificationToVendor(
          payment.vendor_id,
          'Payment Processing! 💸',
          `Your payment of ₹${payment.vendor_amount} for ${productType} "<b>${productName}</b>" is being transferred to your bank account. It will reflect in 24-48 hours.`,
          'payment_update',
          { paymentId: String(payment._id), amount: String(payment.vendor_amount), payoutId: payoutResult.payout_id }
        );
      } catch (notifErr) {
        console.error('Payment processing notification error:', notifErr);
      }
      
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'Payout initiated successfully. Money will be transferred to vendor bank account in 24-48 hours.',
        data: {
          payment,
          payout_id: payoutResult.payout_id,
          payout_status: payoutResult.status
        }
      });
    }
    
    // SIMPLE RELEASE - Just mark as released (for testing/manual)
    payment.payment_status = 'released';
    payment.released_at = new Date();
    payment.released_by = 'admin';
    if (notes) payment.notes = notes;
    
    await payment.save();

    // Notify vendor about payment release
    try {
      const { sendNotificationToVendor } = require('../services/vendorNotification.service');
      const deliveredAt = payment.delivered_at ? new Date(payment.delivered_at) : new Date();
      const releaseDate = payment.release_date ? new Date(payment.release_date) : new Date();
      const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

      await sendNotificationToVendor(
        payment.vendor_id,
        'Payment Released! 💰',
        `Your payment of ₹${payment.vendor_amount} for ${productType} "<b>${productName}</b>" has been released. Period: ${fmt(deliveredAt)} to ${fmt(releaseDate)}.`,
        'payment_update',
        { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
      );
    } catch (notifErr) {
      console.error('Payment release notification error:', notifErr);
    }
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Payment released successfully (manual release, no bank transfer)',
      data: { payment }
    });
  })
};

// Get payment statistics
const getPaymentStats = {
  handler: catchAsync(async (req, res) => {
    const { vendor_id, type } = req.query;
    const filter = {};
    
    // If vendor is accessing their own stats, use req.user.id
    // If admin is accessing, use vendor_id from query
    if (req.user && req.user.id) {
      filter.vendor_id = req.user.id;
    } else if (vendor_id) {
      filter.vendor_id = vendor_id;
    }

    if (type === 'sell') {
      filter.order_id = { $exists: true, $ne: null };
    } else if (type === 'rent') {
      filter.quote_id = { $exists: true, $ne: null };
    }
    
    const stats = await VendorPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$payment_status',
          count: { $sum: 1 },
          total_amount: { $sum: '$vendor_amount' }
        }
      }
    ]);
    
    const formattedStats = {
      pending: { count: 0, amount: 0 },
      released: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 }
    };
    
    stats.forEach(stat => {
      formattedStats[stat._id] = {
        count: stat.count,
        amount: stat.total_amount
      };
    });
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Payment statistics retrieved successfully',
      data: { stats: formattedStats }
    });
  })
};

// Release specific order payment (admin only)
const releaseOrderPayment = {
  handler: catchAsync(async (req, res) => {
    const { orderId, vendorId } = req.params;
    const { notes } = req.body;
    
    const payment = await VendorPayment.findOne({
      order_id: orderId,
      vendor_id: vendorId
    });
    
    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Payment record not found for this order and vendor');
    }
    
    if (payment.payment_status !== 'pending') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment already processed');
    }
    
    payment.payment_status = 'released';
    payment.released_at = new Date();
    payment.released_by = 'admin';
    if (notes) payment.notes = notes;
    
    await payment.save();

    // Notify vendor about order payment release
    try {
      const { sendNotificationToVendor } = require('../services/vendorNotification.service');
      const deliveredAt = payment.delivered_at ? new Date(payment.delivered_at) : new Date();
      const releaseDate = payment.release_date ? new Date(payment.release_date) : new Date();
      const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      await sendNotificationToVendor(
        payment.vendor_id,
        'Payment Released! 💰',
        `Your payment of ₹${payment.vendor_amount} has been released. Period: ${fmt(deliveredAt)} to ${fmt(releaseDate)}.`,
        'payment_update',
        { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
      );
    } catch (notifErr) {
      console.error('Order payment release notification error:', notifErr);
    }
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Order payment released successfully',
      data: { payment }
    });
  })
};

// Release scheduled payments manually (admin only)
const releaseScheduledPayments = {
  handler: catchAsync(async (req, res) => {
    const currentDate = new Date();
    
    // Find payments that are pending and past their release date
    const paymentsToRelease = await VendorPayment.find({
      payment_status: 'pending',
      release_date: { $lte: currentDate }
    });
    
    if (paymentsToRelease.length === 0) {
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'No payments to release',
        data: { releasedCount: 0 }
      });
    }
    
    // Update payments to released status
    const updatePromises = paymentsToRelease.map(payment => {
      payment.payment_status = 'released';
      payment.released_at = currentDate;
      payment.released_by = 'admin';
      return payment.save();
    });
    
    await Promise.all(updatePromises);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: `Released ${paymentsToRelease.length} scheduled payments successfully`,
      data: { 
        releasedCount: paymentsToRelease.length,
        payments: paymentsToRelease.map(p => ({
          payment_id: p._id,
          vendor_id: p.vendor_id,
          vendor_amount: p.vendor_amount,
          order_id: p.order_id
        }))
      }
    });
  })
};

// Cancel payment (admin only)
const cancelPayment = {
  handler: catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const { reason } = req.body;
    
    const payment = await VendorPayment.findById(paymentId);
    
    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
    }
    
    if (payment.payment_status !== 'pending') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment already processed');
    }
    
    payment.payment_status = 'cancelled';
    payment.notes = reason || 'Cancelled by admin';
    
    await payment.save();
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Payment cancelled successfully',
      data: { payment }
    });
  })
};

// Release multiple payments (admin only) - With Real Money Transfer
const releaseBulkPayments = {
  handler: catchAsync(async (req, res) => {
    const { paymentIds, notes, use_real_payout = true } = req.body;
    
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No payment IDs provided');
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const paymentId of paymentIds) {
      try {
        const payment = await VendorPayment.findById(paymentId);
        
        if (!payment || payment.payment_status !== 'pending') {
          results.failed.push({ paymentId, reason: 'Payment not found or already processed' });
          continue;
        }
        
        const vendorKyc = await VendorKyc.findOne({ vendor_id: payment.vendor_id });
        
        if (!vendorKyc || !vendorKyc.Bank?.account_number || !vendorKyc.Bank?.ifsc_code || !vendorKyc.Bank?.account_holder_name) {
          results.failed.push({ paymentId, reason: 'Vendor bank details incomplete' });
          continue;
        }
        
        if (use_real_payout) {
          const payoutResult = await processVendorPayout(payment, vendorKyc);
          
          if (payoutResult.success) {
            results.success.push({ paymentId, payout_id: payoutResult.payout_id });
          } else {
            results.failed.push({ paymentId, reason: payoutResult.error });
          }
        } else {
          payment.payment_status = 'released';
          payment.released_at = new Date();
          payment.released_by = 'admin';
          payment.notes = notes || 'Bulk released by admin';
          await payment.save();
          results.success.push({ paymentId });
        }
      } catch (error) {
        results.failed.push({ paymentId, reason: error.message });
      }
    }
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: `Processed ${results.success.length} payments. ${results.failed.length} failed.`,
      data: results
    });
  })
};

module.exports = {
  getVendorPayments,
  getAllVendorPayments,
  releasePayment,
  releaseOrderPayment,
  getPaymentStats,
  releaseScheduledPayments,
  cancelPayment,
  releaseBulkPayments
};