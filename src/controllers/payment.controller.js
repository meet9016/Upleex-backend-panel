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

  const { order_notes, payment_type, delivery_type, address_id, shipping_charge } = req.body;

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

  // Fetch address details if Courier Shipping is selected
  let shippingAddressDetails = null;
  if (delivery_type === 'shipping') {
    if (!address_id) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Address ID is required for courier shipping');
    }
    const AddressModel = require('../models/address.model');
    const selectedAddress = await AddressModel.findOne({ _id: address_id, user_id: req.user.id });
    if (!selectedAddress) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Selected shipping address not found');
    }
    shippingAddressDetails = {
      name: selectedAddress.name,
      phone: selectedAddress.phone,
      alternate_phone: selectedAddress.alternate_phone || '',
      address_line1: selectedAddress.address_line1,
      address_line2: selectedAddress.address_line2 || '',
      city: selectedAddress.city,
      state: selectedAddress.state,
      pincode: selectedAddress.pincode,
      country: selectedAddress.country || 'India',
    };
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
    const itemGst = Number((itemSubtotal * 0.18).toFixed(2)); // 18% GST with float precision
    const itemFinalAmount = Number((itemSubtotal + itemGst).toFixed(2));

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
      sku: product.sku || '',
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

  // Round vendor amounts to prevent floating point issues
  for (const vendorId in vendorGroups) {
    vendorGroups[vendorId].vendor_amount = Number(vendorGroups[vendorId].vendor_amount.toFixed(2));
  }

  let deliveryCharges = 0;
  if (delivery_type === 'shipping') {
    deliveryCharges = Number(shipping_charge) || 0;
  }
  const installationCharges = 0; // Free installation for now
  const depositAmount = 0; // No deposit for now
  
  const totalAmount = Number((subtotal + gstAmount + deliveryCharges + installationCharges + depositAmount).toFixed(2));

  let amountToPay = totalAmount;
  if (payment_type === '30_percent') {
    amountToPay = Math.round(totalAmount * 0.3);
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
      delivery_type: delivery_type || 'face_to_face',
      shipping_address: shippingAddressDetails,
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

// Sync order to Shiprocket for shipping delivery type
const syncOrderToShiprocket = async (order) => {
  console.log('order',order)
  console.log('\n========================================');
  console.log('[Shiprocket] ▶ syncOrderToShiprocket triggered');
  console.log(`[Shiprocket]   Order ID      : ${order.order_id}`);
  console.log(`[Shiprocket]   delivery_type : ${order.delivery_type}`);
  console.log(`[Shiprocket]   Already synced: ${!!order.shiprocket_shipment_id}`);
  console.log('========================================\n');

  if (order.delivery_type === 'shipping' && !order.shiprocket_shipment_id) {
    try {
      const moment = require('moment');
      const shiprocketService = require('../services/shiprocket.service');
      const formattedDate = moment(order.createdAt).format('YYYY-MM-DD HH:mm');

      console.log('[Shiprocket] Checking shipping_address:', JSON.stringify(order.shipping_address, null, 2));
      
      const getValidAddress = (line1, line2, city, state) => {
        let addr1 = String(line1 || '').trim();
        let addr2 = String(line2 || '').trim();
        
        console.log('[Shiprocket] Raw address parts:', { addr1, addr2, city, state });
        
        if (!addr1 && !addr2) {
          addr1 = 'Customer Address';
          if (city) {
            addr2 = city + (state ? ', ' + state : '');
          }
        } else if ((addr1 + ' ' + addr2).trim().length < 3) {
          if (addr1.length < 3) {
            addr1 = addr2.length >= 3 ? addr2 : 'Customer Address';
            addr2 = addr1 === 'Customer Address' ? (city || '') : '';
          }
        }
        
        const finalAddr1 = addr1;
        const finalAddr2 = addr2;
        const combined = (finalAddr1 + ' ' + finalAddr2).trim();
        
        console.log('[Shiprocket] Final address:', { finalAddr1, finalAddr2, combined, length: combined.length });
        
        return { addr1: finalAddr1, addr2: finalAddr2 };
      };

      const { addr1: billingAddr1, addr2: billingAddr2 } = getValidAddress(
        order.shipping_address?.address_line1,
        order.shipping_address?.address_line2,
        order.shipping_address?.city,
        order.shipping_address?.state
      );
      const { addr1: shippingAddr1, addr2: shippingAddr2 } = getValidAddress(
        order.shipping_address?.address_line1,
        order.shipping_address?.address_line2,
        order.shipping_address?.city,
        order.shipping_address?.state
      );

      const shiprocketPayload = {
        order_id: order.order_id,
        order_date: formattedDate,
        pickup_location: 'Home',
        comment: order.order_notes || 'Upleex Order',
        reseller_name: '',
        company_name: 'Upleex',
        billing_customer_name: order.shipping_address?.name?.split(' ')[0] || order.user_name?.split(' ')[0] || 'Customer',
        billing_last_name: order.shipping_address?.name?.split(' ').slice(1).join(' ') || '',
        billing_address: billingAddr1,
        billing_address_2: billingAddr2,
        billing_isd_code: '91',
        billing_city: order.shipping_address?.city || '',
        billing_pincode: order.shipping_address?.pincode || '',
        billing_state: order.shipping_address?.state || '',
        billing_country: order.shipping_address?.country || 'India',
        billing_email: order.user_email || 'customer@upleex.com',
        billing_phone: order.shipping_address?.phone || order.user_phone || '9999999999',
        billing_alternate_phone: order.shipping_address?.alternate_phone || '',
        shipping_is_billing: 1,
        shipping_customer_name: order.shipping_address?.name?.split(' ')[0] || order.user_name?.split(' ')[0] || 'Customer',
        shipping_last_name: order.shipping_address?.name?.split(' ').slice(1).join(' ') || '',
        shipping_address: shippingAddr1,
        shipping_address_2: shippingAddr2,
        shipping_city: order.shipping_address?.city || '',
        shipping_pincode: order.shipping_address?.pincode || '',
        shipping_country: order.shipping_address?.country || 'India',
        shipping_state: order.shipping_address?.state || '',
        shipping_email: order.user_email || 'customer@upleex.com',
        shipping_phone: order.shipping_address?.phone || order.user_phone || '9999999999',
        order_items: order.items.map(item => ({
          name: item.product_name,
          sku: item.sku || `SKU-${item.product_id}`,
          units: item.quantity,
          selling_price: item.price,
          discount: '0',
          tax: '18',
          hsn: '',
        })),
        payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        shipping_charges: order.delivery_charges || 0,
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: 0,
        sub_total: order.subtotal,
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5,
        ewaybill_no: '',
        customer_gstin: '',
        invoice_number: order.order_id,
        order_type: 'ESSENTIALS',
      };

      console.log('\n[Shiprocket] ─── STEP 1: Payload ready ───────────────────────');
      console.log('[Shiprocket]   API URL       : https://apiv2.shiprocket.in/v1/external/orders/create/adhoc');
      console.log(`[Shiprocket]   pickup_location: ${shiprocketPayload.pickup_location}`);
      console.log(`[Shiprocket]   payment_method : ${shiprocketPayload.payment_method}`);
      console.log(`[Shiprocket]   sub_total      : ${shiprocketPayload.sub_total}`);
      console.log(`[Shiprocket]   items count    : ${shiprocketPayload.order_items.length}`);
      console.log('[Shiprocket]   Full Payload   :\n', JSON.stringify(shiprocketPayload, null, 2));
      console.log('[Shiprocket] ────────────────────────────────────────────────────\n');

      console.log('[Shiprocket] ─── STEP 2: Calling Shiprocket API... ─────────────');
      const shiprocketRes = await shiprocketService.createShiprocketOrder(shiprocketPayload);
      console.log('[Shiprocket] ─── STEP 3: API Response received ─────────────────');
      console.log('[Shiprocket]   Full Response  :\n', JSON.stringify(shiprocketRes, null, 2));
      console.log('[Shiprocket] ────────────────────────────────────────────────────\n');

      if (shiprocketRes) {
        order.shiprocket_order_id = String(shiprocketRes.order_id || '');
        order.shiprocket_shipment_id = String(shiprocketRes.shipment_id || '');
        order.shiprocket_response = shiprocketRes;

        const shipmentId = shiprocketRes.shipment_id;

        console.log('\n[Shiprocket] ─── STEP 4: Auto Courier Assignment & AWB Generation ───');
        
        // STEP 4: Check serviceability and get best courier
        try {
          const pickupPostcode = config.shiprocket.pickupLocation === 'Home' ? '394105' : '110001'; // Configurable pickup pincode
          const deliveryPostcode = order.shipping_address?.pincode;
          const cod = order.payment_method === 'cod' ? 1 : 0;
          const weight = 0.5; // Default weight in kg

          if (deliveryPostcode) {
            console.log(`[Shiprocket] Checking serviceability for ${pickupPostcode} → ${deliveryPostcode}`);
            
            const serviceabilityParams = {
              pickup_postcode: pickupPostcode,
              delivery_postcode: deliveryPostcode,
              cod: cod,
              weight: weight
            };

            const serviceabilityResponse = await shiprocketService.checkCourierServiceability(serviceabilityParams);
            const availableCouriers = serviceabilityResponse?.data?.available_courier_companies || [];

            if (availableCouriers.length > 0) {
              // Select best courier (first one - usually recommended by Shiprocket)
              const selectedCourier = availableCouriers[0];
              const courierId = selectedCourier.courier_company_id;
              
              console.log(`[Shiprocket] ✅ Selected Courier: ${selectedCourier.courier_name} (ID: ${courierId})`);
              console.log(`[Shiprocket]   Rate: ₹${selectedCourier.rate}`);
              console.log(`[Shiprocket]   EDD: ${selectedCourier.etd}`);

              // STEP 5: Assign AWB to shipment
              console.log('\n[Shiprocket] ─── STEP 5: Assigning AWB ────────────────────────');
              try {
                const awbResponse = await shiprocketService.assignAwbToShipment(shipmentId, courierId);
                console.log('[Shiprocket] AWB Response:', JSON.stringify(awbResponse, null, 2));

                if (awbResponse?.awb_code || awbResponse?.data?.awb_code) {
                  const awbCode = awbResponse.awb_code || awbResponse.data.awb_code;
                  const courierName = awbResponse.courier_name || awbResponse.data?.courier_name || selectedCourier.courier_name;
                  
                  order.delivery_tracking.tracking_number = String(awbCode);
                  order.delivery_tracking.courier_partner = String(courierName);
                  
                  console.log(`[Shiprocket] ✅ AWB Assigned: ${awbCode}`);
                  console.log(`[Shiprocket] ✅ Courier: ${courierName}`);

                  // STEP 6: Generate Pickup
                  console.log('\n[Shiprocket] ─── STEP 6: Generating Pickup ────────────────────');
                  try {
                    const pickupResponse = await shiprocketService.generatePickup(shipmentId);
                    order.pickup_generated = true;
                    order.pickup_response = pickupResponse;
                    
                    console.log('[Shiprocket] Pickup Response:', JSON.stringify(pickupResponse, null, 2));
                    console.log(`[Shiprocket] ✅ Pickup Generated Successfully!`);
                    
                    // Update vendor status
                    order.vendor_status = 'preparing';
                    order.order_status = 'processing';
                    
                  } catch (pickupError) {
                    console.error('[Shiprocket] ⚠️ Pickup generation failed:', pickupError.message);
                    // Don't fail the whole process
                  }
                }
              } catch (awbError) {
                console.error('[Shiprocket] ⚠️ AWB assignment failed:', awbError.message);
                // AWB might be auto-assigned by Shiprocket, continue
              }
            } else {
              console.log('[Shiprocket] ⚠️ No couriers available for this route');
            }
          } else {
            console.log('[Shiprocket] ⚠️ No delivery postcode found');
          }
        } catch (serviceabilityError) {
          console.error('[Shiprocket] ⚠️ Serviceability check failed:', serviceabilityError.message);
          // Continue - cron job will handle this later
        }

        // Save everything
        order.order_notes = (order.order_notes || '') + `\n[Shiprocket] Order created. Shipment ID: ${shipmentId}`;
        await order.save();

        console.log('\n[Shiprocket] ✅ COMPLETE FLOW FINISHED!');
        console.log(`[Shiprocket]   shiprocket_order_id   : ${order.shiprocket_order_id}`);
        console.log(`[Shiprocket]   shiprocket_shipment_id: ${order.shiprocket_shipment_id}`);
        console.log(`[Shiprocket]   awb_code              : ${order.delivery_tracking.tracking_number || 'pending'}`);
        console.log(`[Shiprocket]   courier_name          : ${order.delivery_tracking.courier_partner || 'pending'}`);
        console.log(`[Shiprocket]   pickup_generated      : ${order.pickup_generated || false}`);
        console.log(`[Shiprocket]   vendor_status         : ${order.vendor_status}`);
        console.log('========================================\n');
      }
    } catch (shiprocketError) {
      console.error('\n[Shiprocket] ❌ FAILED!');
      console.error(`[Shiprocket]   Error Message: ${shiprocketError.message}`);
      console.error('========================================\n');
      order.order_notes = (order.order_notes || '') + `\n[Shiprocket Sync Failed] Error: ${shiprocketError.message}`;
      await order.save();
    }
  } else {
    console.log('[Shiprocket] ⏭ Skipped — delivery_type is not "shipping" OR already synced.');
    console.log('========================================\n');
  }
};

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

  // Sync to Shiprocket if required
  await syncOrderToShiprocket(order);

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

  // Enrich order with vendor details for email
  let enrichedOrder = order.toObject();
  try {
    const mongoose = require('mongoose');
    const Vendor = mongoose.model('Vendor');
    const VendorKyc = mongoose.model('VendorKyc');
    
    for (const item of enrichedOrder.items) {
      if (item.vendor_id) {
        const vendor = await Vendor.findById(item.vendor_id).lean();
        if (vendor) {
          const kyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendor._id }).lean();
          const contact = (kyc?.ContactDetails && Array.isArray(kyc.ContactDetails)) ? kyc.ContactDetails[0] : (kyc?.ContactDetails || {});
          
          item.vendor_name = vendor.business_name || vendor.businessName || 'Vendor';
          item.vendor_address = contact.address || vendor.address || '';
          item.vendor_city = contact.city_name || vendor.city_name || vendor.city || '';
          item.vendor_mobile = contact.mobile || vendor.mobile || vendor.number || vendor.phone || '';
        }
      }
    }
  } catch (enrichError) {
    console.error('Error enriching order with vendor details for email:', enrichError);
  }

  // Send order confirmation email
  try {
    const userEmail = order.user_email;
    
    if (userEmail && userEmail.includes('@')) {
      await sendOrderConfirmationEmail(userEmail, enrichedOrder);
    } else {
      const User = require('../models/user.model');
      const userFromDB = await User.findById(order.user_id);
      if (userFromDB && userFromDB.email) {
        const fallbackEmail = userFromDB.email;
        await sendOrderConfirmationEmail(fallbackEmail, enrichedOrder);
        order.user_email = fallbackEmail;
        await order.save();
      }
    }
  } catch (emailError) {
    // Don't fail the payment verification if email fails
  }

  // Notify each vendor about new order
  try {
    const { sendNotificationToVendor } = require('../services/vendorNotification.service');
    const { sendAdminNotification } = require('../services/adminNotification.service');
    const vendorIds = [...new Set(order.items.map(i => String(i.vendor_id)).filter(Boolean))];
    const itemNames = order.items.map(i => i.product_name).join(', ');

    // Notify admin about new payment
    await sendAdminNotification(
      'New Order Payment Received! 💰',
      `Order #${order.order_id} payment of ₹${order.total_amount} received from ${order.user_name || 'User'}.`,
      'order_request',    
      { orderId: String(order._id), orderNumber: order.order_id, amount: order.total_amount }
    );

    // Notify each vendor
    for (const vendorId of vendorIds) {
      const vendorItems = order.items.filter(i => String(i.vendor_id) === String(vendorId));
      const names = vendorItems.map(i => i.product_name).join(', ');
      const vendorPayment = order.vendor_payments.find(vp => String(vp.vendor_id) === String(vendorId));
      const vendorAmount = vendorPayment ? vendorPayment.vendor_amount : 0;

      // New Order notification
      await sendNotificationToVendor(
        vendorId,
        'New Order Received! \ud83d\udce6',
        `New order #${order.order_id} for: ${names}`,
        'order_request',
        { orderId: String(order._id), orderNumber: order.order_id }
      );

      // Payment Received notification
      await sendNotificationToVendor(
        vendorId,
        'Order Payment Received! \ud83d\udcb0',
        `Payment of \u20b9${vendorAmount} received for order #${order.order_id}. Products: ${names}`,
        'order_request',
        { orderId: String(order._id), orderNumber: order.order_id, amount: String(vendorAmount) }
      );
    }
  } catch (notifErr) {
    console.error('Notification error:', notifErr);
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Payment verified successfully',
    data: {
      order_id: order.order_id,
      payment_status: order.payment_status,
      order_status: order.order_status,
      order_details: enrichedOrder,
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

  const orders = await Order.find({ 
    user_id: req.user.id,
    $or: [
      { payment_status: { $ne: 'pending' } },
      { payment_method: { $ne: 'razorpay' } }
    ]
  })
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
          const kyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendor._id }).lean();
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

