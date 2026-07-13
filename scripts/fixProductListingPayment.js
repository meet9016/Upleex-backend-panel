/**
 * Script to fix product listing payment issues
 * 
 * This script checks and fixes:
 * 1. Products that are approved as 'paid' but no wallet deduction happened
 * 2. Products that should use General plan slots but didn't
 * 
 * Run: node scripts/fixProductListingPayment.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Models
const Product = require('../src/models/product.model');
const Wallet = require('../src/models/wallet.model');
const VendorKyc = require('../src/models/vendor/vendorKyc.model');
const GeneralPlanPurchase = require('../src/models/generalPlanPurchase.model');

// Constants
const PAID_LISTING_FEE = 10; // ₹10 per paid product

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

/**
 * Check if vendor has active General Plan with slots
 */
async function checkGeneralPlanQuota(vendorId) {
  const activePlans = await GeneralPlanPurchase.find({
    vendor_id: vendorId,
    status: 'active',
    expire_at: { $gt: new Date() }
  });

  for (const plan of activePlans) {
    const usedSlots = (plan.product_ids || []).length;
    const remainingSlots = (plan.max_products || 0) - usedSlots;
    if (remainingSlots > 0) {
      return { hasQuota: true, plan, remainingSlots };
    }
  }
  
  return { hasQuota: false, plan: null, remainingSlots: 0 };
}

/**
 * Check if product already has wallet deduction record
 */
async function hasWalletDeduction(vendorId, productId) {
  const wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) return false;
  
  return wallet.transactions.some(tx => 
    tx.type === 'debit' && 
    tx.metadata?.purpose === 'paid_listing_fee' && 
    String(tx.metadata?.product_id) === String(productId)
  );
}

/**
 * Deduct money from wallet
 */
async function deductFromWallet(vendorId, amount, productName, productId) {
  const wallet = await Wallet.findOne({ vendor_id: vendorId });
  if (!wallet) {
    throw new Error('Wallet not found');
  }
  
  if (wallet.balance < amount) {
    throw new Error(`Insufficient balance. Current: ₹${wallet.balance}, Required: ₹${amount}`);
  }
  
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const transactionId = `WLT${timestamp.slice(-6)}${random}`;
  
  wallet.balance -= amount;
  wallet.total_debited += amount;
  
  wallet.transactions.push({
    transaction_id: transactionId,
    type: 'debit',
    amount: amount,
    description: `Base (Paid listing) fee for approved product: ${productName}`,
    status: 'completed',
    metadata: {
      purpose: 'paid_listing_fee',
      product_name: productName,
      product_id: productId
    },
    createdAt: new Date()
  });
  
  await wallet.save();
  return transactionId;
}

/**
 * Main function to analyze and fix
 */
