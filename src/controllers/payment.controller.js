const httpStatus = require('http-status');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { Cart, Product, Order, Wallet } = require('../models');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const { sendOrderConfirmationEmail } = require('../services/email.service');

// Initialize Razorpay
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: config.razorpay.keyId || process.env.RAZORPAY_KEY_ID,
    key_secret: config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET,
  });
} catch (error) {
  console.error('Failed to initialize Razorpay:', error);
}

// Generate unique order ID
const generateOrderId = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `UPX${timestamp.slice(-6)}${random}`;
};

// Create Razorpay order
const createOrder = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to create order');
  }

  const { order_notes, payment_type } = req.body;

  // Get user email from database if not in request
  let userEmail = req.user.email;
  if (!userEmail || !userEmail.includes('@')) {
    const User = require('../models/user.model');
    const userFromDB = await User.findById(req.user.id);
    if (userFromDB && userFromDB.email) {
      userEmail = userFromDB.email;
    }
  }

  // Get user's cart items
  const cartItems = await Cart.find({
    user_id: req.user.id,
    status: 'active',
  }).populate('product_id');

  if (!cartItems.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cart is empty');
  }

  // Calculate totals and group by vendor
  let subtotal = 0;
  let gstAmount = 0;
  const vendorGroups = {};
  const orderItems = [];

  for (const cartItem of cartItems) {
    const product = cartItem.product_id;
    if (!product) {
      continue;
    }

    // Check stock availability for sell products
    if (product.product_type_name === 'Sell') {
      if (product.is_out_of_stock || product.available_quantity < cartItem.qty) {
        throw new ApiError(
          httpStatus.BAD_REQUEST, 
          `Product "${product.product_name}" is out of stock or insufficient quantity available. Available: ${product.available_quantity}, Requested: ${cartItem.qty}`
        );
      }
    }

    const price = Number(product.price) || 0;
    const quantity = Number(cartItem.qty) || 1;
    const itemSubtotal = price * quantity;
    const itemGst = Math.round(itemSubtotal * 0.18); // 18% GST
    const itemFinalAmount = itemSubtotal + itemGst;

    subtotal += itemSubtotal;
    gstAmount += itemGst;

    const orderItem = {
      product_id: product._id,
      vendor_id: product.vendor_id,
      product_name: product.product_name,
      product_image: product.product_main_image || '',
      price: price,
      quantity: quantity,
      subtotal: itemSubtotal,
      gst_amount: itemGst,
      final_amount: itemFinalAmount,
    };

    orderItems.push(orderItem);

    // Group by vendor for payment distribution
    if (!vendorGroups[product.vendor_id]) {
      vendorGroups[product.vendor_id] = {
        vendor_id: product.vendor_id,
        vendor_amount: 0,
        payment_status: 'pending',
      };
    }
    vendorGroups[product.vendor_id].vendor_amount += itemFinalAmount;
  }

  const deliveryCharges = 0; // Free delivery for now
  const installationCharges = 0; // Free installation for now
  const depositAmount = 0; // No deposit for now
  const totalAmount = subtotal + gstAmount + deliveryCharges + installationCharges + depositAmount;

  let amountToPay = totalAmount;
  if (payment_type === '30_percent') {
    amountToPay = totalAmount * 0.3;
  }

  // Create order ID
  const orderId = generateOrderId();

// Check if Razorpay keys are configured
  const razorpayKeyId = config.razorpay.keyId || process.env.RAZORPAY_KEY_ID;
  const razorpayKeySecret = config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!razorpayKeyId || !razorpayKeySecret || razorpayKeyId === 'rzp_test_your_key_id_here' || razorpayKeyId.includes('your_key_id')) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Razorpay keys not configured properly');
  }

  try {
    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amountToPay * 100), // Amount in paise
      currency: 'INR',
      receipt: orderId,
      notes: {
        order_id: orderId,
        user_id: req.user.id,
        user_email: req.user.email || '',
      },
    });

    // Create order in database
    const order = await Order.create({
      order_id: orderId,
      user_id: req.user.id,
      user_name: req.user.name || req.user.full_name || req.user.username || 'User',
      user_email: userEmail || '', // Use the email we fetched
      user_phone: req.user.phone || req.user.mobile || '',
      items: orderItems,
      subtotal: subtotal,
      gst_amount: gstAmount,
      delivery_charges: deliveryCharges,
      installation_charges: installationCharges,
      deposit_amount: depositAmount,
      total_amount: totalAmount,
      payment_type: payment_type || 'full',
      razorpay_order_id: razorpayOrder.id,
      order_notes: order_notes || '',
      vendor_payments: Object.values(vendorGroups),
    });

    res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: orderId,
        razorpay_order_id: razorpayOrder.id,
        amount: amountToPay,
        currency: 'INR',
        key: razorpayKeyId,
        order_details: order,
      },
    });
  } catch (razorpayError) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, `Razorpay error: ${razorpayError.message}`);
  }
});

