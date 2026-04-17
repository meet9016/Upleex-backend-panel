const Wallet = require('../models/wallet.model');

/**
 * Middleware to ensure vendor has a wallet
 * Creates wallet if it doesn't exist
 */
const ensureWallet = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      const vendorId = req.user.id;
      
      // Check if wallet exists
      let wallet = await Wallet.findOne({ vendor_id: vendorId });
      
      // Create wallet if it doesn't exist
      if (!wallet) {
        wallet = await Wallet.createWalletForVendor(vendorId);
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in ensureWallet middleware:', error);
    // Don't fail the request if wallet creation fails
    next();
  }
};

module.exports = ensureWallet;