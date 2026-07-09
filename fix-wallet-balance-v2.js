/**
 * Fix Script V2: Recalculate and fix wallet balances
 * 
 * This script:
 * 1. Scans ALL transactions in wallet
 * 2. Recalculates total_credited from all COMPLETED credit transactions
 * 3. Recalculates total_debited from all COMPLETED debit transactions  
 * 4. Calculates correct balance = total_credited - total_debited
 * 5. Updates wallet if there's a mismatch
 * 
 * Run (dry-run): node fix-wallet-balance-v2.js
 * Run (apply): node fix-wallet-balance-v2.js --apply
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URL = process.env.MONGODB_URL;
const APPLY_CHANGES = process.argv.includes('--apply');

async function run() {
  try {
    await mongoose.connect(MONGODB_URL);
    console.log('Connected to MongoDB\n');

    const Wallet = require('./src/models/wallet.model');

    const wallets = await Wallet.find({}).lean();
    console.log(`Total wallets found: ${wallets.length}\n`);

    let fixed = 0;
    let alreadyCorrect = 0;
    let errors = 0;
    let totalMismatch = 0;

    for (const wallet of wallets) {
      const walletId = wallet._id;
      const vendorId = wallet.vendor_id;

      // Get ALL transactions including pending, failed
      const allTransactions = wallet.transactions || [];
      
      // Calculate from ONLY COMPLETED transactions
      const creditTxs = allTransactions.filter(tx => tx.type === 'credit' && tx.status === 'completed');
      const debitTxs = allTransactions.filter(tx => tx.type === 'debit' && tx.status === 'completed');

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
        totalMismatch++;
        
        console.log(`\n========================================`);
        console.log(`Wallet ID: ${walletId}`);
        console.log(`Vendor ID: ${vendorId}`);
        console.log(`\n--- TRANSACTION COUNT ---`);
        console.log(`  Total Transactions: ${allTransactions.length}`);
        console.log(`  Completed Credit: ${creditTxs.length}`);
        console.log(`  Completed Debit: ${debitTxs.length}`);
        console.log(`  Pending: ${allTransactions.filter(t => t.status === 'pending').length}`);
        console.log(`  Failed: ${allTransactions.filter(t => t.status === 'failed').length}`);
        console.log(`\n--- STORED VALUES ---`);
        console.log(`  Balance: ₹${storedBalance.toFixed(2)}`);
        console.log(`  Total Credited: ₹${storedCredited.toFixed(2)}`);
        console.log(`  Total Debited: ₹${storedDebited.toFixed(2)}`);
        console.log(`\n--- CALCULATED FROM TRANSACTIONS ---`);
        console.log(`  Calculated Credited: ₹${calculatedCredited.toFixed(2)}`);
        console.log(`  Calculated Debited: ₹${calculatedDebited.toFixed(2)}`);
        console.log(`  Calculated Balance: ₹${calculatedBalance.toFixed(2)}`);
        console.log(`\n--- MISMATCH ---`);
        if (creditedMismatch) console.log(`  ⚠️ Credited diff: ₹${(calculatedCredited - storedCredited).toFixed(2)}`);
        if (debitedMismatch) console.log(`  ⚠️ Debited diff: ₹${(calculatedDebited - storedDebited).toFixed(2)}`);
        if (balanceMismatch) console.log(`  ⚠️ Balance diff: ₹${(calculatedBalance - storedBalance).toFixed(2)}`);

        if (APPLY_CHANGES) {
          try {
            const result = await Wallet.updateOne(
              { _id: walletId },
              {
                $set: {
                  balance: Math.max(0, calculatedBalance),
                  total_credited: calculatedCredited,
                  total_debited: calculatedDebited
                }
              }
            );
            
            if (result.modifiedCount > 0) {
              console.log(`  ✅ FIXED`);
              fixed++;
            } else {
              console.log(`  ⚠️ NO CHANGES MADE`);
            }
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
    console.log(`  Had Mismatch: ${totalMismatch}`);
    console.log(`  Fixed: ${fixed}`);
    console.log(`  Errors: ${errors}`);

    if (!APPLY_CHANGES && totalMismatch > 0) {
      console.log(`\n[DRY RUN] No changes made. Run with --apply to fix wallets.`);
    } else if (APPLY_CHANGES && fixed > 0) {
      console.log(`\n✅ Successfully fixed ${fixed} wallets!`);
    }

    await mongoose.disconnect();
    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
