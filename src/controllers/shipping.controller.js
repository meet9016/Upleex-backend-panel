const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const shiprocketService = require('../services/shiprocket.service');
const config = require('../config/config');

const calculateShippingCharge = catchAsync(async (req, res) => {
  try {
    console.log('[Shipping] Calculating shipping charge...');
    
    const { delivery_postcode, product_ids, cod = 0 } = req.body;
    
    if (!delivery_postcode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Delivery pincode is required');
    }
    
    // Calculate total weight and dimensions from products (multiply by quantity)
    let totalWeight = 0.5;
    let totalLength = 0;
    let totalBreadth = 0;
    let totalHeight = 0;
    let totalQuantity = 0;
    
    if (product_ids && Array.isArray(product_ids) && product_ids.length > 0) {
      const Product = require('../models/product.model');
      totalWeight = 0;
      
      for (const item of product_ids) {
        const productId = typeof item === 'string' ? item : item.product_id;
        const quantity = typeof item === 'object' ? (item.quantity || 1) : 1;
        totalQuantity += quantity;
        
        try {
          const product = await Product.findById(productId);
          if (product) {
            // Multiply weight by quantity
            const itemWeight = (product.weight || 0.5) * quantity;
            totalWeight += itemWeight;
            
            // Multiply dimensions by quantity (volumetric calculation)
            const itemLength = (product.length || 10) * quantity;
            const itemBreadth = (product.breadth || 10) * quantity;
            const itemHeight = (product.height || 10) * quantity;
            
            totalLength += itemLength;
            totalBreadth += itemBreadth;
            totalHeight += itemHeight;
          }
        } catch (err) {
          console.error(`[Shipping] Error fetching product ${productId}:`, err);
        }
      }
    }
    
    // Ensure minimum values
    totalWeight = Math.max(totalWeight, 0.5);
    totalLength = Math.max(totalLength || 10, 10);
    totalBreadth = Math.max(totalBreadth || 10, 10);
    totalHeight = Math.max(totalHeight || 10, 10);
    
    console.log('[Shipping] Calculated dimensions:', { delivery_postcode, totalWeight, totalLength, totalBreadth, totalHeight, totalQuantity, cod });
    
    // Get pickup postcode from config or use default
    const pickup_postcode = '394105'; // You can change this or get from settings/config
    
    const serviceabilityParams = {
      pickup_postcode,
      delivery_postcode,
      weight: totalWeight,
      length: totalLength,
      breadth: totalBreadth,
      height: totalHeight,
      cod
    };
    
    const serviceabilityResponse = await shiprocketService.checkCourierServiceability(serviceabilityParams);
    
    console.log('[Shipping] Serviceability response received');
    
    const availableCouriers = serviceabilityResponse?.data?.available_courier_companies || [];
    
    if (availableCouriers.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No couriers available for this pincode');
    }
    
    // Find cheapest courier
    const cheapestCourier = availableCouriers.reduce((prev, current) =>
      (prev.rate < current.rate) ? prev : current
    );
    
    console.log('[Shipping] Cheapest courier:', cheapestCourier);
    
    res.status(httpStatus.OK).send({
      status: 200,
      success: true,
      message: 'Shipping charge calculated successfully',
      data: {
        shipping_charge: cheapestCourier.rate,
        courier_name: cheapestCourier.courier_name,
        courier_company_id: cheapestCourier.courier_company_id,
        available_couriers: availableCouriers,
        weight_used: totalWeight,
        dimensions_used: { length: totalLength, breadth: totalBreadth, height: totalHeight },
        total_quantity: totalQuantity
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
