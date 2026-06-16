const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const shiprocketService = require('../services/shiprocket.service');
const config = require('../config/config');

const calculateShippingCharge = catchAsync(async (req, res) => {
  try {
    console.log('[Shipping] Calculating shipping charge...');
    
    const { delivery_postcode, weight = 0.5, cod = 0 } = req.body;
    
    if (!delivery_postcode) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Delivery pincode is required');
    }
    
    console.log('[Shipping] Params:', { delivery_postcode, weight, cod });
    
    // Get pickup postcode from config or use default
    const pickup_postcode = '394105'; // You can change this or get from settings/config
    
    const serviceabilityParams = {
      pickup_postcode,
      delivery_postcode,
      weight,
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
        available_couriers: availableCouriers
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
