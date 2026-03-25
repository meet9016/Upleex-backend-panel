const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Order = require('../models/order.model');
const VendorPayment = require('../models/vendorPayment.model');

const getVendorOrders = {
  handler: catchAsync(async (req, res) => {
    const vendorId = req.user.id;
    const { page = 1, limit = 10, status, search } = req.query;
    
    const filter = {
      'items.vendor_id': vendorId
    };
    
    if (status) {
      filter.vendor_status = status;
    }
    
    if (search) {
      filter.$or = [
        { order_id: { $regex: search, $options: 'i' } },
        { user_name: { $regex: search, $options: 'i' } },
        { user_email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user_id', 'name email phone')
      .populate('items.product_id', 'name images sku');
    
    // Filter orders to show only this vendor's items and payment info
    const vendorOrders = await Promise.all(orders.map(async (order) => {
      // Filter items to show only this vendor's products
      const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
      
      // Find vendor payment info from VendorPayment collection
      const vendorPayment = await VendorPayment.findOne({
        order_id: order._id,
        vendor_id: vendorId
      });
      
      // Calculate vendor-specific totals
      const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.subtotal, 0);
      const vendorGstAmount = vendorItems.reduce((sum, item) => sum + item.gst_amount, 0);
      const vendorTotalAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0);
      
      return {
        ...order.toObject(),
        items: vendorItems, // Only this vendor's items
        subtotal: vendorSubtotal,
        gst_amount: vendorGstAmount,
        total_amount: vendorTotalAmount,
        vendor_payment_info: vendorPayment ? {
          payment_id: vendorPayment._id,
          vendor_amount: vendorPayment.vendor_amount,
          payment_status: vendorPayment.payment_status,
          delivered_at: vendorPayment.delivered_at,
          release_date: vendorPayment.release_date,
          released_at: vendorPayment.released_at,
          released_by: vendorPayment.released_by,
          notes: vendorPayment.notes
        } : null,
        // Add payment status indicator
        payment_status_info: {
          has_payment_record: !!vendorPayment,
          is_delivered: order.vendor_status === 'delivered',
          payment_status: vendorPayment ? vendorPayment.payment_status : 'no_payment',
          can_be_released: vendorPayment && vendorPayment.payment_status === 'pending' && new Date() >= new Date(vendorPayment.release_date)
        }
      };
    }));
    
    const total = await Order.countDocuments(filter);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Orders retrieved successfully',
      data: {
        orders: vendorOrders,
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

const updateOrderStatus = {
  handler: catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const { status, notes } = req.body;
    const vendorId = req.user.id;
    
    const order = await Order.findOne({
      _id: orderId,
      'items.vendor_id': vendorId
    });
    
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    const validStatuses = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status');
    }
    
    order.vendor_status = status;
    
    // Create payment record when order is delivered (only if not already created)
    if (status === 'delivered') {
      // Check if payment record already exists for this order and vendor
      const existingPayment = await VendorPayment.findOne({
        order_id: order._id,
        vendor_id: vendorId
      });
      
      if (!existingPayment) {
        const deliveredAt = new Date();
        const releaseDate = new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
        
        // Calculate vendor amount based on vendor's items only
        const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
        const vendorAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0) * 0.9; // 10% admin commission
        
        // Create payment record regardless of user payment status
        // Admin will handle payment release based on user payment verification
        await VendorPayment.create({
          order_id: order._id,
          vendor_id: vendorId,
          vendor_amount: vendorAmount,
          delivered_at: deliveredAt,
          release_date: releaseDate,
          payment_status: 'pending', // Always start as pending for admin review
          notes: 'Payment record created on delivery. Awaiting admin verification of user payment.'
        });
        
        console.log(`Created payment record for order ${order.order_id}, vendor ${vendorId}`);
      } else {
        console.log(`Payment record already exists for order ${order.order_id}, vendor ${vendorId}`);
      }
    }
    
    // If status is changed from delivered to something else, we might want to handle the payment record
    if (order.vendor_status === 'delivered' && status !== 'delivered') {
      // Find and update payment record if it exists and is still pending
      const existingPayment = await VendorPayment.findOne({
        order_id: order._id,
        vendor_id: vendorId,
        payment_status: 'pending'
      });
      
      if (existingPayment) {
        // You can choose to delete it or mark it as cancelled
        await VendorPayment.findByIdAndDelete(existingPayment._id);
        console.log(`Removed payment record for order ${order.order_id} as status changed from delivered`);
      }
    }
    
    if (notes) {
      order.delivery_tracking.delivery_updates.push({
        status,
        message: notes,
        timestamp: new Date(),
        updated_by: 'vendor'
      });
    }
    
    await order.save();
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Order status updated successfully',
      data: { order }
    });
  })
};

