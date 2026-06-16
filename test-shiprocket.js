const shiprocketService = require('./src/services/shiprocket.service');

async function testShiprocketFlow() {
  console.log('\n========================================');
  console.log('🚀 SHIPROCKET FLOW TEST START');
  console.log('========================================\n');

  try {
    // Test Order Data
    const testOrder = {
      order_id: 'TEST-' + Date.now(),
      order_date: new Date().toISOString().slice(0, 16).replace('T', ' '),
      pickup_location: 'Home',
      comment: 'Test Order from Upleex',
      billing_customer_name: 'Test',
      billing_last_name: 'Customer',
      billing_address: 'Test Address Line 1',
      billing_address_2: 'Test Address Line 2',
      billing_city: 'Delhi',
      billing_pincode: '110001',
      billing_state: 'Delhi',
      billing_country: 'India',
      billing_email: 'test@upleex.com',
      billing_phone: '9876543210',
      shipping_is_billing: 1,
      order_items: [
        {
          name: 'Test Product',
          sku: 'TEST-SKU-001',
          units: 1,
          selling_price: 500,
          discount: '0',
          tax: '18',
          hsn: ''
        }
      ],
      payment_method: 'Prepaid',
      sub_total: 500,
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5
    };

    console.log('📦 Step 1: Creating Order in Shiprocket...');
    console.log('Order Data:', JSON.stringify(testOrder, null, 2));
    
    const orderResponse = await shiprocketService.createShiprocketOrder(testOrder);
    console.log('\n✅ Order Created Successfully!');
    console.log('Shiprocket Order ID:', orderResponse.order_id);
    console.log('Shipment ID:', orderResponse.shipment_id);
    console.log('Full Response:', JSON.stringify(orderResponse, null, 2));

    // Wait a bit for order to process
    console.log('\n⏳ Waiting 3 seconds for order to process...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get Order Details
    console.log('\n📦 Step 2: Fetching Order Details...');
    const orderDetails = await shiprocketService.getShiprocketOrder(orderResponse.order_id);
    console.log('Order Details:', JSON.stringify(orderDetails, null, 2));

    // Check Serviceability
    console.log('\n📦 Step 3: Checking Courier Serviceability...');
    const serviceability = await shiprocketService.checkCourierServiceability({
      pickup_postcode: '110001',
      delivery_postcode: '110001',
      cod: 0,
      weight: 0.5
    });
    console.log('Available Couriers:', serviceability.data?.available_courier_companies?.length || 0);
    if (serviceability.data?.available_courier_companies?.length > 0) {
      console.log('First Courier:', serviceability.data.available_courier_companies[0].courier_name);
    }

    console.log('\n========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED!');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('API Error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testShiprocketFlow();
