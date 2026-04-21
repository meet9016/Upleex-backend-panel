const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const Order = require('../models/order.model');
const VendorPayment = require('../models/vendorPayment.model');

const getVendorOrders = {
  handler: catchAsync(async (req, res) => {
    const vendorId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search,
      payment_status,
      date_from,
      date_to,
      sort_by,
      sort_order
    } = req.query;
    
    const filter = {
      'items.vendor_id': vendorId
    };
    
    // Multiple status filter support
    if (status) {
      const statusValues = Array.isArray(status) ? status : status.split(',');
      filter.vendor_status = statusValues.length === 1 ? statusValues[0] : { $in: statusValues };
    }
    
    // Payment status filter
    if (payment_status) {
      const paymentValues = Array.isArray(payment_status) ? payment_status : payment_status.split(',');
      filter.payment_status = paymentValues.length === 1 ? paymentValues[0] : { $in: paymentValues };
    }
    
    // Date range filter
    if (date_from || date_to) {
      filter.createdAt = {};
      if (date_from) filter.createdAt.$gte = new Date(date_from);
      if (date_to) filter.createdAt.$lte = new Date(date_to);
    }
    
    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { order_id: searchRegex },
        { user_name: searchRegex },
        { user_email: searchRegex },
        { 'user_id.name': searchRegex },
        { 'user_id.email': searchRegex }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 }; // default sort
    if (sort_by) {
      const sortOrderValue = sort_order === 'asc' ? 1 : -1;
      switch (sort_by) {
        case 'date':
          sortOptions = { createdAt: sortOrderValue };
          break;
        case 'amount':
          sortOptions = { total_amount: sortOrderValue };
          break;
        case 'status':
          sortOptions = { vendor_status: sortOrderValue };
          break;
        case 'order_id':
          sortOptions = { order_id: sortOrderValue };
          break;
        default:
          sortOptions = { createdAt: -1 };
      }
    }
    
    const orders = await Order.find(filter)
      .sort(sortOptions)
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
    
    const validStatuses = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'completed'];
    
    if (!validStatuses.includes(status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid status');
    }
    
    const oldStatus = order.vendor_status;
    order.vendor_status = status;
    
    // Create payment record when order is delivered or completed (only if not already created)
    if (status === 'delivered' || status === 'completed') {
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
        const vendorAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0); // No admin commission cut
        
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
        
      } else {
        console.log(`Payment record already exists for order ${order.order_id}, vendor ${vendorId}`);
      }
    }
    
    // If status is changed from delivered/completed to something else, we might want to handle the payment record
    if ((oldStatus === 'delivered' || oldStatus === 'completed') && (status !== 'delivered' && status !== 'completed')) {
      // Find and update payment record if it exists and is still pending
      const existingPayment = await VendorPayment.findOne({
        order_id: order._id,
        vendor_id: vendorId,
        payment_status: 'pending'
      });
      
      if (existingPayment) {
        // You can choose to delete it or mark it as cancelled
        await VendorPayment.findByIdAndDelete(existingPayment._id);
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
      { value: 'completed', label: 'Completed' },
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
    
    const validStatuses = ['pending', 'accepted', 'preparing', 'ready_for_pickup', 'picked_up', 'out_for_delivery', 'delivered', 'cancelled', 'completed'];
    
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
      
      // Create payment record when order is delivered or completed (only if not already created)
      if (status === 'delivered' || status === 'completed') {
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
          const vendorAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0); // No admin commission cut
          
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