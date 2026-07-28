const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const shiprocketService = require('../services/shiprocket.service');
const config = require('../config/config');
const Product = require('../models/product.model');
const VendorShiprocketProfile = require('../models/vendorShiprocketProfile.model');
const Cart = require('../models/cart.model');

const calculateShippingCharge = catchAsync(async (req, res) => {
  try {
    console.log('[Shipping] Calculating shipping charge...');
    
    const { delivery_postcode, cod = 0 } = req.body;
    const userId = req.user?.id;
    
    if (!delivery_postcode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Delivery pincode is required');
    }

    if (!userId) {
      throw new ApiError(httpStatus.UNAUTHORIZED, 'Please login to calculate shipping');
    }

    // Get user's cart items
    const cartItems = await Cart.find({ 
      user_id: userId, 
      status: 'active' 
    });

    if (!cartItems || cartItems.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Your cart is empty');
    }

    console.log('[Shipping] Found', cartItems.length, 'items in cart');

    // Calculate total weight and dimensions from cart products
    let totalWeight = 0;
    let maxDimension = { length: 0, breadth: 0, height: 0 };
    let totalQuantity = 0;
    let productsData = [];
    let vendorId = null;
    let pickup_postcode = null;

    for (const cartItem of cartItems) {
      const product = await Product.findById(cartItem.product_id);
      console.log('[Shipping] Product', product);
      if (product) {
        // Get vendor from first product (assuming single vendor per cart)
        if (!vendorId) {
          vendorId = product.vendor_id;
          
          // Get vendor's Shiprocket pickup address
          const vendorProfile = await VendorShiprocketProfile.findOne({ 
            vendor_id: vendorId, 
            is_active: true 
          });
          
          if (vendorProfile?.address?.pincode) {
            pickup_postcode = vendorProfile.address.pincode;
            console.log('[Shipping] Found vendor pickup postcode:', pickup_postcode, 'for vendor:', vendorId);
          } else {
            // Fallback to VendorKyc
            const VendorKyc = require('../models/vendor/vendorKyc.model');
            const vendorKyc = await VendorKyc.findOne({ 'ContactDetails.vendor_id': vendorId });
            if (vendorKyc) {
              pickup_postcode = vendorKyc.PickupAddress?.pincode || vendorKyc.ContactDetails?.pincode || null;
              if (pickup_postcode) {
                console.log('[Shipping] Fallback to KYC pickup postcode:', pickup_postcode, 'for vendor:', vendorId);
              }
            }
          }
        }

        const quantity = cartItem.qty || 1;
        totalQuantity += quantity;
        
        // Weight calculation - multiply by quantity
        const itemWeight = (product.weight || 0.5) * quantity;
        totalWeight += itemWeight;
        
        // Dimension calculation - take MAX dimensions (for packaging)
        const productLength = product.length || 10;
        const productBreadth = product.breadth || 10;
        const productHeight = product.height || 10;
        
        maxDimension.length = Math.max(maxDimension.length, productLength);
        maxDimension.breadth = Math.max(maxDimension.breadth, productBreadth);
        maxDimension.height = Math.max(maxDimension.height, productHeight * quantity);

        productsData.push({
          product_id: product._id,
          product_name: product.product_name,
          quantity,
          weight: product.weight || 0.5,
          dimensions: {
            length: productLength,
            breadth: productBreadth,
            height: productHeight
          }
        });
      }
    }

    if (!pickup_postcode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Vendor pickup location not configured. Please complete vendor Shiprocket setup.');
    }

    // Ensure minimum values (Shiprocket requirements)
    totalWeight = Math.max(totalWeight, 0.5);
    maxDimension.length = Math.max(maxDimension.length, 10);
    maxDimension.breadth = Math.max(maxDimension.breadth, 10);
    maxDimension.height = Math.max(maxDimension.height, 10);

    console.log('[Shipping] Calculated shipping params:', {
      pickup_postcode,
      delivery_postcode,
      totalWeight,
      dimensions: maxDimension,
      totalQuantity,
      cod
    });

    // Check serviceability with Shiprocket
    const serviceabilityParams = {
      pickup_postcode,
      delivery_postcode,
      weight: totalWeight,
      length: maxDimension.length,
      breadth: maxDimension.breadth,
      height: maxDimension.height,
      cod
    };
    
    const serviceabilityResponse = await shiprocketService.checkCourierServiceability(serviceabilityParams);
    
    const availableCouriers = serviceabilityResponse?.data?.available_courier_companies || [];
    
    if (availableCouriers.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No couriers available for this delivery location');
    }

    // Sort by rate (cheapest first)
    const sortedCouriers = availableCouriers.sort((a, b) => a.rate - b.rate);
    const cheapestCourier = sortedCouriers[0];

    console.log('[Shipping] Found', availableCouriers.length, 'couriers. Cheapest:', cheapestCourier.courier_name, '₹' + cheapestCourier.rate);

    res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Shipping charge calculated successfully',
      data: {
        shipping_charge: cheapestCourier.rate,
        courier_name: cheapestCourier.courier_name,
        courier_company_id: cheapestCourier.courier_company_id,
        estimated_delivery_days: cheapestCourier.estimated_delivery_days,
        cod_charges: cheapestCourier.cod_charges || 0,
        rating: cheapestCourier.rating,
        available_couriers: sortedCouriers.slice(0, 5), // Return top 5 options
        calculation_details: {
          pickup_postcode,
          delivery_postcode,
          weight_used: totalWeight,
          dimensions_used: maxDimension,
          total_quantity: totalQuantity,
          products: productsData
        }
      }
    });
  } catch (error) {
    console.error('[Shipping] Error calculating shipping charge:', error);
    throw new ApiError(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to calculate shipping charge');
  }
});

module.exports = {
  calculateShippingCharge
};
