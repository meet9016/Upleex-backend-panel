const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const VendorPayment = require('../models/vendorPayment.model');
const Order = require('../models/order.model');
const Vendor = require('../models/vendor/vendor.model');

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

// Release payment manually (admin only)
const releasePayment = {
  handler: catchAsync(async (req, res) => {
    const { paymentId } = req.params;
    const { notes } = req.body;
    
    const payment = await VendorPayment.findById(paymentId);
    
    if (!payment) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
    }
    
    if (payment.payment_status !== 'pending') {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Payment already processed');
    }
    
    // Admin can release payment anytime, regardless of release date
    payment.payment_status = 'released';
    payment.released_at = new Date();
    payment.released_by = 'admin';
    if (notes) payment.notes = notes;
    
    await payment.save();

    // Notify vendor about payment release with dates
    try {
      const { sendNotificationToVendor } = require('../services/vendorNotification.service');
      const deliveredAt = payment.delivered_at ? new Date(payment.delivered_at) : new Date();
      const releaseDate = payment.release_date ? new Date(payment.release_date) : new Date();
      const fmt = (d) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
      await sendNotificationToVendor(
        payment.vendor_id,
        'Payment Released! 💰',
        `Your payment of ₹${payment.vendor_amount} has been released. Period: ${fmt(deliveredAt)} to ${fmt(releaseDate)}.`,
        'order_request',
        { paymentId: String(payment._id), amount: String(payment.vendor_amount) }
      );
    } catch (notifErr) {
      console.error('Payment release notification error:', notifErr);
    }
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Payment released successfully',
      data: { payment }
    });
  })
};

// Get payment statistics
const getPaymentStats = {
  handler: catchAsync(async (req, res) => {
    const { vendor_id, type } = req.query;
    const filter = vendor_id ? { vendor_id } : {};

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
        'order_request',
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

// Release multiple payments (admin only)
const releaseBulkPayments = {
  handler: catchAsync(async (req, res) => {
    const { paymentIds, notes } = req.body;
    
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No payment IDs provided');
    }
    
    const currentDate = new Date();
    
    // Update multiple payments
    const result = await VendorPayment.updateMany(
      { 
        _id: { $in: paymentIds },
        payment_status: 'pending' 
      },
      {
        $set: {
          payment_status: 'released',
          released_at: currentDate,
          released_by: 'admin',
          notes: notes || 'Bulk released by admin'
        }
      }
    );
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: `Successfully released ${result.modifiedCount} payments`,
      data: { releasedCount: result.modifiedCount }
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