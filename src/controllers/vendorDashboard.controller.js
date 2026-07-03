const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Order, Product, GetQuote, User, Service } = require('../models');
const mongoose = require('mongoose');

/**
 * Get vendor dashboard metrics
 */
const getDashboardMetrics = catchAsync(async (req, res) => {
  const vendorId = req.user.vendor_id || req.user.id; // Adjust based on auth middleware
  const vId = vendorId.toString();
  
  const { range, startDate: customStart, endDate: customEnd } = req.query;

  let startDate, endDate = new Date();
  
  if (range && range !== 'All') {
    if (range === 'This Week') {
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 7);
    } else if (range === 'This Month') {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    } else if (range === 'Last 3 Month') {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 2, 1);
    } else if (range === 'Last 6 Month') {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 5, 1);
    } else if (range === '12 Month') {
      startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    } else if (range === 'Custom Range' && customStart && customEnd) {
      startDate = new Date(customStart);
      endDate = new Date(customEnd);
    }
  }

  const dateFilter = startDate ? { $gte: startDate, $lte: endDate } : undefined;

  // 1. Total Sell (Sum of vendor_amount for this vendor in all orders)
  const orderquery = { 'items.vendor_id': vId, payment_status: 'paid' };
  if (dateFilter) orderquery.createdAt = dateFilter;
  const orders = await Order.find(orderquery);
  
  let totalSell = 0;
  orders.forEach(order => {
    const vendorPay = order.vendor_payments.find(p => p.vendor_id === vId);
    if (vendorPay) {
      totalSell += vendorPay.vendor_amount || 0;
    }
  });

  // 2. Total Orders (Count of orders containing vendor's products)
  const orderCountQuery = { 
    'items.vendor_id': vId,
    $or: [
      { payment_status: { $ne: 'pending' } },
      { payment_method: { $ne: 'razorpay' } }
    ]
  };
  if (dateFilter) orderCountQuery.createdAt = dateFilter;
  const totalOrders = await Order.countDocuments(orderCountQuery);

  // 3. Active Listings (Count of products with status 'active' and is_visible true)
  const activeListings = await Product.countDocuments({ vendor_id: vId, status: 'active', is_visible: true });

  // 4. Rental Orders (Active)
  const vendorProducts = await Product.find({ vendor_id: vId }).select('_id');
  const vendorProductIds = vendorProducts.map(p => p._id);
  
  const rentalQuery = {
    product_id: { $in: vendorProductIds },
    status: { $in: ['delivery', 'complete', 'successful'] }
  };
  if (dateFilter) rentalQuery.createdAt = dateFilter;
  const rentalOrdersCount = await GetQuote.countDocuments(rentalQuery);

  // 5. Total Products breakdown (Sell vs Rent) with visibility sub-counts
  const [
    sellActive, sellInactive,
    rentActive, rentInactive,
    serviceActive, servicePending, serviceRejected
  ] = await Promise.all([
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /sell/i }, is_visible: true }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /sell/i }, is_visible: false }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /rent/i }, is_visible: true }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /rent/i }, is_visible: false }),
    Service.countDocuments({ vendor_id: vId, approval_status: 'approved' }),
    Service.countDocuments({ vendor_id: vId, approval_status: 'pending' }),
    Service.countDocuments({ vendor_id: vId, approval_status: 'rejected' })
  ]);

  const totalProducts = await Product.countDocuments({ vendor_id: vId });

  // 6. Customers (Unique customers: New vs Returning)
  const customerQuery = { 
    'items.vendor_id': vId,
    $or: [
      { payment_status: { $ne: 'pending' } },
      { payment_method: { $ne: 'razorpay' } }
    ]
  };
  if (dateFilter) customerQuery.createdAt = dateFilter;
  
  const customerStats = await Order.aggregate([
    { $match: customerQuery },
    { $group: { _id: '$user_id', orderCount: { $sum: 1 } } }
  ]);
  
  let newCustomers = 0;
  let returningCustomers = 0;
  customerStats.forEach(c => {
    if (c.orderCount > 1) {
      returningCustomers += 1;
    } else {
      newCustomers += 1;
    }
  });
  
  const totalCustomers = newCustomers + returningCustomers;

  // 7. Graphs Data — dynamic range-aware chart
  const { chartRange = 'monthly', chartStartDate: cStart, chartEndDate: cEnd } = req.query;
  
  let chartStart, chartEnd, chartGroupId, chartSortId, isChartDaily = false, isChartYearly = false;
  const now = new Date();
  
  if (chartRange === 'weekly') {
    // Weekly: current month from 1st to today
    chartStart = new Date(now.getFullYear(), now.getMonth(), 1); chartStart.setHours(0, 0, 0, 0);
    chartEnd = new Date(); chartEnd.setHours(23, 59, 59, 999);
    chartGroupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
    chartSortId = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
    isChartDaily = true;
  } else if (chartRange === 'yearly') {
    chartStart = new Date(); chartStart.setFullYear(chartStart.getFullYear() - 4, 0, 1); chartStart.setHours(0, 0, 0, 0);
    chartEnd = new Date(); chartEnd.setHours(23, 59, 59, 999);
    chartGroupId = { year: { $year: '$createdAt' } };
    chartSortId = { '_id.year': 1 };
    isChartYearly = true;
  } else if (chartRange === 'custom' && cStart && cEnd) {
    chartStart = new Date(cStart); chartEnd = new Date(cEnd); chartEnd.setHours(23, 59, 59, 999);
    const daysDiff = (chartEnd - chartStart) / (1000 * 3600 * 24);
    if (daysDiff > 365) {
      chartGroupId = { year: { $year: '$createdAt' } };
      chartSortId = { '_id.year': 1 };
      isChartYearly = true;
    } else if (daysDiff > 60) {
      chartGroupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
      chartSortId = { '_id.year': 1, '_id.month': 1 };
    } else {
      chartGroupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
      chartSortId = { '_id.year': 1, '_id.month': 1, '_id.day': 1 };
      isChartDaily = true;
    }
  } else {
    // Monthly: current year from January to current month
    chartStart = new Date(now.getFullYear(), 0, 1); chartStart.setHours(0, 0, 0, 0);
    chartEnd = new Date(); chartEnd.setHours(23, 59, 59, 999);
    chartGroupId = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
    chartSortId = { '_id.year': 1, '_id.month': 1 };
  }

  const chartDateFilter = { $gte: chartStart, $lte: chartEnd };
  
  // Fetch orders and quotes for chart
  const [chartOrdersRaw, chartQuotesRaw] = await Promise.all([
    Order.aggregate([
      { $match: { 'items.vendor_id': vId, payment_status: 'paid', createdAt: chartDateFilter } },
      { $group: {
        _id: chartGroupId,
        orderCount: { $sum: 1 },
        sellAmount: { $sum: { $reduce: { input: '$vendor_payments', initialValue: 0, in: { $cond: [{ $eq: ['$$this.vendor_id', vId] }, { $add: ['$$value', '$$this.vendor_amount'] }, '$$value'] } } } }
      }},
      { $sort: chartSortId }
    ]),
    GetQuote.aggregate([
      { $match: { product_id: { $in: vendorProductIds }, status: 'successful', createdAt: chartDateFilter } },
      { $group: {
        _id: chartGroupId,
        quoteCount: { $sum: 1 },
        rentAmount: { $sum: { $ifNull: ['$calculated_price', 0] } }
      }},
      { $sort: chartSortId }
    ])
  ]);
  
  // Build label-indexed chart data
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const chartLabels = [];
  const sellData = [], rentData = [], ordersData = [], quotesData = [];
  
  const findOrderBucket = (y, m, d) => chartOrdersRaw.find(o => o._id.year === y && (m === undefined || o._id.month === m) && (d === undefined || o._id.day === d));
  const findQuoteBucket = (y, m, d) => chartQuotesRaw.find(q => q._id.year === y && (m === undefined || q._id.month === m) && (d === undefined || q._id.day === d));
  
  if (isChartYearly) {
    const startY = chartStart.getFullYear(), endY = chartEnd.getFullYear();
    for (let yr = startY; yr <= endY; yr++) {
      chartLabels.push(String(yr));
      const ob = findOrderBucket(yr); const qb = findQuoteBucket(yr);
      sellData.push(ob ? Math.round(ob.sellAmount) : null);
      ordersData.push(ob ? ob.orderCount : null);
      rentData.push(qb ? Math.round(qb.rentAmount) : null);
      quotesData.push(qb ? qb.quoteCount : null);
    }
  } else if (isChartDaily) {
    let d = new Date(chartStart);
    while (d <= chartEnd) {
      const yr = d.getFullYear(), mo = d.getMonth() + 1, dy = d.getDate();
      chartLabels.push(chartRange === 'weekly' ? dayNames[d.getDay()] : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }));
      const ob = findOrderBucket(yr, mo, dy); const qb = findQuoteBucket(yr, mo, dy);
      sellData.push(ob ? Math.round(ob.sellAmount) : null);
      ordersData.push(ob ? ob.orderCount : null);
      rentData.push(qb ? Math.round(qb.rentAmount) : null);
      quotesData.push(qb ? qb.quoteCount : null);
      d.setDate(d.getDate() + 1);
    }
  } else {
    // Monthly iteration — stop at current month
    let d = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
    const endBound = new Date(chartEnd.getFullYear(), chartEnd.getMonth(), 1);
    while (d <= endBound && d <= now) {
      const yr = d.getFullYear(), mo = d.getMonth() + 1;
      const label = monthNames[d.getMonth()] + (yr !== now.getFullYear() ? ` ${yr}` : '');
      chartLabels.push(label);
      const ob = findOrderBucket(yr, mo); const qb = findQuoteBucket(yr, mo);
      sellData.push(ob ? Math.round(ob.sellAmount) : null);
      ordersData.push(ob ? ob.orderCount : null);
      rentData.push(qb ? Math.round(qb.rentAmount) : null);
      quotesData.push(qb ? qb.quoteCount : null);
      d.setMonth(d.getMonth() + 1);
    }
  }

  res.send({
    success: true,
    data: {
      metrics: {
        totalSell,
        totalEarnings: 0,
        totalOrders,
        totalItemsSold: 0,
        activeListings,
        rentalOrdersActive: rentalOrdersCount,
        totalProducts,
        sellProducts: sellActive + sellInactive,
        rentProducts: rentActive + rentInactive,
        sellActive,
        sellInactive,
        rentActive,
        rentInactive,
        serviceActive,
        servicePending,
        serviceRejected,
        totalCustomers,
        newCustomers,
        returningCustomers,
        monthlyTarget: 20000,
      },
      graphs: {
        labels: chartLabels,
        earnings: {
          sell: sellData,
          rent: rentData,
        },
        orders: ordersData,
        quotes: quotesData,
      }
    }
  });
});

module.exports = {
  getDashboardMetrics,
};
