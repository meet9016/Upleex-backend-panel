/**
 * Fix Script: Recalculate and fix wallet balances
 * 
 * This script:
 * 1. Recalculates total_credited from all credit transactions
 * 2. Recalculates total_debited from all debit transactions  
 * 3. Calculates correct balance = total_credited - total_debited
 * 4. Updates wallet if there's a mismatch
 * 
 * Run (dry-run): node fix-wallet-balance.js
 * Run (apply): node fix-wallet-balance.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL;
const APPLY_CHANGES = process.argv.includes('--apply');

async function run() {
  await mongoose.connect(MONGODB_URL);
  console.log('Connected to MongoDB\n');

  const Wallet = require('./src/models/wallet.model');

  const wallets = await Wallet.find({}).lean();
  console.log(`Total wallets found: ${wallets.length}\n`);

  let fixed = 0;
  let alreadyCorrect = 0;
  let errors = 0;

  for (const wallet of wallets) {
    const walletId = wallet._id;
    const vendorId = wallet.vendor_id;

    // Calculate from transactions
    const creditTxs = wallet.transactions.filter(tx => tx.type === 'credit' && tx.status === 'completed');
    const debitTxs = wallet.transactions.filter(tx => tx.type === 'debit' && tx.status === 'completed');

    const calculatedCredited = creditTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const calculatedDebited = debitTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    const calculatedBalance = calculatedCredited - calculatedDebited;

    const storedCredited = wallet.total_credited || 0;
    const storedDebited = wallet.total_debited || 0;
    const storedBalance = wallet.balance || 0;

    const creditedMismatch = Math.abs(calculatedCredited - storedCredited) > 0.01;
    const debitedMismatch = Math.abs(calculatedDebited - storedDebited) > 0.01;
    const balanceMismatch = Math.abs(calculatedBalance - storedBalance) > 0.01;

    if (creditedMismatch || debitedMismatch || balanceMismatch) {
      console.log(`\n========================================`);
      console.log(`Wallet ID: ${walletId}`);
      console.log(`Vendor ID: ${vendorId}`);
      console.log(`\n--- STORED VALUES ---`);
      console.log(`  Balance: ₹${storedBalance.toFixed(2)}`);
      console.log(`  Total Credited: ₹${storedCredited.toFixed(2)}`);
      console.log(`  Total Debited: ₹${storedDebited.toFixed(2)}`);
      console.log(`\n--- CALCULATED FROM TRANSACTIONS ---`);
      console.log(`  Credit Transactions: ${creditTxs.length}`);
      console.log(`  Debit Transactions: ${debitTxs.length}`);
      console.log(`  Calculated Credited: ₹${calculatedCredited.toFixed(2)}`);
      console.log(`  Calculated Debited: ₹${calculatedDebited.toFixed(2)}`);
      console.log(`  Calculated Balance: ₹${calculatedBalance.toFixed(2)}`);
      console.log(`\n--- MISMATCH ---`);
      if (creditedMismatch) console.log(`  ⚠️ Credited diff: ₹${(calculatedCredited - storedCredited).toFixed(2)}`);
      if (debitedMismatch) console.log(`  ⚠️ Debited diff: ₹${(calculatedDebited - storedDebited).toFixed(2)}`);
      if (balanceMismatch) console.log(`  ⚠️ Balance diff: ₹${(calculatedBalance - storedBalance).toFixed(2)}`);

      if (APPLY_CHANGES) {
        try {
          await Wallet.updateOne(
            { _id: walletId },
            {
              $set: {
                balance: Math.max(0, calculatedBalance), // Ensure non-negative
                total_credited: calculatedCredited,
                total_debited: calculatedDebited
              }
            }
          );
          console.log(`  ✅ FIXED`);
          fixed++;
        } catch (err) {
          console.log(`  ❌ ERROR: ${err.message}`);
          errors++;
        }
      } else {
        console.log(`  [DRY RUN] Would fix this wallet`);
        fixed++;
      }
    } else {
      alreadyCorrect++;
    }
  }

  console.log(`\n========================================`);
  console.log(`\nSUMMARY:`);
  console.log(`  Total Wallets: ${wallets.length}`);
  console.log(`  Already Correct: ${alreadyCorrect}`);
  console.log(`  Need Fix: ${fixed}`);
  console.log(`  Errors: ${errors}`);

  if (!APPLY_CHANGES && fixed > 0) {
    console.log(`\n[DRY RUN] No changes made. Run with --apply to fix wallets.`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
