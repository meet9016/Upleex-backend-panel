const httpStatus = require('http-status');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Product = require('../models/product.model');
const Service = require('../models/service.model');
const Wallet = require('../models/wallet.model');
const GetQuote = require('../models/getQuote.model');
const Contact = require('../models/contact.model');
const Blogs = require('../models/blogs.model');
const ListingPlan = require('../models/listingPlan.model');

const getDashboardStats = async (req, res) => {
  try {
    // ─── Run all aggregations in parallel for performance ───────────
    const [
      vendorStats,
      productStats,
      serviceStats,
      walletStats,
      quoteCount,
      contactCount,
      blogCount,
      planCount,
      monthlyWalletCredits,
      monthlyVendorStats,
    ] = await Promise.all([
      // 1. Vendor stats from VendorKyc
      VendorKyc.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            service: { $sum: { $cond: [{ $eq: ['$vendor_type', 'service'] }, 1, 0] } },
            vendor: { $sum: { $cond: [{ $eq: ['$vendor_type', 'vendor'] }, 1, 0] } },
            both: { $sum: { $cond: [{ $eq: ['$vendor_type', 'both'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
            // Nested breakdown
            serviceApproved: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'service'] }, { $eq: ['$status', 'approved'] }] }, 1, 0] } },
            servicePending: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'service'] }, { $eq: ['$status', 'pending'] }] }, 1, 0] } },
            serviceRejected: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'service'] }, { $eq: ['$status', 'rejected'] }] }, 1, 0] } },
            vendorApproved: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'vendor'] }, { $eq: ['$status', 'approved'] }] }, 1, 0] } },
            vendorPending: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'vendor'] }, { $eq: ['$status', 'pending'] }] }, 1, 0] } },
            vendorRejected: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'vendor'] }, { $eq: ['$status', 'rejected'] }] }, 1, 0] } },
            bothApproved: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'both'] }, { $eq: ['$status', 'approved'] }] }, 1, 0] } },
            bothPending: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'both'] }, { $eq: ['$status', 'pending'] }] }, 1, 0] } },
            bothRejected: { $sum: { $cond: [{ $and: [{ $eq: ['$vendor_type', 'both'] }, { $eq: ['$status', 'rejected'] }] }, 1, 0] } },
          },
        },
      ]),

      // 2. Product stats - count by product_type_name (Sell / Rent) and approval_status
      Product.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            sell: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /sell/i } },
                  1,
                  0,
                ],
              },
            },
            rent: {
              $sum: {
                $cond: [
                  { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /rent/i } },
                  1,
                  0,
                ],
              },
            },
            pending: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'pending'] }, 1, 0] },
            },
            approved: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'approved'] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'rejected'] }, 1, 0] },
            },
            // Nested breakdown - Sell
            sellApproved: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /sell/i } },
                      { $eq: ['$approval_status', 'approved'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            sellPending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /sell/i } },
                      { $eq: ['$approval_status', 'pending'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            sellRejected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /sell/i } },
                      { $eq: ['$approval_status', 'rejected'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            // Nested breakdown - Rent
            rentApproved: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /rent/i } },
                      { $eq: ['$approval_status', 'approved'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            rentPending: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /rent/i } },
                      { $eq: ['$approval_status', 'pending'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            rentRejected: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /rent/i } },
                      { $eq: ['$approval_status', 'rejected'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),

      // 3. Service stats
      Service.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            pending: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'pending'] }, 1, 0] },
            },
            approved: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'approved'] }, 1, 0] },
            },
            rejected: {
              $sum: { $cond: [{ $eq: ['$approval_status', 'rejected'] }, 1, 0] },
            },
          },
        },
      ]),

      // 4. Wallet stats – sum of balance, total_credited, total_debited
      Wallet.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' },
            totalCredited: { $sum: '$total_credited' },
            totalDebited: { $sum: '$total_debited' },
            vendorCount: { $sum: 1 },
          },
        },
      ]),

      // 5-8: Simple counts
      GetQuote.countDocuments(),
      Contact.countDocuments(),
      Blogs.countDocuments(),
      ListingPlan.countDocuments(),

      // 9. Monthly wallet credits for line chart (last 12 months)
      Wallet.aggregate([
        { $unwind: '$transactions' },
        {
          $match: {
            'transactions.type': 'credit',
            'transactions.status': 'completed',
            'transactions.createdAt': {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 11, 1)),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$transactions.createdAt' },
              month: { $month: '$transactions.createdAt' },
            },
            totalAmount: { $sum: '$transactions.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // 10. Monthly vendor registrations for line chart (last 12 months)
      VendorKyc.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(new Date().setMonth(new Date().getMonth() - 11, 1)),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);

    // ─── Extract aggregation results (handle empty collections) ────
    const v = vendorStats[0] || { total: 0, service: 0, vendor: 0, both: 0, pending: 0, approved: 0, rejected: 0 };
    const p = productStats[0] || { total: 0, sell: 0, rent: 0, pending: 0, approved: 0, rejected: 0 };
    const s = serviceStats[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };
    const w = walletStats[0] || { totalBalance: 0, totalCredited: 0, totalDebited: 0, vendorCount: 0 };

    // Build monthly chart data — fill all 12 months (empty months get 0)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const monthlyCredits = [];
    const monthlyVendors = [];

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-indexed

      // Wallet Credits lookup
      const foundCredit = (monthlyWalletCredits || []).find(
        (m) => m._id && m._id.year === year && m._id.month === month
      );
      monthlyCredits.push({
        month: monthNames[d.getMonth()],
        year,
        amount: foundCredit ? foundCredit.totalAmount : 0,
        count: foundCredit ? foundCredit.count : 0,
      });

      // Vendor lookup
      const foundVendor = (monthlyVendorStats || []).find(
        (m) => m._id && m._id.year === year && m._id.month === month
      );
      monthlyVendors.push({
        month: monthNames[d.getMonth()],
        year,
        count: foundVendor ? foundVendor.count : 0,
      });
    }

    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Dashboard stats fetched successfully',
      data: {
        vendors: {
          total: v.total,
          service: v.service,
          vendor: v.vendor,
          both: v.both,
          pending: v.pending,
          approved: v.approved,
          rejected: v.rejected,
          serviceApproved: v.serviceApproved,
          servicePending: v.servicePending,
          serviceRejected: v.serviceRejected,
          vendorApproved: v.vendorApproved,
          vendorPending: v.vendorPending,
          vendorRejected: v.vendorRejected,
          bothApproved: v.bothApproved,
          bothPending: v.bothPending,
          bothRejected: v.bothRejected,
        },
        products: {
          total: p.total,
          sell: p.sell,
          rent: p.rent,
          pending: p.pending,
          approved: p.approved,
          rejected: p.rejected,
          sellApproved: p.sellApproved,
          sellPending: p.sellPending,
          sellRejected: p.sellRejected,
          rentApproved: p.rentApproved,
          rentPending: p.rentPending,
          rentRejected: p.rentRejected,
        },
        services: {
          total: s.total,
          pending: s.pending,
          approved: s.approved,
          rejected: s.rejected,
        },
        wallets: {
          totalBalance: w.totalBalance,
          totalCredited: w.totalCredited,
          totalDebited: w.totalDebited,
          vendorCount: w.vendorCount,
        },
        monthlyCredits,
        monthlyVendors,
        extras: {
          totalQuotes: quoteCount,
          totalContacts: contactCount,
          totalBlogs: blogCount,
          totalPlans: planCount,
        },
      },
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 500,
      success: false,
      message: 'Failed to fetch dashboard stats',
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardStats,
};
