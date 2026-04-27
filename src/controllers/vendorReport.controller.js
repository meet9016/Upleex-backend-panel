const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Product, Service, Order, GetQuote, Wallet } = require('../models');
const Vendor = require('../models/vendor/vendor.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const mongoose = require('mongoose');

/**
 * Get comprehensive vendor report with filters
 */
const getVendorReport = catchAsync(async (req, res) => {
  const { 
    vendor_type, 
    date_range, 
    start_date, 
    end_date,
    search,
    min_revenue,
    max_revenue
  } = req.query;

  // Build vendor query
  const vendorQuery = {};

  // Add search filter
  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    vendorQuery.$or = [
      { full_name: searchRegex },
      { email: searchRegex },
      { business_name: searchRegex },
      { number: searchRegex }
    ];
  }

  // Add vendor type filter
  if (vendor_type) {
    vendorQuery.vendor_type = vendor_type.toLowerCase();
  }

  // Build date filter
  let dateFilter = {};
  const now = new Date();
  
  if (date_range && date_range !== 'all') {
    let startDate;
    
    switch (date_range) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case '3months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case '6months':
        startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        if (start_date && end_date) {
          startDate = new Date(start_date);
          dateFilter = { $gte: startDate, $lte: new Date(end_date + 'T23:59:59.999Z') };
        }
        break;
    }
    
    if (startDate && date_range !== 'custom') {
      dateFilter = { $gte: startDate, $lte: now };
    }
  }

  // Apply date filter to query
  if (Object.keys(dateFilter).length > 0) {
    vendorQuery.createdAt = dateFilter;
  }

  console.log('Final vendor query:', JSON.stringify(vendorQuery, null, 2));

  // Get all vendors
  const vendors = await Vendor.find(vendorQuery).lean();
  console.log('Vendors found:', vendors.length);

  if (vendors.length === 0) {
    return res.send({
      success: true,
      data: {
        vendors: [],
        total: 0,
        summary: {
          totalVendors: 0,
          totalProducts: 0,
          totalServices: 0,
          totalOrders: 0,
          totalQuotes: 0,
          totalRevenue: 0
        }
      }
    });
  }

  // Process each vendor with detailed metrics
  const vendorReports = await Promise.all(
    vendors.map(async (vendor) => {
      const vendorId = vendor._id.toString();
      const vendorObjectId = vendor._id;

      // Get products data
      const [totalProducts, rentProducts, sellProducts, activeProducts, approvedProducts] = await Promise.all([
        Product.countDocuments({ vendor_id: vendorId }),
        Product.countDocuments({ vendor_id: vendorId, product_type_name: /rent/i }),
        Product.countDocuments({ vendor_id: vendorId, product_type_name: /sell/i }),
        Product.countDocuments({ vendor_id: vendorId, status: 'active', is_visible: true }),
        Product.countDocuments({ vendor_id: vendorId, approval_status: 'approved' })
      ]);

      // Get services data
      const [totalServices, activeServices, approvedServices] = await Promise.all([
        Service.countDocuments({ vendor_id: vendorId }),
        Service.countDocuments({ vendor_id: vendorId, status: 'active' }),
        Service.countDocuments({ vendor_id: vendorId, approval_status: 'approved' })
      ]);

      // Get orders and calculate revenue
      const orders = await Order.find({ 'items.vendor_id': vendorId }).lean();
      const totalOrders = orders.length;
      const totalOrderRevenue = orders.reduce((sum, order) => {
        const vendorPayment = order.vendor_payments?.find(p => p.vendor_id === vendorId);
        return sum + (vendorPayment?.vendor_amount || 0);
      }, 0);

      // Get quotes and calculate revenue
      const vendorProducts = await Product.find({ vendor_id: vendorId }).select('_id').lean();
      const vendorProductIds = vendorProducts.map(p => p._id);
      const quotes = await GetQuote.find({ 
        product_id: { $in: vendorProductIds },
        status: { $in: ['successful', 'complete', 'delivery'] }
      }).lean();
      const totalQuotes = quotes.length;
      const totalQuoteRevenue = quotes.reduce((sum, quote) => sum + (quote.calculated_price || 0), 0);

      // Get wallet data using ObjectId
      const wallet = await Wallet.findOne({ vendor_id: vendorObjectId }).lean();

      // Get KYC status
      const kycData = await VendorKyc.findOne({ vendor_id: vendorObjectId }).lean();

      return {
        vendor_id: vendorId,
        full_name: vendor.full_name || 'N/A',
        email: vendor.email || 'N/A',
        phone: vendor.number || 'N/A',
        alternate_phone: vendor.alternate_number || 'N/A',
        business_name: vendor.business_name || 'N/A',
        country: vendor.country || 'N/A',
        city_id: vendor.city_id || 'N/A',
        vendor_type: vendor.vendor_type || 'both',
        profile_photo: vendor.profile_photo || null,
        registered_date: vendor.createdAt,
        vendor_kyc_status: kycData?.status || 'Pending',
        is_verified: vendor.isVerified || false,
        products: {
          total: totalProducts,
          rent: rentProducts,
          sell: sellProducts,
          active: activeProducts,
          approved: approvedProducts
        },
        services: {
          total: totalServices,
          active: activeServices,
          approved: approvedServices
        },
        orders: {
          total: totalOrders,
          revenue: totalOrderRevenue
        },
        quotes: {
          total: totalQuotes,
          revenue: totalQuoteRevenue
        },
        revenue: {
          total: totalOrderRevenue + totalQuoteRevenue,
          from_orders: totalOrderRevenue,
          from_quotes: totalQuoteRevenue
        },
        wallet: {
          balance: wallet?.balance || 0,
          total_credited: wallet?.total_credited || 0,
          total_debited: wallet?.total_debited || 0
        }
      };
    })
  );

  // Apply revenue filter
  let filteredVendors = vendorReports;
  if (min_revenue || max_revenue) {
    const min = min_revenue ? parseFloat(min_revenue) : 0;
    const max = max_revenue ? parseFloat(max_revenue) : Infinity;
    filteredVendors = vendorReports.filter(v => {
      const totalRevenue = v.revenue.total;
      return totalRevenue >= min && totalRevenue <= max;
    });
  }

  // Calculate summary
  const summary = {
    totalVendors: filteredVendors.length,
    totalProducts: filteredVendors.reduce((sum, v) => sum + v.products.total, 0),
    totalServices: filteredVendors.reduce((sum, v) => sum + v.services.total, 0),
    totalOrders: filteredVendors.reduce((sum, v) => sum + v.orders.total, 0),
    totalQuotes: filteredVendors.reduce((sum, v) => sum + v.quotes.total, 0),
    totalRevenue: filteredVendors.reduce((sum, v) => sum + v.revenue.total, 0)
  };

  res.send({
    success: true,
    data: {
      vendors: filteredVendors,
      total: filteredVendors.length,
      summary
    }
  });
});

module.exports = {
  getVendorReport
};