// Webhook handler for Razorpay
const razorpayWebhook = catchAsync(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET;
  
  if (!secret) {
    console.error('Webhook secret not configured');
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).send('Webhook secret not configured');
  }

  const signature = req.headers['x-razorpay-signature'];
  if (!signature) {
    return res.status(httpStatus.BAD_REQUEST).send('No signature found');
  }

  // Validate signature
  try {
    const bodyString = req.rawBody ? req.rawBody.toString() : JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyString)
      .digest('hex');

    if (expectedSignature !== signature) {
      console.error('Invalid signature for webhook');
      // For development/testing, you might want to bypass this:
      // return res.status(httpStatus.BAD_REQUEST).send('Invalid signature');
    }
  } catch (err) {
    console.error('Error verifying webhook signature:', err);
  }

  // Process the webhook payload
  const { event, payload } = req.body;

  if (event === 'payment.captured' || event === 'order.paid') {
    const paymentEntity = payload.payment?.entity;
    if (!paymentEntity) return res.status(httpStatus.OK).send('OK');

    const notes = paymentEntity.notes || {};
    const razorpay_order_id = paymentEntity.order_id;
    const razorpay_payment_id = paymentEntity.id;

    // 1. Handle Wallet Add Money
    if (notes.purpose === 'wallet_add_money' || notes.transaction_id) {
      const transactionId = notes.transaction_id;
      const vendorId = notes.vendor_id;
      
      const Wallet = require('../models/wallet.model');
      const wallet = await Wallet.findOne({ vendor_id: vendorId });
      
      if (wallet) {
        const transaction = wallet.transactions.find(t => t.transaction_id === transactionId);
        
        if (transaction && transaction.status === 'pending') {
          transaction.status = 'completed';
          transaction.razorpay_payment_id = razorpay_payment_id;
          transaction.razorpay_signature = "webhook_verified";
          transaction.metadata.completed_at = new Date();
          transaction.metadata.verified_via = 'webhook';
          
          wallet.balance += transaction.amount;
          wallet.total_credited += transaction.amount;
          
          await wallet.save();
          console.log(`[Webhook] Wallet money added successfully for transaction ${transactionId}`);
        }
      }
    }
    // 2. Handle Product Orders
    else if (notes.order_id) {
      const orderId = notes.order_id;
      
      const order = await Order.findOne({ order_id: orderId });
      
      if (order && order.payment_status === 'pending') {
        order.payment_status = order.payment_type === '30_percent' ? 'hold' : 'paid';
        order.order_status = 'confirmed';
        order.razorpay_payment_id = razorpay_payment_id;
        order.razorpay_signature = "webhook_verified";
        
        order.vendor_payments.forEach(vendorPayment => {
          vendorPayment.payment_status = 'paid';
          vendorPayment.paid_at = new Date();
        });
        
        await order.save();

        // Sync to Shiprocket if required
        await syncOrderToShiprocket(order);

        // Update cart items
        await Cart.updateMany(
          { user_id: order.user_id, status: 'active' },
          { status: 'ordered' }
        );
        
        // Stock management
        for (const item of order.items) {
          try {
            const product = await Product.findById(item.product_id);
            if (product && product.product_type_name === 'Sell' && product.available_quantity > 0) {
              const newAvailableQuantity = Math.max(0, product.available_quantity - item.quantity);
              await Product.findByIdAndUpdate(item.product_id, {
                available_quantity: newAvailableQuantity,
                is_out_of_stock: newAvailableQuantity === 0
              });
            }
          } catch (e) { console.error('Stock update error in webhook', e); }
        }
        
        console.log(`[Webhook] Order ${orderId} marked as paid`);
      }
    }
  }

  // Always return 200 OK
  res.status(httpStatus.OK).send('OK');
});

module.exports = {
  createOrder,
  verifyPayment,
  getUserOrders,
  getVendorOrders,
  getVendorPaymentHistory,
  cancelOrder,
  razorpayWebhook
};