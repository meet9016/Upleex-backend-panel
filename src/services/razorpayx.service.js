const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/config');

const razorpayKeyId = config.razorpay?.keyId || process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = config.razorpay?.keySecret || process.env.RAZORPAY_KEY_SECRET;

const getRazorpayXHeaders = () => {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString('base64')}`
  };
};

// RazorpayX Account Number for payouts
const RAZORPAYX_ACCOUNT_NUMBER = config.razorpayx?.accountNumber || process.env.RAZORPAYX_ACCOUNT_NUMBER;
const RAZORPAY_WEBHOOK_SECRET = config.razorpayx?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;

/**
 * RazorpayX Payouts Service
 * Handles real money transfers to vendor bank accounts
 */

/**
 * Create a contact in RazorpayX (vendor as recipient)
 * @param {Object} vendorData - Vendor details
 * @returns {Promise<Object>} - Contact object with contact_id
 */
const createContact = async (vendorData) => {
  try {
    const response = await axios.post('https://api.razorpay.com/v1/contacts', {
      name: vendorData.name || vendorData.business_name,
      email: vendorData.email,
      contact: vendorData.phone || vendorData.mobile,
      type: 'vendor',
      reference_id: vendorData.vendor_id,
      notes: {
        vendor_type: vendorData.vendor_type || 'vendor',
      },
    }, { headers: getRazorpayXHeaders() });

    const contact = response.data;
    return {
      success: true,
      contact_id: contact.id,
      data: contact,
    };
  } catch (error) {
    const errorMsg = error.response?.data?.error?.description || error.message;
    console.error('[RazorpayX] Create Contact Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
};

/**
 * Create a fund account (bank account) for a contact
 * @param {String} contactId - RazorpayX contact ID
 * @param {Object} bankDetails - Vendor bank details
 * @returns {Promise<Object>} - Fund account object with fund_account_id
 */
const createFundAccount = async (contactId, bankDetails) => {
  try {
    const response = await axios.post('https://api.razorpay.com/v1/fund_accounts', {
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: {
        name: bankDetails.account_holder_name,
        ifsc: bankDetails.ifsc_code,
        account_number: bankDetails.account_number,
      },
    }, { headers: getRazorpayXHeaders() });

    const fundAccount = response.data;
    return {
      success: true,
      fund_account_id: fundAccount.id,
      data: fundAccount,
    };
  } catch (error) {
    const errorMsg = error.response?.data?.error?.description || error.message;
    console.error('[RazorpayX] Create Fund Account Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
};

/**
 * Create a payout to vendor's bank account
 * @param {Object} payoutData - Payout details
 * @returns {Promise<Object>} - Payout object with payout_id
 */
const createPayout = async (payoutData) => {
  try {
    if (!RAZORPAYX_ACCOUNT_NUMBER) {
      console.error('[RazorpayX] RAZORPAYX_ACCOUNT_NUMBER not configured');
      return {
        success: false,
        error: 'RazorpayX account number not configured. Please add RAZORPAYX_ACCOUNT_NUMBER to environment variables.',
      };
    }

    const response = await axios.post('https://api.razorpay.com/v1/payouts', {
      account_number: RAZORPAYX_ACCOUNT_NUMBER, // Your RazorpayX virtual account
      fund_account_id: payoutData.fund_account_id,
      amount: Math.round(payoutData.amount * 100), // Convert to paise
      currency: 'INR',
      mode: 'IMPS', // or NEFT, RTGS, UPI
      purpose: 'vendor_payout',
      reference_id: payoutData.reference_id, // VendorPayment _id
      narration: `Vendor payout for order ${payoutData.order_id || payoutData.quote_id || 'N/A'}`,
      notes: {
        vendor_id: payoutData.vendor_id?.toString() || '',
        order_id: payoutData.order_id?.toString() || '',
        quote_id: payoutData.quote_id?.toString() || '',
      },
    }, { headers: getRazorpayXHeaders() });

    const payout = response.data;
    console.log('[RazorpayX] Payout created successfully:', payout.id);

    return {
      success: true,
      payout_id: payout.id,
      status: payout.status,
      data: payout,
    };
  } catch (error) {
    const errorMsg = error.response?.data?.error?.description || error.message;
    console.error('[RazorpayX] Create Payout Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
};

/**
 * Get payout status
 * @param {String} payoutId - RazorpayX payout ID
 * @returns {Promise<Object>} - Payout status
 */
const getPayoutStatus = async (payoutId) => {
  try {
    const response = await axios.get(`https://api.razorpay.com/v1/payouts/${payoutId}`, { headers: getRazorpayXHeaders() });
    const payout = response.data;
    return {
      success: true,
      status: payout.status,
      data: payout,
    };
  } catch (error) {
    const errorMsg = error.response?.data?.error?.description || error.message;
    console.error('[RazorpayX] Get Payout Status Error:', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
};

/**
 * Process vendor payout (complete flow)
 * 1. Create contact if not exists
 * 2. Create fund account if not exists
 * 3. Create payout
 * @param {Object} vendorPayment - VendorPayment document
 * @param {Object} vendorKyc - VendorKyc document with bank details
 * @returns {Promise<Object>} - Payout result
 */
const processVendorPayout = async (vendorPayment, vendorKyc) => {
  try {
    const bankDetails = vendorKyc.Bank;
    
    if (!bankDetails?.account_number || !bankDetails?.ifsc_code || !bankDetails?.account_holder_name) {
      return {
        success: false,
        error: 'Vendor bank details incomplete. Please update bank details in KYC.',
      };
    }

    // Check if vendor already has a fund_account_id stored
    let fundAccountId = vendorKyc.fund_account_id;
    let contactId = vendorKyc.razorpayx_contact_id;

    // Create contact if not exists
    if (!contactId) {
      console.log('[RazorpayX] Creating contact for vendor:', vendorPayment.vendor_id);
      
      const contactResult = await createContact({
        vendor_id: vendorPayment.vendor_id,
        name: vendorKyc.ContactDetails?.full_name,
        business_name: vendorKyc.Identity?.business_name,
        email: vendorKyc.ContactDetails?.email,
        phone: vendorKyc.ContactDetails?.mobile,
        vendor_type: vendorKyc.vendor_type,
      });

      if (!contactResult.success) {
        return contactResult;
      }
      contactId = contactResult.contact_id;
      
      // Save contact_id to vendorKyc
      vendorKyc.razorpayx_contact_id = contactId;
      await vendorKyc.save();
    }

    // Create fund account if not exists
    if (!fundAccountId) {
      console.log('[RazorpayX] Creating fund account for contact:', contactId);
      
      const fundAccountResult = await createFundAccount(contactId, bankDetails);
      
      if (!fundAccountResult.success) {
        return fundAccountResult;
      }
      fundAccountId = fundAccountResult.fund_account_id;
      
      // Save fund_account_id to vendorKyc
      vendorKyc.fund_account_id = fundAccountId;
      await vendorKyc.save();
    }

    // Create payout
    console.log('[RazorpayX] Creating payout for amount:', vendorPayment.vendor_amount);
    
    const payoutResult = await createPayout({
      fund_account_id: fundAccountId,
      amount: vendorPayment.vendor_amount,
      reference_id: vendorPayment._id.toString(),
      vendor_id: vendorPayment.vendor_id,
      order_id: vendorPayment.order_id?.toString(),
      quote_id: vendorPayment.quote_id?.toString(),
    });

    if (!payoutResult.success) {
      return payoutResult;
    }

    // Update vendor payment with payout details
    vendorPayment.payout_id = payoutResult.payout_id;
    vendorPayment.payout_status = payoutResult.status;
    vendorPayment.payment_status = 'processing';
    vendorPayment.released_at = new Date();
    vendorPayment.released_by = 'system';
    await vendorPayment.save();

    console.log('[RazorpayX] Payout initiated successfully for vendor:', vendorPayment.vendor_id);

    return {
      success: true,
      payout_id: payoutResult.payout_id,
      status: payoutResult.status,
      message: 'Payout initiated successfully. Money will be transferred to vendor bank account in 24-48 hours.',
    };
  } catch (error) {
    console.error('[RazorpayX] Process Vendor Payout Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Verify payout webhook signature
 * @param {String} body - Raw request body
 * @param {String} signature - X-Razorpay-Signature header
 * @returns {Boolean} - Is valid webhook
 */
const verifyWebhookSignature = (body, signature) => {
  if (!RAZORPAY_WEBHOOK_SECRET) {
    console.error('[RazorpayX] RAZORPAY_WEBHOOK_SECRET not configured');
    return false;
  }
  
  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');
  
  return expectedSignature === signature;
};

/**
 * Handle payout webhook events
 * @param {Object} payload - Webhook payload
 * @returns {Object} - Processing result
 */
const handlePayoutWebhook = async (payload) => {
  try {
    console.log('[RazorpayX Webhook] Received payload:', JSON.stringify(payload, null, 2));
    
    const event = payload.event;
    
    // Check if it's a payout event
    if (!event || !event.startsWith('payout.')) {
      console.log('[RazorpayX Webhook] Not a payout event, ignoring');
      return { success: true, message: 'Not a payout event, ignored' };
    }

    const payout = payload.payload?.payout?.entity;
    if (!payout) {
      console.log('[RazorpayX Webhook] No payout data in payload');
      return { success: false, message: 'No payout data' };
    }

    const VendorPayment = require('../models/vendorPayment.model');
    
    // Find vendor payment by payout_id or reference_id
    let vendorPayment = await VendorPayment.findOne({ payout_id: payout.id });
    
    if (!vendorPayment && payout.reference_id) {
      vendorPayment = await VendorPayment.findById(payout.reference_id);
    }
    
    if (!vendorPayment) {
      console.log('[RazorpayX Webhook] VendorPayment not found for payout:', payout.id);
      return { success: false, message: 'VendorPayment not found' };
    }

    // Update status based on webhook event
    switch (event) {
      case 'payout.processed':
        vendorPayment.payment_status = 'released';
        vendorPayment.payout_status = 'processed';
        vendorPayment.notes = 'Payment successfully transferred to vendor bank account.';
        console.log('[RazorpayX Webhook] Payout processed for vendor:', vendorPayment.vendor_id);
        break;
        
      case 'payout.pending':
        vendorPayment.payment_status = 'processing';
        vendorPayment.payout_status = 'pending';
        console.log('[RazorpayX Webhook] Payout pending for vendor:', vendorPayment.vendor_id);
        break;
        
      case 'payout.failed':
        vendorPayment.payment_status = 'failed';
        vendorPayment.payout_status = 'failed';
        vendorPayment.notes = `Payout failed: ${payout.status_details?.description || 'Unknown reason'}`;
        console.log('[RazorpayX Webhook] Payout failed for vendor:', vendorPayment.vendor_id);
        break;
        
      case 'payout.reversed':
        vendorPayment.payment_status = 'failed';
        vendorPayment.payout_status = 'reversed';
        vendorPayment.notes = 'Payout reversed by bank';
        console.log('[RazorpayX Webhook] Payout reversed for vendor:', vendorPayment.vendor_id);
        break;
        
      case 'payout.cancelled':
        vendorPayment.payment_status = 'cancelled';
        vendorPayment.payout_status = 'cancelled';
        vendorPayment.notes = 'Payout cancelled';
        console.log('[RazorpayX Webhook] Payout cancelled for vendor:', vendorPayment.vendor_id);
        break;
        
      default:
        console.log('[RazorpayX Webhook] Unhandled event:', event);
        return { success: true, message: `Unhandled event: ${event}` };
    }

    await vendorPayment.save();

    return {
      success: true,
      message: `Payout ${event} processed`,
      vendor_payment_id: vendorPayment._id,
    };
  } catch (error) {
    console.error('[RazorpayX Webhook] Handler Error:', error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = {
  createContact,
  createFundAccount,
  createPayout,
  getPayoutStatus,
  processVendorPayout,
  verifyWebhookSignature,
  handlePayoutWebhook,
};