const getOrderDetails = {
  handler: catchAsync(async (req, res) => {
    const { orderId } = req.params;
    const vendorId = req.user.id;
    
    const order = await Order.findOne({
      _id: orderId,
      'items.vendor_id': vendorId
    })
    .populate('user_id', 'name email phone')
    .populate('items.product_id', 'name images description sku');
    
    if (!order) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
    }
    
    // Filter items to show only this vendor's products
    const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
    
    // Find vendor payment info from VendorPayment collection
    const vendorPayment = await VendorPayment.findOne({
      order_id: order._id,
      vendor_id: vendorId
    });
    
    // Calculate vendor-specific totals
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.subtotal, 0);
    const vendorGstAmount = vendorItems.reduce((sum, item) => sum + item.gst_amount, 0);
    const vendorTotalAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0);
    
    const vendorOrderDetails = {
      ...order.toObject(),
      items: vendorItems, // Only this vendor's items
      subtotal: vendorSubtotal,
      gst_amount: vendorGstAmount,
      total_amount: vendorTotalAmount,
      vendor_payment_info: vendorPayment ? {
        payment_id: vendorPayment._id,
        vendor_amount: vendorPayment.vendor_amount,
        payment_status: vendorPayment.payment_status,
        delivered_at: vendorPayment.delivered_at,
        release_date: vendorPayment.release_date,
        released_at: vendorPayment.released_at,
        released_by: vendorPayment.released_by,
        notes: vendorPayment.notes
      } : null,
      // Add payment status indicator
      payment_status_info: {
        has_payment_record: !!vendorPayment,
        is_delivered: order.vendor_status === 'delivered',
        payment_status: vendorPayment ? vendorPayment.payment_status : 'no_payment',
        can_be_released: vendorPayment && vendorPayment.payment_status === 'pending' && new Date() >= new Date(vendorPayment.release_date)
      }
    };
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Order details retrieved successfully',
      data: { order: vendorOrderDetails }
    });
  })
};

const getDeliveryStatusOptions = {
  handler: catchAsync(async (req, res) => {
    const statusOptions = [
      { value: 'pending', label: 'Pending' },
      { value: 'accepted', label: 'Accepted' },
      { value: 'preparing', label: 'Preparing' },
      { value: 'ready_for_pickup', label: 'Ready for Pickup' },
      { value: 'picked_up', label: 'Picked Up' },
      { value: 'out_for_delivery', label: 'Out for Delivery' },
      { value: 'delivered', label: 'Delivered' },
      { value: 'cancelled', label: 'Cancelled' }
    ];
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Status options retrieved successfully',
      data: { statusOptions }
    });
  })
};

const bulkUpdateOrderStatus = {
  handler: catchAsync(async (req, res) => {
    const { orderIds, status, notes } = req.body;
    const vendorId = req.user.id;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Order IDs are required');
    }
    
    const validStatuses = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status');
    }
    
    const orders = await Order.find({
      _id: { $in: orderIds },
      'items.vendor_id': vendorId
    });
    
    if (orders.length !== orderIds.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Some orders not found or not accessible');
    }
    
    const updatePromises = orders.map(async (order) => {
      order.vendor_status = status;
      
      // Create payment record when order is delivered (only if not already created)
      if (status === 'delivered') {
        // Check if payment record already exists for this order and vendor
        const existingPayment = await VendorPayment.findOne({
          order_id: order._id,
          vendor_id: vendorId
        });
        
        if (!existingPayment) {
          const deliveredAt = new Date();
          const releaseDate = new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days later
          
          // Calculate vendor amount based on vendor's items only
          const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
          const vendorAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0) * 0.9; // 10% admin commission
          
          // Create payment record regardless of user payment status
          await VendorPayment.create({
            order_id: order._id,
            vendor_id: vendorId,
            vendor_amount: vendorAmount,
            delivered_at: deliveredAt,
            release_date: releaseDate,
            payment_status: 'pending',
            notes: 'Payment record created on delivery. Awaiting admin verification of user payment.'
          });
        }
      }
      
      if (notes) {
        order.delivery_tracking.delivery_updates.push({
          status,
          message: notes,
          timestamp: new Date(),
          updated_by: 'vendor'
        });
      }
      
      return order.save();
    });
    
    await Promise.all(updatePromises);
    
    res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: `${orders.length} orders updated successfully`,
      data: { updatedCount: orders.length }
    });
  })
};

module.exports = {
  getVendorOrders,
  updateOrderStatus,
  getOrderDetails,
  getDeliveryStatusOptions,
  bulkUpdateOrderStatus
};