/**
 * Verify: Check wallet balance history to understand what actually happened
 * Run: node verify-wallet-fix.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log('Connected to MongoDB\n');

  const Product = require('./src/models/product.model');
  const Wallet = require('./src/models/wallet.model');

  const paidApprovedProducts = await Product.find({
    pricing_type: 'paid',
    approval_status: 'approved',
  }).lean();

  // Group by vendor
  const vendorMap = {};
  for (const p of paidApprovedProducts) {
    const vid = String(p.vendor_id);
    if (!vendorMap[vid]) vendorMap[vid] = [];
    vendorMap[vid].push(p);
  }

  console.log(`Vendors with approved paid products: ${Object.keys(vendorMap).length}\n`);

  for (const [vendorId, products] of Object.entries(vendorMap)) {
    const wallet = await Wallet.findOne({ vendor_id: vendorId }).lean();
    if (!wallet) {
      console.log(`Vendor ${vendorId}: NO WALLET EXISTS`);
      continue;
    }

    const paidEntries = wallet.transactions.filter(tx =>
      tx.type === 'debit' && tx.metadata?.purpose === 'paid_listing_fee'
    );

    console.log(`Vendor ${vendorId}:`);
    console.log(`  Current Balance: ₹${wallet.balance}`);
    console.log(`  Total Debited (all time): ₹${wallet.total_debited}`);
    console.log(`  Approved paid products: ${products.length}`);
    console.log(`  paid_listing_fee debit entries: ${paidEntries.length}`);
    if (products.length !== paidEntries.length) {
      console.log(`  ⚠️  MISMATCH: ${products.length - paidEntries.length} entries missing`);
    }
    console.log('');
  }

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