async function analyzeAndFix() {
  console.log('\n🔍 Starting Product Listing Payment Analysis...\n');
  console.log('=' .repeat(80));
  
  // Get all approved paid products
  const approvedPaidProducts = await Product.find({
    approval_status: 'approved',
    pricing_type: 'paid',
    status: { $in: ['active', 'draft'] }
  }).sort({ createdAt: -1 });
  
  console.log(`📊 Total approved paid products found: ${approvedPaidProducts.length}\n`);
  
  const issues = [];
  const fixed = [];
  const skipped = [];
  
  for (const product of approvedPaidProducts) {
    const vendorId = product.vendor_id;
    const productId = product._id;
    
    console.log(`\n📦 Product: ${product.product_name}`);
    console.log(`   ID: ${productId}`);
    console.log(`   Vendor: ${vendorId}`);
    console.log(`   Created: ${product.createdAt}`);
    console.log(`   Approval Status: ${product.approval_status}`);
    
    // Check if already paid (wallet deduction exists)
    const alreadyPaid = await hasWalletDeduction(vendorId, productId);
    
    if (alreadyPaid) {
      console.log(`   ✅ Already paid - wallet deduction exists`);
      skipped.push({ product, reason: 'already_paid' });
      continue;
    }
    
    // Check if product is in General plan's product_ids
    const generalPlanUsage = await GeneralPlanPurchase.findOne({
      vendor_id: vendorId,
      product_ids: productId
    });
    
    if (generalPlanUsage) {
      console.log(`   ✅ Using General Plan slot`);
      skipped.push({ product, reason: 'using_plan_slot' });
      continue;
    }
    
    // Check if vendor has available General Plan quota
    const generalQuota = await checkGeneralPlanQuota(vendorId);
    
    console.log(`   🔍 General Plan Quota: ${generalQuota.hasQuota ? `Yes (${generalQuota.remainingSlots} slots)` : 'No'}`);
    
    // Get vendor's GST status
    const vendorKyc = await VendorKyc.findOne({
      $or: [
        { 'ContactDetails.vendor_id': String(vendorId) },
        { vendor_id: String(vendorId) }
      ]
    });
    const hasGST = !!(vendorKyc && String(vendorKyc.Identity?.gst_number || '').trim());
    console.log(`   🔍 Vendor GST: ${hasGST ? 'Yes' : 'No'}`);
    
    // Check if within free limit
    const freeLimit = hasGST ? 3 : 1;
    const freeProducts = await Product.countDocuments({
      vendor_id: vendorId,
      pricing_type: 'free',
      status: { $in: ['active', 'draft'] }
    });
    
    const paidProductsBefore = await Product.countDocuments({
      vendor_id: vendorId,
      pricing_type: 'paid',
      approval_status: 'approved',
      status: { $in: ['active', 'draft'] },
      createdAt: { $lt: product.createdAt }
    });
    
    console.log(`   🔍 Free products: ${freeProducts}, Free limit: ${freeLimit}`);
    console.log(`   🔍 Paid products before this: ${paidProductsBefore}`);
    
    // Determine if this should be charged
    let shouldCharge = false;
    let chargeReason = '';
    
    if (generalQuota.hasQuota) {
      // Use general plan slot - add product to plan
      generalQuota.plan.product_ids.push(productId);
      await generalQuota.plan.save();
      console.log(`   ✅ Added to General Plan (Slot used)`);
      fixed.push({ product, action: 'added_to_plan', plan: 'general' });
      continue;
    } else {
      // Should charge wallet - ₹10 deduction
      shouldCharge = true;
      chargeReason = 'No General Plan quota available';
    }
    
    if (shouldCharge) {
      // Check wallet balance
      const wallet = await Wallet.findOne({ vendor_id: vendorId });
      
      if (!wallet) {
        console.log(`   ❌ ISSUE: No wallet found for vendor`);
        issues.push({ product, issue: 'no_wallet', vendorId });
        continue;
      }
      
      console.log(`   💰 Wallet Balance: ₹${wallet.balance}`);
      
      if (wallet.balance < PAID_LISTING_FEE) {
        console.log(`   ❌ ISSUE: Insufficient balance. Need ₹${PAID_LISTING_FEE}, have ₹${wallet.balance}`);
        issues.push({ 
          product, 
          issue: 'insufficient_balance', 
          vendorId, 
          currentBalance: wallet.balance, 
          required: PAID_LISTING_FEE 
        });
        continue;
      }
      
      // Try to deduct
      try {
        const txId = await deductFromWallet(vendorId, PAID_LISTING_FEE, product.product_name, productId);
        console.log(`   ✅ FIXED: ₹${PAID_LISTING_FEE} deducted. TX ID: ${txId}`);
        fixed.push({ product, action: 'wallet_deducted', amount: PAID_LISTING_FEE, txId });
      } catch (err) {
        console.log(`   ❌ ERROR: ${err.message}`);
        issues.push({ product, issue: 'deduction_failed', error: err.message, vendorId });
      }
    }
  }
  
  // Print Summary
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Products Analyzed: ${approvedPaidProducts.length}`);
  console.log(`✅ Fixed/Processed: ${fixed.length}`);
  console.log(`⏭️  Skipped (Already handled): ${skipped.length}`);
  console.log(`❌ Issues Found: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\n❌ ISSUES DETAILS:');
    issues.forEach((item, i) => {
      console.log(`\n${i + 1}. Product: ${item.product.product_name}`);
      console.log(`   Vendor: ${item.vendorId}`);
      console.log(`   Issue: ${item.issue}`);
      if (item.currentBalance !== undefined) {
        console.log(`   Balance: ₹${item.currentBalance}, Required: ₹${item.required}`);
      }
      if (item.error) {
        console.log(`   Error: ${item.error}`);
      }
    });
  }
  
  if (fixed.length > 0) {
    console.log('\n✅ FIXED ITEMS:');
    fixed.forEach((item, i) => {
      console.log(`\n${i + 1}. Product: ${item.product.product_name}`);
      console.log(`   Action: ${item.action}`);
      if (item.amount) {
        console.log(`   Amount: ₹${item.amount}`);
      }
      if (item.plan) {
        console.log(`   Plan: ${item.plan}`);
      }
    });
  }
  
  return { total: approvedPaidProducts.length, fixed: fixed.length, issues: issues.length, skipped: skipped.length };
}

/**
 * Run the script
 */
async function main() {
  try {
    await connectDB();
    await analyzeAndFix();
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Script failed:', err);
    process.exit(1);
  }
}

// Run
main();
