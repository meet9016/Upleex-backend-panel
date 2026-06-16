const shiprocketService = require('./src/services/shiprocket.service');
const config = require('./src/config/config');

async function testCompleteFlow() {
  console.log('\n========================================');
  console.log('🚀 TESTING COMPLETE AUTOMATED FLOW');
  console.log('========================================\n');

  try {
    const testOrder = {
      order_id: 'AUTO-TEST-' + Date.now(),
      order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      pickup_location: 'Home',
      comment: 'Automated Flow Test - Upleex',
      billing_customer_name: 'Test',
      billing_last_name: 'Customer',
      billing_address: '123 Test Street',
      billing_address_2: 'Near Park',
      billing_city: 'Mumbai',
      billing_pincode: '400001', // Mumbai pincode
      billing_state: 'Maharashtra',
      billing_country: 'India',
      billing_email: 'test@upleex.com',
      billing_phone: '9876543210',
      shipping_is_billing: 1,
      order_items: [
        {
          name: 'Test Product Auto',
          sku: 'AUTO-SKU-001',
          units: 1,
          selling_price: 1000,
          discount: '0',
          tax: '18',
          hsn: ''
        }
      ],
      payment_method: 'Prepaid',
      sub_total: 1000,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5
    };

    console.log('📦 STEP 1: Creating Order...');
    const orderResponse = await shiprocketService.createShiprocketOrder(testOrder);
    console.log('✅ Order Created!');
    console.log('   Order ID:', orderResponse.order_id);
    console.log('   Shipment ID:', orderResponse.shipment_id);

    const shipmentId = orderResponse.shipment_id;

    // Wait for order to process
    console.log('\n⏳ Waiting 2 seconds for order to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 2: Check Serviceability
    console.log('\n📦 STEP 2: Checking Courier Serviceability...');
    const pickupPostcode = config.shiprocket.pickupLocation === 'Home' ? '394105' : '110001';
    const deliveryPostcode = '400001';
    
    const serviceability = await shiprocketService.checkCourierServiceability({
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      cod: 0,
      weight: 0.5
    });

    const availableCouriers = serviceability?.data?.available_courier_companies || [];
    console.log(`✅ Found ${availableCouriers.length} available couriers`);

    if (availableCouriers.length > 0) {
      const selectedCourier = availableCouriers[0];
      const courierId = selectedCourier.courier_company_id;
      
      console.log(`   Selected: ${selectedCourier.courier_name} (ID: ${courierId})`);
      console.log(`   Rate: ₹${selectedCourier.rate}`);
      console.log(`   EDD: ${selectedCourier.etd}`);

      // STEP 3: Assign AWB
      console.log('\n📦 STEP 3: Assigning AWB...');
      try {
        const awbResponse = await shiprocketService.assignAwbToShipment(shipmentId, courierId);
        console.log('✅ AWB Assigned!');
        
        const awbCode = awbResponse.awb_code || awbResponse.data?.awb_code;
        const courierName = awbResponse.courier_name || awbResponse.data?.courier_name;
        
        console.log('   AWB Code:', awbCode);
        console.log('   Courier:', courierName);

        // STEP 4: Generate Pickup
        console.log('\n📦 STEP 4: Generating Pickup...');
        try {
          const pickupResponse = await shiprocketService.generatePickup(shipmentId);
          console.log('✅ Pickup Generated!');
          console.log('   Response:', JSON.stringify(pickupResponse, null, 2));

          // STEP 5: Track Shipment
          if (awbCode) {
            console.log('\n📦 STEP 5: Tracking Shipment...');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const trackingData = await shiprocketService.trackShipment(awbCode);
            console.log('✅ Tracking Data Received!');
            console.log('   Current Status:', trackingData?.tracking_data?.shipment_track?.[0]?.current_status || 'N/A');
          }

          console.log('\n========================================');
          console.log('✅✅✅ ALL STEPS AUTOMATED SUCCESSFULLY!');
          console.log('========================================');
          console.log('\nSummary:');
          console.log('  1. ✅ Order Created');
          console.log('  2. ✅ Courier Selected (Auto)');
          console.log('  3. ✅ AWB Assigned (Auto)');
          console.log('  4. ✅ Pickup Generated (Auto)');
          console.log('  5. ✅ Tracking Available');
          console.log('\nThis is now FULLY AUTOMATED! 🎉');
          console.log('========================================\n');

        } catch (pickupError) {
          console.log('⚠️ Pickup Error:', pickupError.message);
        }
      } catch (awbError) {
        console.log('⚠️ AWB Error:', awbError.message);
      }
    } else {
      console.log('⚠️ No couriers available');
    }

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testCompleteFlow();
