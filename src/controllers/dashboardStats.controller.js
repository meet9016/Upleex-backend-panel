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
    // ─── Determine chart range BEFORE parallel queries ───────────────
    const range = req.query.range || 'monthly';
    let chartStartDate = new Date();
    let groupId = {};
    let sortId = {};

    let chartEndDate = new Date();

    if (range === 'custom' && req.query.startDate && req.query.endDate) {
      chartStartDate = new Date(req.query.startDate);
      chartEndDate = new Date(req.query.endDate);
      chartEndDate.setHours(23, 59, 59, 999);
      // If range > 365 days, group by year; > 60 days group by month; else group by day
      const daysDiff = (chartEndDate.getTime() - chartStartDate.getTime()) / (1000 * 3600 * 24);
      if (daysDiff > 365) {
        groupId = { year: { $year: '$transactions.createdAt' } };
        sortId = { '_id.year': 1 };
      } else if (daysDiff > 60) {
        groupId = {
          year: { $year: '$transactions.createdAt' },
          month: { $month: '$transactions.createdAt' }
        };
        sortId = { '_id.year': 1, '_id.month': 1 };
      } else {
        groupId = {
          year: { $year: '$transactions.createdAt' },
          month: { $month: '$transactions.createdAt' },
          day: { $dayOfMonth: '$transactions.createdAt' }
        };
        sortId = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
      }
    } else if (range === 'weekly') {
      // Weekly: current month from 1st to today, grouped by days
      chartStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
      chartStartDate.setHours(0, 0, 0, 0);
      chartEndDate = new Date();
      chartEndDate.setHours(23, 59, 59, 999);
      groupId = {
        year: { $year: '$transactions.createdAt' },
        month: { $month: '$transactions.createdAt' },
        day: { $dayOfMonth: '$transactions.createdAt' }
      };
      sortId = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
    } else if (range === 'yearly') {
      chartStartDate.setFullYear(chartStartDate.getFullYear() - 4, 0, 1);
      chartStartDate.setHours(0, 0, 0, 0);
      groupId = { year: { $year: '$transactions.createdAt' } };
      sortId = { '_id.year': 1 };
    } else {
      // Monthly: current year from January to current month
      chartStartDate = new Date(now.getFullYear(), 0, 1);
      chartStartDate.setHours(0, 0, 0, 0);
      chartEndDate = new Date();
      chartEndDate.setHours(23, 59, 59, 999);
      groupId = {
        year: { $year: '$transactions.createdAt' },
        month: { $month: '$transactions.createdAt' }
      };
      sortId = { '_id.year': 1, '_id.month': 1 };
    }

    const isCustomYearly = range === 'custom' && sortId['_id.year'] && !sortId['_id.month'];
    const isDaily = range === 'weekly' || (range === 'custom' && sortId['_id.day']);
    const vendorGroupId = isDaily
      ? { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } }
      : (range === 'yearly' || isCustomYearly)
      ? { year: { $year: '$createdAt' } }
      : { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };

    const vendorSortId = isDaily
      ? { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      : (range === 'yearly' || isCustomYearly)
      ? { '_id.year': 1 }
      : { '_id.year': 1, '_id.month': 1 };

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
      revenueStatsData,
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

      // 9. Chart wallet credits
      Wallet.aggregate([
        { $unwind: '$transactions' },
        {
          $match: {
            'transactions.type': 'credit',
            'transactions.status': 'completed',
            'transactions.createdAt': { $gte: chartStartDate, $lte: chartEndDate },
          },
        },
        {
          $group: {
            _id: groupId,
            totalAmount: { $sum: '$transactions.amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: sortId },
      ]),

      // 10. Chart vendor registrations
      VendorKyc.aggregate([
        {
          $match: {
            createdAt: { $gte: chartStartDate, $lte: chartEndDate },
          },
        },
        {
          $group: {
            _id: vendorGroupId,
            count: { $sum: 1 },
          },
        },
        { $sort: vendorSortId },
      ]),

      // 11. Revenue Stats (Weekly, Monthly, Yearly)
      Wallet.aggregate([
        { $unwind: '$transactions' },
        {
          $match: {
            'transactions.type': 'credit',
            'transactions.status': 'completed',
          },
        },
        {
          $facet: {
            weekly: [
              {
                $match: {
                  'transactions.createdAt': {
                    $gte: new Date(new Date().setDate(new Date().getDate() - 7)),
                  },
                },
              },
              { $group: { _id: null, total: { $sum: '$transactions.amount' } } },
            ],
            monthly: [
              {
                $match: {
                  'transactions.createdAt': {
                    $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
                  },
                },
              },
              { $group: { _id: null, total: { $sum: '$transactions.amount' } } },
            ],
            yearly: [
              {
                $match: {
                  'transactions.createdAt': {
                    $gte: new Date(new Date().setFullYear(new Date().getFullYear() - 1)),
                  },
                },
              },
              { $group: { _id: null, total: { $sum: '$transactions.amount' } } },
            ],
          },
        },
      ]),
    ]);

    // ─── Extract aggregation results (handle empty collections) ────
    const v = vendorStats[0] || { total: 0, service: 0, vendor: 0, both: 0, pending: 0, approved: 0, rejected: 0 };
    const p = productStats[0] || { total: 0, sell: 0, rent: 0, pending: 0, approved: 0, rejected: 0 };
    const s = serviceStats[0] || { total: 0, pending: 0, approved: 0, rejected: 0 };
    const w = walletStats[0] || { totalBalance: 0, totalCredited: 0, totalDebited: 0, vendorCount: 0 };

    const rev = revenueStatsData[0] || { weekly: [], monthly: [], yearly: [] };
    const revenueStats = {
      weekly: rev.weekly[0]?.total || 0,
      monthly: rev.monthly[0]?.total || 0,
      yearly: rev.yearly[0]?.total || 0,
    };

    // range is already declared above — reuse it
    const chartCredits = [];
    const chartVendors = [];
    const now = new Date();
    
    if (range === 'weekly') {
      // Weekly: current month from 1st to today, show days
      let iterDate = new Date(chartStartDate);
      while (iterDate <= chartEndDate) {
        const year = iterDate.getFullYear();
        const month = iterDate.getMonth() + 1;
        const day = iterDate.getDate();
        
        const label = iterDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year && m._id.month === month && m._id.day === day);
        chartCredits.push({ label, amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
        
        const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year && m._id.month === month && m._id.day === day);
        chartVendors.push({ label, count: fv ? fv.count : 0 });
        
        iterDate.setDate(iterDate.getDate() + 1);
      }
    } else if (range === 'yearly') {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year);
        chartCredits.push({ label: String(year), amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
        
        const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year);
        chartVendors.push({ label: String(year), count: fv ? fv.count : 0 });
      }
    } else if (range === 'custom') {
      const isCustomYearlyLocal = sortId['_id.year'] && !sortId['_id.month'];
      const isDailyLocal = !!sortId['_id.day'];
      let iterDate = new Date(chartStartDate);
      
      if (isCustomYearlyLocal) {
        // Group by year
        const startYear = chartStartDate.getFullYear();
        const endYear = chartEndDate.getFullYear();
        for (let year = startYear; year <= endYear; year++) {
          const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year);
          chartCredits.push({ label: String(year), amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
          const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year);
          chartVendors.push({ label: String(year), count: fv ? fv.count : 0 });
        }
      } else {
        while (iterDate <= chartEndDate) {
          const year = iterDate.getFullYear();
          const month = iterDate.getMonth() + 1;
          const day = iterDate.getDate();
          
          let label = '';
          if (isDailyLocal) {
            label = iterDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
            const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year && m._id.month === month && m._id.day === day);
            chartCredits.push({ label, amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
            const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year && m._id.month === month && m._id.day === day);
            chartVendors.push({ label, count: fv ? fv.count : 0 });
            iterDate.setDate(iterDate.getDate() + 1);
          } else {
            label = iterDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
            const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year && m._id.month === month);
            chartCredits.push({ label, amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
            const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year && m._id.month === month);
            chartVendors.push({ label, count: fv ? fv.count : 0 });
            iterDate.setMonth(iterDate.getMonth() + 1);
          }
        }
      }
    } else {
      // Monthly: current year from January to current month
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      for (let i = 0; i <= now.getMonth(); i++) {
        const d = new Date(now.getFullYear(), i, 1);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        
        const label = monthNames[d.getMonth()];
        
        const fc = (monthlyWalletCredits || []).find(m => m._id && m._id.year === year && m._id.month === month);
        chartCredits.push({ label, amount: fc ? fc.totalAmount : 0, count: fc ? fc.count : 0 });
        
        const fv = (monthlyVendorStats || []).find(m => m._id && m._id.year === year && m._id.month === month);
        chartVendors.push({ label, count: fv ? fv.count : 0 });
      }
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
        chartCredits,
        chartVendors,
        revenueStats,
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
