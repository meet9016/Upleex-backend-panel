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
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = { vendor_id: vendorId };
    
    if (status) {
      filter.payment_status = status;
    }
    
    const skip = (page - 1) * limit;
    
    const payments = await VendorPayment.find(filter)
      .populate('order_id', 'order_id total_amount user_name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await VendorPayment.countDocuments(filter);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Vendor payments retrieved successfully',
      data: {
        payments,
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
    const { page = 1, limit = 10, status, vendor_id } = req.query;
    
    const filter = {};
    
    if (status) {
      filter.payment_status = status;
    }
    
    if (vendor_id) {
      filter.vendor_id = vendor_id;
    }
    
    const skip = (page - 1) * limit;
    
    const payments = await VendorPayment.find(filter)
      .populate('order_id', 'order_id total_amount user_name')
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
            }
          };
        } catch (error) {
          console.error(`Error fetching vendor info for ${payment.vendor_id}:`, error);
          return {
            ...payment.toObject(),
            vendor_info: {
              full_name: `Vendor ${payment.vendor_id}`,
              business_name: `Business ${payment.vendor_id}`,
              email: 'N/A',
              number: 'N/A'
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
    
    payment.payment_status = 'released';
    payment.released_at = new Date();
    payment.released_by = 'admin';
    if (notes) payment.notes = notes;
    
    await payment.save();
    
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
    const { vendor_id } = req.query;
    const filter = vendor_id ? { vendor_id } : {};
    
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
    
    console.log(`Released ${paymentsToRelease.length} payments manually by admin`);
    
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

module.exports = {
  getVendorPayments,
  getAllVendorPayments,
  releasePayment,
  releaseOrderPayment,
  getPaymentStats,
  releaseScheduledPayments
};