// Verify payment and update order
const verifyPayment = catchAsync(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !order_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Missing payment verification data');
  }

  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET)
    .update(body.toString())
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid payment signature');
  }

  // Find and update order
  const order = await Order.findOne({ order_id: order_id });
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  // Update order with payment details
  order.payment_status = order.payment_type === '30_percent' ? 'hold' : 'paid';
  order.order_status = 'confirmed';
  order.razorpay_payment_id = razorpay_payment_id;
  order.razorpay_signature = razorpay_signature;

  // Update vendor payments to paid
  order.vendor_payments.forEach(vendorPayment => {
    vendorPayment.payment_status = 'paid';
    vendorPayment.paid_at = new Date();
  });

  await order.save();

  // Update cart items to ordered status
  await Cart.updateMany(
    { user_id: order.user_id, status: 'active' },
    { status: 'ordered' }
  );

  // Reduce available quantity for sell products
  for (const item of order.items) {
    try {
      const product = await Product.findById(item.product_id);
      
      if (!product) {
        continue;
      }
            
      if (product && product.product_type_name === 'Sell' && product.available_quantity > 0) {
        const newAvailableQuantity = Math.max(0, product.available_quantity - item.quantity);
        const isOutOfStock = newAvailableQuantity === 0;
        
        await Product.findByIdAndUpdate(item.product_id, {
          available_quantity: newAvailableQuantity,
          is_out_of_stock: isOutOfStock
        }, { new: true });
      }
    } catch (stockError) {
      console.error(`❌ Failed to update stock for product ${item.product_id}:`, stockError);
      // Don't fail the payment if stock update fails
    }
  }

  // Send order confirmation email
  try {
    const userEmail = order.user_email;
    
    if (userEmail && userEmail.includes('@')) {
      await sendOrderConfirmationEmail(userEmail, order.toObject());
    } else {
      // Try to get email from database as fallback
      const User = require('../models/user.model');
      const userFromDB = await User.findById(order.user_id);
      if (userFromDB && userFromDB.email) {
        const fallbackEmail = userFromDB.email;
        await sendOrderConfirmationEmail(fallbackEmail, order.toObject());
        // Update order with email for future reference
        order.user_email = fallbackEmail;
        await order.save();
      }
    }
  } catch (emailError) {
    // Don't fail the payment verification if email fails
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Payment verified successfully',
    data: {
      order_id: order.order_id,
      payment_status: order.payment_status,
      order_status: order.order_status,
    },
  });
});

