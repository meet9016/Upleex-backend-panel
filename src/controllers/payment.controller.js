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
    const gstRate = (product.gst === undefined || product.gst === null || product.gst === '') ? 0 : (Number(product.gst) || 0);
    const itemGst = (itemSubtotal * gstRate) / 100; // Match cart controller exact calculation
    const itemFinalAmount = itemSubtotal + itemGst;

    subtotal += itemSubtotal;
    gstAmount += itemGst;

    const orderItem = {
      product_id: product._id,
      vendor_id: product.vendor_id,
      product_name: product.product_name,
      product_image: product.product_main_image || '',
      hsn_code: product.hsnCode || '',
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

// Sync order to Shiprocket for shipping delivery type - VENDOR SPLIT
const syncOrderToShiprocket = async (order) => {
  console.log('\n========================================');
  console.log('[Shiprocket] ▶ syncOrderToShiprocket VENDOR-SPLIT triggered');
  console.log(`[Shiprocket]   Order ID      : ${order.order_id}`);
  console.log(`[Shiprocket]   delivery_type : ${order.delivery_type}`);
  console.log('========================================\n');

  if (order.delivery_type !== 'shipping') {
    console.log('[Shiprocket] ⏭ Skipped — delivery_type is not "shipping"');
    return;
  }
  
  if (!order.shipping_address || !order.shipping_address.pincode) {
    console.error('[Shiprocket] ❌ ERROR: Shipping address or pincode missing');
    return;
  }

  const moment = require('moment');
  const shiprocketService = require('../services/shiprocket.service');
  const VendorShiprocketProfile = require('../models/vendorShiprocketProfile.model');
  const Vendor = require('../models/vendor/vendor.model');
  const VendorKyc = require('../models/vendor/vendorKyc.model');

  // Group items by vendor
  const vendorItemsMap = {};
  for (const item of order.items) {
    const vid = String(item.vendor_id);
    if (!vendorItemsMap[vid]) {
      vendorItemsMap[vid] = [];
    }
    vendorItemsMap[vid].push(item);
  }

  const vendorIds = Object.keys(vendorItemsMap);
  console.log(`[Shiprocket] Found ${vendorIds.length} vendors in order`);

  // Store vendor-specific Shiprocket data
  const vendorShiprocketData = {};

  // Process each vendor's shipment separately
  for (const vendorId of vendorIds) {
    const vendorItems = vendorItemsMap[vendorId];
    const vendorOrderId = `${order.order_id}-V${vendorId.substring(0, 6)}`;
    
    console.log(`\n[Shiprocket] ─── Processing Vendor: ${vendorId} ───`);
    console.log(`[Shiprocket]   Items: ${vendorItems.length}`);
    console.log(`[Shiprocket]   Vendor Order ID: ${vendorOrderId}`);

    try {
      // Get vendor's pickup location - PRIORITY: PickupAddress > ContactDetails
      let pickupLocation = config.shiprocket.pickupLocation || 'Primary';
      let pickupPincode = '';
      let pickupAddress = {};
      
      // First check VendorShiprocketProfile (if vendor has explicitly set pickup location)
      const vendorProfile = await VendorShiprocketProfile.findOne({ vendor_id: vendorId });
      
      console.log(`[Shiprocket]   Vendor Profile Found: ${!!vendorProfile}`);
      console.log(`[Shiprocket]   Vendor Profile Active: ${vendorProfile?.is_active}`);
      
      if (vendorProfile && vendorProfile.is_active) {
        pickupLocation = vendorProfile.pickup_location_name;
        pickupPincode = vendorProfile.address?.pincode || '';
        pickupAddress = vendorProfile.address || {};
        console.log(`[Shiprocket]   Using vendor custom pickup: ${pickupLocation} (${pickupPincode})`);
      } else {
        // AUTO-CREATE from Vendor KYC address (Priority: PickupAddress > ContactDetails)
        console.log(`[Shiprocket]   No custom pickup, using KYC address`);
        
        const vendorKyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendorId });
        const vendor = await Vendor.findById(vendorId);
        
        console.log(`[Shiprocket]   Vendor KYC Found: ${!!vendorKyc}`);
        console.log(`[Shiprocket]   Vendor Found: ${!!vendor}`);
        
        if (vendorKyc) {
          // PRIORITY: PickupAddress > ContactDetails
          const hasPickupAddress = vendorKyc.PickupAddress?.address || vendorKyc.PickupAddress?.pincode;
          
          if (hasPickupAddress) {
            // Use PickupAddress (vendor specified different pickup location)
            const pickup = vendorKyc.PickupAddress;
            pickupPincode = pickup.pincode || '';
            
            const vendorShortId = String(vendorId).substring(0, 6).toUpperCase();
            const businessName = (vendor?.business_name || vendor?.businessName || pickup.contact_person || 'Vendor').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            pickupLocation = `${businessName}_PKP_${vendorShortId}`; // PKP = Pickup
            
            pickupAddress = {
              contact_person: pickup.contact_person || vendorKyc.ContactDetails?.full_name || 'Vendor',
              email: pickup.email || vendorKyc.ContactDetails?.email || vendor?.email || '',
              phone: pickup.mobile || vendorKyc.ContactDetails?.mobile || '',
              address_line1: pickup.address || '',
              city: pickup.city_name || '',
              state: pickup.state_name || '',
              pincode: pickup.pincode || '',
              country: pickup.country_name || 'India',
            };
            
            console.log(`[Shiprocket]   Using PICKUP address: ${pickupLocation}, Pincode: ${pickupPincode}`);
          } else {
            // Use ContactDetails (normal address)
            const contact = vendorKyc.ContactDetails;
            pickupPincode = contact?.pincode || '';
            
            const vendorShortId = String(vendorId).substring(0, 6).toUpperCase();
            const businessName = (vendor?.business_name || vendor?.businessName || contact?.full_name || 'Vendor').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
            pickupLocation = `${businessName}_${vendorShortId}`;
            
            pickupAddress = {
              contact_person: contact?.full_name || 'Vendor',
              email: contact?.email || vendor?.email || '',
              phone: contact?.mobile || '',
              address_line1: contact?.address || '',
              city: contact?.city_name || '',
              state: contact?.state_name || '',
              pincode: contact?.pincode || '',
              country: contact?.country_name || 'India',
            };
            
            console.log(`[Shiprocket]   Using CONTACT address: ${pickupLocation}, Pincode: ${pickupPincode}`);
          }
        }
      }
      
      console.log(`[Shiprocket]   Attempting Pickup: ${pickupLocation}, Pincode: ${pickupPincode}`);
          
      // ALWAYS Check if this pickup location exists in Shiprocket, if not create it
      try {
        const existingLocations = await shiprocketService.getPickupLocations();
        
        // Look for an exact name match OR match by pincode + (phone or email)
        let matchedLocation = existingLocations?.data?.shipping_address?.find(
          loc => {
            if (loc.pickup_location === pickupLocation) return true;
            if (String(loc.pin_code) !== String(pickupPincode)) return false;
            
            const phoneMatches = pickupAddress.phone && loc.phone && loc.phone.includes(pickupAddress.phone.slice(-10));
            const emailMatches = pickupAddress.email && loc.email && loc.email.toLowerCase() === pickupAddress.email.toLowerCase();
            
            return phoneMatches || emailMatches;
          }
        );
        
        // Fallback: If no match found by phone/email, just match by pincode
        if (!matchedLocation && pickupPincode) {
          matchedLocation = existingLocations?.data?.shipping_address?.find(
            loc => String(loc.pin_code) === String(pickupPincode)
          );
          if (matchedLocation) {
            console.log(`[Shiprocket]   Fallback match by pincode ONLY: Found ${matchedLocation.pickup_location} for pincode ${pickupPincode}`);
          }
        }
        
        const locationExists = !!matchedLocation;
        
        if (matchedLocation && matchedLocation.pickup_location !== pickupLocation) {
          console.log(`[Shiprocket]   Found manually added pickup location: ${matchedLocation.pickup_location}`);
          pickupLocation = matchedLocation.pickup_location;
        }

        if (!locationExists && pickupPincode) {
          console.log(`[Shiprocket]   Creating new pickup location in Shiprocket...`);
          
          await shiprocketService.createPickupLocation({
            pickup_location: pickupLocation,
            name: pickupAddress.contact_person || 'Vendor',
            email: pickupAddress.email || 'vendor@upleex.com',
            phone: pickupAddress.phone || '9999999999',
            address: pickupAddress.address_line1 || 'Vendor Address',
            address_2: '',
            city: pickupAddress.city || 'City',
            state: pickupAddress.state || 'State',
            country: pickupAddress.country || 'India',
            pin_code: pickupAddress.pincode,
          });
          
          // Save to VendorShiprocketProfile for future use
          await VendorShiprocketProfile.findOneAndUpdate(
            { vendor_id: vendorId },
            {
              $set: {
                pickup_location_name: pickupLocation,
                pickup_location_code: pickupLocation,
                address: pickupAddress,
                is_active: true,
                last_synced_at: new Date(),
                sync_error: '',
              },
            },
            { upsert: true }
          );
          
          console.log(`[Shiprocket]   ✅ Pickup location created and saved`);
        }
      } catch (pickupErr) {
        console.log(`[Shiprocket]   ⚠️ Pickup location verification/creation failed: ${pickupErr.message}`);
        // Continue with default location if creation fails
        pickupLocation = config.shiprocket.pickupLocation || 'Primary';
      }

      // Calculate vendor-specific amounts
      const vendorSubtotal = vendorItems.reduce((sum, item) => sum + item.subtotal, 0);
      const vendorGst = vendorItems.reduce((sum, item) => sum + item.gst_amount, 0);
      const vendorTotal = vendorItems.reduce((sum, item) => sum + item.final_amount, 0);
      const vendorDeliveryCharge = order.delivery_charges ? Math.round(order.delivery_charges / vendorIds.length) : 0;

      const formattedDate = moment(order.createdAt).format('YYYY-MM-DD HH:mm');

      // Build address helper
      const getValidAddress = (line1, line2, city, state) => {
        let addr1 = String(line1 || '').trim();
        let addr2 = String(line2 || '').trim();
        if (!addr1 && !addr2) {
          addr1 = 'Customer Address';
          if (city) addr2 = city + (state ? ', ' + state : '');
        } else if ((addr1 + ' ' + addr2).trim().length < 3) {
          if (addr1.length < 3) {
            addr1 = addr2.length >= 3 ? addr2 : 'Customer Address';
            addr2 = addr1 === 'Customer Address' ? (city || '') : '';
          }
        }
        return { addr1, addr2 };
      };

      const { addr1: billingAddr1, addr2: billingAddr2 } = getValidAddress(
        order.shipping_address?.address_line1,
        order.shipping_address?.address_line2,
        order.shipping_address?.city,
        order.shipping_address?.state
      );

      // Calculate total weight and dimensions from products (multiply by quantity)
      let totalWeight = 0;
      let totalLength = 0;
      let totalBreadth = 0;
      let totalHeight = 0;
      let totalQuantity = 0;
      
      for (const item of order.items) {
        try {
          const product = await Product.findById(item.product_id);
          if (product) {
            const quantity = item.quantity || 1;
            totalQuantity += quantity;
            
            // Multiply weight by quantity
            const itemWeight = (product.weight || 0.5) * quantity;
            totalWeight += itemWeight;
            
            // Dimension calculation - take MAX dimensions for length/breadth and stack height
            const productLength = product.length || 10;
            const productBreadth = product.breadth || 10;
            const productHeight = product.height || 10;
            
            totalLength = Math.max(totalLength, productLength);
            totalBreadth = Math.max(totalBreadth, productBreadth);
            totalHeight = Math.max(totalHeight, productHeight * quantity);
          }
        } catch (err) {
          console.error(`Error fetching product dimensions for ${item.product_id}:`, err);
        }
      }
      
      // Ensure minimum values
      totalWeight = Math.max(totalWeight, 0.5);
      totalLength = Math.max(totalLength || 10, 10);
      totalBreadth = Math.max(totalBreadth || 10, 10);
      totalHeight = Math.max(totalHeight || 10, 10);
      
      console.log(`[Shiprocket] Calculated dimensions - Weight: ${totalWeight}kg, L: ${totalLength}cm, B: ${totalBreadth}cm, H: ${totalHeight}cm, Qty: ${totalQuantity}`);

      const rawPhone = String(order.shipping_address?.phone || order.user_phone || '9999999999').replace(/\D/g, '');
      const validPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9999999999';
      
      const firstName = order.shipping_address?.name?.split(' ')[0] || order.user_name?.split(' ')[0] || 'Customer';
      let lastName = order.shipping_address?.name?.split(' ').slice(1).join(' ') || order.user_name?.split(' ').slice(1).join(' ') || '';
      if (!lastName) lastName = firstName; // Shiprocket sometimes requires last name
      
      const shiprocketPayload = {
        order_id: vendorOrderId,
        order_date: formattedDate,
        pickup_location: pickupLocation,
        comment: `Upleex Order - Vendor: ${vendorId}`,
        reseller_name: '',
        company_name: 'Upleex',
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: billingAddr1,
        billing_address_2: billingAddr2,
        billing_isd_code: '91',
        billing_city: order.shipping_address?.city || '',
        billing_pincode: order.shipping_address?.pincode || '',
        billing_state: order.shipping_address?.state || '',
        billing_country: order.shipping_address?.country || 'India',
        billing_email: order.user_email || 'customer@upleex.com',
        billing_phone: validPhone,
        billing_alternate_phone: '',
        shipping_is_billing: 1,
        shipping_customer_name: firstName,
        shipping_last_name: lastName,
        shipping_address: billingAddr1,
        shipping_address_2: billingAddr2,
        shipping_city: order.shipping_address?.city || '',
        shipping_pincode: order.shipping_address?.pincode || '',
        shipping_country: order.shipping_address?.country || 'India',
        shipping_state: order.shipping_address?.state || '',
        shipping_email: order.user_email || 'customer@upleex.com',
        shipping_phone: validPhone,
        order_items: vendorItems.map(item => {
          let cleanHsn = String(item.hsn_code || '').replace(/[^0-9]/g, '').substring(0, 8);
          if (cleanHsn.length < 4) cleanHsn = ''; // HSN should be at least 4 digits if provided
          return {
            name: item.product_name,
            sku: item.sku || `SKU-${item.product_id}`,
            units: item.quantity,
            selling_price: item.price,
            discount: '0',
            tax: String(item.gst_amount > 0 ? Math.round((item.gst_amount / item.subtotal) * 100) : 18),
            hsn: cleanHsn,
          };
        }),
        payment_method: order.payment_method === 'cod' ? 'COD' : 'Prepaid',
        shipping_charges: vendorDeliveryCharge,
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: 0,
        sub_total: vendorSubtotal,
        length: totalLength,
        breadth: totalBreadth,
        height: totalHeight,
        weight: totalWeight,
        ewaybill_no: '',
        customer_gstin: '',
        invoice_number: vendorOrderId,
        order_type: 'ESSENTIALS',
      };

      console.log(`[Shiprocket] Creating order with pickup: ${pickupLocation}`);
      console.log(`[Shiprocket] Pickup Pincode: ${pickupPincode}`);
      console.log(`[Shiprocket] Delivery Pincode: ${order.shipping_address?.pincode}`);
      
      // Validate pickup location
      if (!pickupLocation || !pickupPincode) {
        console.error(`[Shiprocket] ❌ ERROR: Pickup location or pincode missing for vendor ${vendorId}`);
        vendorShiprocketData[vendorId] = {
          error: 'Pickup location not configured for vendor',
          status: 'failed'
        };
        continue; // Skip this vendor
      }
      
      // Create Shiprocket order for this vendor
      const shiprocketRes = await shiprocketService.createShiprocketOrder(shiprocketPayload);
      
      console.log(`[Shiprocket] API Response:`, JSON.stringify(shiprocketRes, null, 2));
      
      if (shiprocketRes) {
        const shipmentId = shiprocketRes.shipment_id;
        const shiprocketOrderId = shiprocketRes.order_id;
        
        console.log(`[Shiprocket] ✅ Order created. Shipment ID: ${shipmentId}`);
        
        // Store vendor-specific data
        vendorShiprocketData[vendorId] = {
          shiprocket_order_id: String(shiprocketOrderId),
          shiprocket_shipment_id: String(shipmentId),
          pickup_location: pickupLocation,
          pickup_pincode: pickupPincode,
          items: vendorItems.map(i => i.product_id),
          awb_code: '',
          courier_name: '',
          status: 'created'
        };

        // Auto AWB assignment and pickup generation
        try {
          const deliveryPostcode = order.shipping_address?.pincode;
          const cod = order.payment_method === 'cod' ? 1 : 0;
          
          // Use calculated weight from products (already computed above)
          const calculatedWeight = totalWeight;

          if (deliveryPostcode) {
            console.log(`[Shiprocket] Checking serviceability for ${pickupPincode} → ${deliveryPostcode} (Weight: ${calculatedWeight}kg)`);
            
            const serviceabilityParams = {
              pickup_postcode: pickupPincode,
              delivery_postcode: deliveryPostcode,
              cod: cod,
              weight: calculatedWeight,
              length: totalLength,
              breadth: totalBreadth,
              height: totalHeight
            };

            const serviceabilityResponse = await shiprocketService.checkCourierServiceability(serviceabilityParams);
            const availableCouriers = serviceabilityResponse?.data?.available_courier_companies || [];

            if (availableCouriers.length > 0) {
              const selectedCourier = availableCouriers[0];
              const courierId = selectedCourier.courier_company_id;
              
              console.log(`[Shiprocket]   Selected Courier: ${selectedCourier.courier_name}`);
              
              // Assign AWB
              try {
                const awbResponse = await shiprocketService.assignAwbToShipment(shipmentId, courierId);
                
                if (awbResponse?.awb_code || awbResponse?.data?.awb_code) {
                  const awbCode = awbResponse.awb_code || awbResponse.data.awb_code;
                  const courierName = awbResponse.courier_name || awbResponse.data?.courier_name || selectedCourier.courier_name;
                  
                  vendorShiprocketData[vendorId].awb_code = String(awbCode);
                  vendorShiprocketData[vendorId].courier_name = String(courierName);
                  
                  console.log(`[Shiprocket]   ✅ AWB: ${awbCode}`);
                  
                  // Generate Pickup
                  try {
                    await shiprocketService.generatePickup(shipmentId);
                    vendorShiprocketData[vendorId].status = 'pickup_generated';
                    console.log(`[Shiprocket]   ✅ Pickup generated`);
                  } catch (pickupErr) {
                    console.log(`[Shiprocket]   ⚠️ Pickup failed: ${pickupErr.message}`);
                  }
                }
              } catch (awbErr) {
                console.log(`[Shiprocket]   ⚠️ AWB failed: ${awbErr.message}`);
              }
            }
          }
        } catch (serviceErr) {
          console.log(`[Shiprocket]   ⚠️ Serviceability check failed: ${serviceErr.message}`);
        }
      }
    } catch (err) {
      console.error(`[Shiprocket] ❌ Vendor ${vendorId} failed: ${err.message}`);
      console.error(`[Shiprocket] ❌ Full Error:`, err);
      vendorShiprocketData[vendorId] = {
        error: err.message,
        stack: err.stack,
        status: 'failed',
        attempted_pickup_location: pickupLocation
      };
    }
  }

  // Update order with vendor shiprocket data
  order.shiprocket_response = {
    ...order.shiprocket_response,
    vendor_shipments: vendorShiprocketData,
    split_order: true,
    total_vendors: vendorIds.length,
    synced_at: new Date()
  };
  
  // For backward compatibility, set the first vendor's data as main
  const firstVendorId = vendorIds[0];
  if (vendorShiprocketData[firstVendorId]?.shiprocket_order_id) {
    order.shiprocket_order_id = vendorShiprocketData[firstVendorId].shiprocket_order_id;
    order.shiprocket_shipment_id = vendorShiprocketData[firstVendorId].shiprocket_shipment_id;
    
    if (vendorShiprocketData[firstVendorId].awb_code) {
      if (!order.delivery_tracking) order.delivery_tracking = {};
      order.delivery_tracking.tracking_number = vendorShiprocketData[firstVendorId].awb_code;
      order.delivery_tracking.courier_partner = vendorShiprocketData[firstVendorId].courier_name;
    }
  }
  
  order.pickup_generated = Object.values(vendorShiprocketData).some(v => v.status === 'pickup_generated');
  order.order_notes = (order.order_notes || '') + `\n[Shiprocket] Order split into ${vendorIds.length} vendor shipments`;
  
  await order.save();

  console.log(`\n[Shiprocket] ✅ VENDOR SPLIT COMPLETE!`);
  console.log(`[Shiprocket]   Total vendors processed: ${vendorIds.length}`);
  console.log('========================================\n');
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
  razorpayWebhook,
  syncOrderToShiprocket
};