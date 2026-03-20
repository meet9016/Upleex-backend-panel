const VendorPayment = require('../models/vendorPayment.model');

/**
 * Release payments that are due (7 days after delivery)
 */
const releaseScheduledPayments = async () => {
  try {
    const currentDate = new Date();
    
    // Find payments that are pending and past their release date
    const paymentsToRelease = await VendorPayment.find({
      payment_status: 'pending',
      release_date: { $lte: currentDate }
    });
    
    if (paymentsToRelease.length === 0) {
      console.log('No payments to release');
      return;
    }
    
    // Update payments to released status
    const updatePromises = paymentsToRelease.map(payment => {
      payment.payment_status = 'released';
      payment.released_at = currentDate;
      payment.released_by = 'system';
      return payment.save();
    });
    
    await Promise.all(updatePromises);
    
    console.log(`Released ${paymentsToRelease.length} payments automatically`);
    
    return {
      success: true,
      releasedCount: paymentsToRelease.length,
      payments: paymentsToRelease
    };
    
  } catch (error) {
    console.error('Error releasing scheduled payments:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Get payments summary for dashboard
 */
const getPaymentsSummary = async (vendorId = null) => {
  try {
    const filter = vendorId ? { vendor_id: vendorId } : {};
    
    const summary = await VendorPayment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total_pending: {
            $sum: {
              $cond: [{ $eq: ['$payment_status', 'pending'] }, '$vendor_amount', 0]
            }
          },
          total_released: {
            $sum: {
              $cond: [{ $eq: ['$payment_status', 'released'] }, '$vendor_amount', 0]
            }
          },
          pending_count: {
            $sum: {
              $cond: [{ $eq: ['$payment_status', 'pending'] }, 1, 0]
            }
          },
          released_count: {
            $sum: {
              $cond: [{ $eq: ['$payment_status', 'released'] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    return summary[0] || {
      total_pending: 0,
      total_released: 0,
      pending_count: 0,
      released_count: 0
    };
    
  } catch (error) {
    console.error('Error getting payments summary:', error);
    throw error;
  }
};

module.exports = {
  releaseScheduledPayments,
  getPaymentsSummary
};