// Get user orders
const getUserOrders = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view orders');
  }

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const orders = await Order.find({ user_id: req.user.id })
    .populate('user_id', 'name email phone mobile')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Order.countDocuments({ user_id: req.user.id });

  // Enrich orders with vendor details for invoices
  const enrichedOrders = await Promise.all(orders.map(async (order) => {
    const orderObj = order.toObject();
    
    // Get vendor info from the first item (standardizing on the primary seller for the order)
    const firstVendorId = order.items && order.items.length > 0 ? order.items[0].vendor_id : null;
    
    if (firstVendorId) {
      try {
        const mongoose = require('mongoose');
        const Vendor = mongoose.model('Vendor');
        const VendorKyc = mongoose.model('VendorKyc');
        
        const vendor = await Vendor.findById(firstVendorId).lean();
        if (vendor) {
          const kyc = await VendorKyc.findOne({ vendor_id: vendor._id }).lean();
          const identity = (kyc?.Identity && Array.isArray(kyc.Identity)) ? kyc.Identity[0] : (kyc?.Identity || {});
          const contact = (kyc?.ContactDetails && Array.isArray(kyc.ContactDetails)) ? kyc.ContactDetails[0] : (kyc?.ContactDetails || {});
          const docs = (kyc?.Documents && Array.isArray(kyc.Documents)) ? kyc.Documents[0] : (kyc?.Documents || {});
          
          orderObj.vendor_details = [{
            business_name: identity.business_name || vendor.business_name || vendor.businessName || '',
            gst_number: identity.gst_number || vendor.gst_number || '',
            business_logo_image: docs.business_logo_image || vendor.business_logo_image || '',
            address: contact.address || vendor.address || '',
            city: contact.city_name || vendor.city_name || vendor.city || '',
            state: contact.state_name || vendor.state_name || vendor.state || '',
            pincode: contact.pincode || vendor.pincode || '',
            mobile: contact.mobile || vendor.mobile || vendor.number || vendor.phone || '',
            email: contact.email || vendor.email || ''
          }];
        }
      } catch (e) {
        console.error('Error fetching vendor details for order enrichment:', e);
      }
    }
    
    return orderObj;
  }));

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Orders fetched successfully',
    data: {
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Get vendor orders (for vendor panel)
const getVendorOrders = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view orders');
  }

  const vendorId = req.user.id || req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Find orders that contain products from this vendor
  const orders = await Order.find({
    'items.vendor_id': vendorId,
    payment_status: 'paid', // Only show paid orders
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Filter items to show only this vendor's products
  const vendorOrders = orders.map(order => {
    const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
    const vendorPayment = order.vendor_payments.find(vp => vp.vendor_id === vendorId);
    
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
      vendor_amount: vendorPayment ? vendorPayment.vendor_amount : 0,
      vendor_payment_status: vendorPayment ? vendorPayment.payment_status : 'pending',
      vendor_paid_at: vendorPayment ? vendorPayment.paid_at : null,
      vendor_payment_info: vendorPayment
    };
  });

  const total = await Order.countDocuments({
    'items.vendor_id': vendorId,
    payment_status: 'paid',
  });

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Vendor orders fetched successfully',
    data: {
      orders: vendorOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Get vendor payment history
const getVendorPaymentHistory = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view payment history');
  }

  const vendorId = req.user.id || req.user._id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Get payment history for this vendor - include both paid and pending orders
  const orders = await Order.find({
    'vendor_payments.vendor_id': vendorId,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const paymentHistory = orders.map(order => {
    const vendorPayment = order.vendor_payments.find(vp => vp.vendor_id === vendorId);
    const vendorItems = order.items.filter(item => item.vendor_id === vendorId);
    
    // Calculate vendor-specific totals
    const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.subtotal, 0);
    const vendorGstAmount = vendorItems.reduce((sum, item) => sum + item.gst_amount, 0);
    const vendorTotalAmount = vendorItems.reduce((sum, item) => sum + item.final_amount, 0);
    
    return {
      order_id: order.order_id,
      order_date: order.createdAt,
      customer_name: order.user_name || 'N/A',
      customer_email: order.user_email || 'N/A',
      items: vendorItems, // Only vendor's items
      items_count: vendorItems.length,
      vendor_subtotal: vendorSubtotal,
      vendor_gst_amount: vendorGstAmount,
      vendor_total_amount: vendorTotalAmount,
      vendor_amount: vendorPayment ? vendorPayment.vendor_amount : 0,
      payment_type: order.payment_type || 'full',
      payment_status: order.payment_status,
      paid_at: (order.payment_status === 'paid' || order.payment_status === 'hold') ? (vendorPayment?.paid_at || order.updatedAt) : null,
      order_status: order.order_status,
      razorpay_payment_id: order.razorpay_payment_id || '',
      vendor_payment_info: vendorPayment
    };
  });

  const total = await Order.countDocuments({
    'vendor_payments.vendor_id': vendorId,
  });

  // Calculate total earnings (only from paid orders) - vendor specific
  const totalEarnings = await Order.aggregate([
    { $match: { 'vendor_payments.vendor_id': vendorId, payment_status: 'paid' } },
    { $unwind: '$vendor_payments' },
    { $match: { 'vendor_payments.vendor_id': vendorId } },
    { $group: { _id: null, total: { $sum: '$vendor_payments.vendor_amount' } } },
  ]);

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Payment history fetched successfully',
    data: {
      payment_history: paymentHistory,
      total_earnings: totalEarnings.length > 0 ? totalEarnings[0].total : 0,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

// Cancel order and restore stock
const cancelOrder = catchAsync(async (req, res) => {
  const { order_id } = req.params;
  const { reason } = req.body;

  const order = await Order.findOne({ order_id });
  if (!order) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Order not found');
  }

  if (order.order_status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Order is already cancelled');
  }

  if (['delivered', 'shipped', 'out_for_delivery'].includes(order.order_status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel order after it has been shipped');
  }

  // Restore stock for sell products
  for (const item of order.items) {
    try {
      const product = await Product.findById(item.product_id);
      if (product && product.product_type_name === 'Sell') {
        const newAvailableQuantity = product.available_quantity + item.quantity;
        const isOutOfStock = newAvailableQuantity === 0;
        
        await Product.findByIdAndUpdate(item.product_id, {
          available_quantity: newAvailableQuantity,
          is_out_of_stock: isOutOfStock
        });
        
      }
    } catch (stockError) {
      console.error(`❌ Failed to restore stock for product ${item.product_id}:`, stockError);
    }
  }

  // Update order status
  order.order_status = 'cancelled';
  order.order_notes = reason || 'Order cancelled by user';
  
  // Update vendor payments to cancelled
  order.vendor_payments.forEach(vendorPayment => {
    if (vendorPayment.payment_status === 'pending') {
      vendorPayment.payment_status = 'cancelled';
    }
  });

  await order.save();

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Order cancelled successfully and stock restored',
    data: { order_id: order.order_id, order_status: order.order_status }
  });
});

module.exports = {
  createOrder,
  verifyPayment,
  getUserOrders,
  getVendorOrders,
  getVendorPaymentHistory,
  cancelOrder
};