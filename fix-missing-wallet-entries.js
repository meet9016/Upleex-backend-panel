/**
 * Fix Script: Add missing wallet debit entries for approved paid products
 * 
 * Finds all approved + paid products that don't have a wallet debit entry
 * and creates the missing transaction records.
 * 
 * Run: node fix-missing-wallet-entries.js
 * Run (dry-run): node fix-missing-wallet-entries.js --dry-run
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL;
const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  await mongoose.connect(MONGODB_URL);
  console.log('Connected to MongoDB\n');

  const Product = require('./src/models/product.model');
  const Wallet = require('./src/models/wallet.model');

  // 1. Find all approved paid products
  const paidApprovedProducts = await Product.find({
    pricing_type: 'paid',
    approval_status: 'approved',
  }).lean();

  console.log(`Total approved paid products: ${paidApprovedProducts.length}`);

  const missing = [];

  for (const product of paidApprovedProducts) {
    const wallet = await Wallet.findOne({ vendor_id: product.vendor_id });

    const alreadyPaid = wallet && wallet.transactions.some(tx =>
      tx.type === 'debit' &&
      tx.metadata?.purpose === 'paid_listing_fee' &&
      String(tx.metadata?.product_id) === String(product._id)
    );

    if (!alreadyPaid) {
      missing.push(product);
    }
  }

  console.log(`Products missing wallet entry: ${missing.length}\n`);

  if (missing.length === 0) {
    console.log('No missing entries found. All good!');
    await mongoose.disconnect();
    return;
  }

  // Print missing products
  console.log('Missing wallet entries for:');
  missing.forEach(p => {
    console.log(`  - Product: "${p.product_name}" | ID: ${p._id} | Vendor: ${p.vendor_id}`);
  });

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Remove --dry-run to apply fixes.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nApplying fixes...');

  let fixed = 0;
  let skipped = 0;

  for (const product of missing) {
    let wallet = await Wallet.findOne({ vendor_id: product.vendor_id });

    if (!wallet) {
      console.log(`  SKIP: No wallet found for vendor ${product.vendor_id} (product: "${product.product_name}")`);
      skipped++;
      continue;
    }

    // Generate transaction ID
    const timestamp = Date.now().toString();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const transactionId = `WLT${timestamp.slice(-6)}${random}`;

    const transaction = {
      transaction_id: transactionId,
      type: 'debit',
      amount: 10,
      description: `Base (Paid listing) fee for approved product: ${product.product_name}`,
      status: 'completed',
      metadata: {
        purpose: 'paid_listing_fee',
        product_name: product.product_name,
        product_id: product._id,
        category_id: product.category_id,
        sub_category_id: product.sub_category_id,
        note: 'Backfilled by fix-missing-wallet-entries script',
      },
    };

    wallet.transactions.push(transaction);
    // Only adjust totals, do NOT touch balance (money was already deducted from vendor)
    wallet.total_debited = (wallet.total_debited || 0) + 10;

    await wallet.save();
    console.log(`  FIXED: "${product.product_name}" (${product._id}) -> txn: ${transactionId}`);
    fixed++;
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
