const cron = require('node-cron');
const Order = require('../models/order.model');
const shiprocketService = require('../services/shiprocket.service');

/**
 * Update Shiprocket order status for all synced orders
 */
const updateShiprocketOrders = async () => {
  try {
    console.log('[Shiprocket Cron] Starting Shiprocket order status update...');

    // Find all orders that are synced with Shiprocket and not yet delivered/cancelled
    const orders = await Order.find({
      shiprocket_order_id: { $exists: true, $ne: '' },
      vendor_status: { $nin: ['delivered', 'cancelled', 'completed'] }
    });

    console.log(`[Shiprocket Cron] Found ${orders.length} orders to update`);

    for (const order of orders) {
      try {
        console.log(`[Shiprocket Cron] Updating order ${order.order_id} (Shiprocket ID: ${order.shiprocket_order_id})...`);
        
        // Step 1: Get order details
        const orderResponse = await shiprocketService.getShiprocketOrder(order.shiprocket_order_id);
        console.log('ORDER RESPONSE:', orderResponse);
        
        const shipmentId = order.shiprocket_shipment_id;
        console.log('SHIPMENT ID:', shipmentId);

        if (orderResponse) {
          order.shiprocket_response = orderResponse;

          // Fix: shipments is an object inside orderResponse.data
          const shipments = orderResponse.data?.shipments;

          const shipment = Array.isArray(shipments)
          ? shipments[0]
          : shipments || {};
          console.log('SHIPMENT OBJECT:', shipment);
          
          // Check what fields we have in shipment
          const awbCode = shipment.awb_code || shipment.awb;
          const courierName = shipment.courier_name;
          const courierIdFromShipment = shipment.courier_id || shipment.courier_company_id;
          console.log(`[Shiprocket Cron] Found courier_id: ${courierIdFromShipment}`);

          // Step 2: Use tracking API if we have AWB
          if (awbCode) {
            try {
              const trackingResponse = await shiprocketService.trackShipment(awbCode);
              console.log('TRACKING RESPONSE:', JSON.stringify(trackingResponse, null, 2));
              order.tracking_response = trackingResponse;
              
              const trackingData = trackingResponse?.tracking_data;
              const shipmentTrack = trackingData?.shipment_track?.[0];
              
              if (shipmentTrack) {
                // 1. Save courier_partner from tracking response
                if (shipmentTrack.courier_name) {
                  order.delivery_tracking.courier_partner = shipmentTrack.courier_name;
                }

                // 2. Save delivery status
                if (shipmentTrack.current_status) {
                  order.delivery_tracking.status = shipmentTrack.current_status;

                  const statusMap = {
                    'Pickup Scheduled': 'preparing',
                    'Pickup Generated': 'preparing',
                    'Picked Up': 'picked_up',
                    'Out For Delivery': 'out_for_delivery',
                    'Delivered': 'delivered',
                    'RTO Initiated': 'returned',
                    'RTO Delivered': 'returned',
                    'Cancelled': 'cancelled',
                  };

                  const vendorStatus = statusMap[shipmentTrack.current_status];
                  if (vendorStatus && order.vendor_status !== vendorStatus) {
                    order.vendor_status = vendorStatus;
                    order.order_status = vendorStatus;
                    console.log(`[Shiprocket Cron] Updated tracking status to ${vendorStatus}`);
                  }
                }

                // 3. Save delivery_updates from shipment_track_activities
                const activities = trackingData?.shipment_track_activities || [];
                if (activities.length > 0) {
                  order.delivery_tracking.delivery_updates = activities.map(a => ({
                    status: a['sr-status-label'] || a.status || '',
                    message: a.activity || '',
                    location: a.location || '',
                    date: a.date ? a.date.split(' ')[0] : '',
                    timestamp: a.date ? new Date(a.date) : new Date(),
                    updated_by: 'system',
                  }));
                }
              }
            } catch (trackingError) {
              console.error('Tracking API Error:', trackingError.message);
            }
          }

          // Step 3: If no AWB yet, try to assign it
          if (!awbCode && !order.delivery_tracking.tracking_number && shipmentId) {
            console.log('No AWB found, starting complete flow to assign AWB...');
            try {
              let courierId = courierIdFromShipment;
              
              if (!courierId) {
                console.log('No courier_id in shipment, checking serviceability first...');
                
                // Get pickup and delivery pincodes from order
                const pickupPostcode = '110001'; // Default - you might want to get this from your pickup location settings
                const deliveryPostcode = order.shipping_address?.pincode;
                const cod = order.payment_method === 'cod' ? 1 : 0;
                const weight = 0.5; // Default weight
                
                if (!deliveryPostcode) {
                  console.log('No delivery postcode found, cannot check serviceability');
                } else {
                  // Step 1: Check serviceability to get available couriers
                  const serviceabilityParams = {
                    pickup_postcode: pickupPostcode,
                    delivery_postcode: deliveryPostcode,
                    cod: cod,
                    weight: weight
                  };
                  
                  console.log('Checking serviceability with params:', serviceabilityParams);
                  const serviceabilityResponse = await shiprocketService.checkCourierServiceability(serviceabilityParams);
                  
                  // Step 2: Get first available courier
                  const availableCouriers = serviceabilityResponse?.data?.available_courier_companies || [];
                  
                  if (availableCouriers.length > 0) {
                    const selectedCourier = availableCouriers[0];
                    courierId = selectedCourier.courier_company_id;
                    console.log(`Selected courier: ${selectedCourier.courier_name} (ID: ${courierId})`);
                  } else {
                    console.log('No available couriers found');
                  }
                }
              }
              
              // Step 3: If we have courierId, assign AWB
              if (courierId) {
                console.log('CALLING AWB API with shipment_id:', shipmentId, 'and courier_id:', courierId);
                const awbResponse = await shiprocketService.assignAwbToShipment(shipmentId, courierId);
                console.log('AWB Response:', awbResponse);
                
                if (awbResponse?.data?.awb_code) {
                  order.delivery_tracking.tracking_number = awbResponse.data.awb_code;
                  console.log(`[Shiprocket Cron] ✅ Assigned AWB for order ${order.order_id}: ${awbResponse.data.awb_code}`);
                  
                  // Generate pickup if not already generated and not picked up yet
                  if (
                    !order.pickup_generated && 
                    shipmentId && 
                    order.vendor_status !== 'picked_up'
                  ) {
                    try {
                      console.log(`[Shiprocket Cron] Generating pickup for order ${order.order_id}...`);
                      const pickupResponse = await shiprocketService.generatePickup(shipmentId);
                      order.pickup_generated = true;
                      order.pickup_response = pickupResponse;
                      console.log(`[Shiprocket Cron] ✅ Pickup generated for shipment ${shipmentId}`);
                    } catch (pickupError) {
                      console.error('[Shiprocket Cron] Error generating pickup:', pickupError.message);
                      // Don't fail the whole process if pickup fails
                    }
                  }
                }
                if (awbResponse?.data?.courier_name) {
                  order.delivery_tracking.courier_partner = awbResponse.data.courier_name;
                }
              } else {
                console.log('No courier_id available, skipping AWB assignment for now');
              }
            } catch (awbError) {
              console.error('Error in AWB assignment flow:', awbError.message);
              // Don't fail the whole process if AWB assignment fails
            }
          }
          
          // Still check if we got AWB from the order response
        if (awbCode && !order.delivery_tracking.tracking_number) {
  order.delivery_tracking.tracking_number = awbCode;

  console.log(
    `[Shiprocket Cron] ✅ Found AWB for order ${order.order_id}: ${awbCode}`
  );

  // Generate pickup if not already generated and not picked up yet
  if (
    !order.pickup_generated &&
    shipmentId &&
    order.vendor_status !== 'picked_up'
  ) {
    try {
      console.log(
        `[Shiprocket Cron] Generating pickup for order ${order.order_id}...`
      );

      const pickupResponse =
        await shiprocketService.generatePickup(shipmentId);

      order.pickup_generated = true;
      order.pickup_response = pickupResponse;

      console.log(
        `[Shiprocket Cron] ✅ Pickup generated for shipment ${shipmentId}`
      );
    } catch (pickupError) {
      console.error(
        '[Shiprocket Cron] Error generating pickup:',
        pickupError.message
      );

      // Don't fail the whole process if pickup fails
    }
  }
}

// Sync updated AWB if Shiprocket changes it
else if (
  awbCode &&
  order.delivery_tracking.tracking_number !== awbCode
) {
  console.log(
    `[Shiprocket Cron] 🔄 AWB updated for order ${order.order_id}: ${order.delivery_tracking.tracking_number} -> ${awbCode}`
  );

  order.delivery_tracking.tracking_number = awbCode;
}
          
          // Fallback: set courier_partner from order response if tracking didn't set it
          if (courierName && !order.delivery_tracking.courier_partner) {
            order.delivery_tracking.courier_partner = courierName;
          }

          await order.save();
          console.log(`[Shiprocket Cron] Successfully updated order ${order.order_id}`);
        }
      } catch (orderError) {
        console.error(`[Shiprocket Cron] Error updating order ${order.order_id}:`, orderError.message);
      }
    }

    console.log('[Shiprocket Cron] Shiprocket order status update completed');
  } catch (error) {
    console.error('[Shiprocket Cron] Error in Shiprocket tracking cron job:', error);
  }
};

/**
 * Initialize Shiprocket tracking cron job
 * Runs every 30 seconds
 */
const initShiprocketTrackingCron = () => {
  console.log('[Shiprocket Cron] Initializing Shiprocket tracking cron job (runs every 30 seconds)...');
  
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    await updateShiprocketOrders();
  });
  
  // Also run immediately on startup
  updateShiprocketOrders();
};

module.exports = {
  initShiprocketTrackingCron,
};
