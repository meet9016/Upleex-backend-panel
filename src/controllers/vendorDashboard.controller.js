const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Order, Product, GetQuote, User } = require('../models');
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
  const orderCountQuery = { 'items.vendor_id': vId };
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
    rentActive, rentInactive
  ] = await Promise.all([
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /sell/i }, is_visible: true }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /sell/i }, is_visible: false }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /rent/i }, is_visible: true }),
    Product.countDocuments({ vendor_id: vId, product_type_name: { $regex: /rent/i }, is_visible: false })
  ]);

  const totalProducts = await Product.countDocuments({ vendor_id: vId });

  // 6. Total Customers (Unique customers who ordered from this vendor)
  const customerQuery = { 'items.vendor_id': vId };
  if (dateFilter) customerQuery.createdAt = dateFilter;
  const uniqueCustomers = await Order.distinct('user_id', customerQuery);
  const totalCustomers = uniqueCustomers.length;

  // 7. Graphs Data (Last 12 months, or specific depending on range? Let's keep 12 months for graph consistency with current year unless chartStartDate is passed)
  const { chartStartDate: cStart, chartEndDate: cEnd } = req.query;
  let chartStart, chartEnd;
  
  if (cStart && cEnd) {
    chartStart = new Date(cStart);
    chartEnd = new Date(cEnd);
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();
  
  const earningsSell = new Array(12).fill(0);
  const earningsRent = new Array(12).fill(0);
  const ordersCount = new Array(12).fill(0);

  // Fetch all orders/quotes for chart independently of global KPI filter if custom chart dates are not provided, we fetch for current year.
  // Wait, if no cStart/cEnd, just fetch for current year.
  const chartOrderQuery = { 'items.vendor_id': vId, payment_status: 'paid' };
  if (chartStart && chartEnd) {
    chartOrderQuery.createdAt = { $gte: chartStart, $lte: chartEnd };
  }
  const chartOrders = await Order.find(chartOrderQuery);

  // Fill sell earnings and order counts
  chartOrders.forEach(order => {
    const date = new Date(order.createdAt);
    // If we have custom chart dates, map them into the 12 months array anyway based on their month
    // If not, only map them if they belong to currentYear
    if ((chartStart && chartEnd) || date.getFullYear() === currentYear) {
      const month = date.getMonth();
      const vendorPay = order.vendor_payments.find(p => p.vendor_id === vId);
      if (vendorPay) {
        earningsSell[month] += vendorPay.vendor_amount || 0;
      }
      ordersCount[month] += 1;
    }
  });

  // Fill rent earnings
  const chartQuoteQuery = { 
    product_id: { $in: vendorProductIds },
    status: 'successful' // Assuming successful means paid/completed
  };
  if (chartStart && chartEnd) {
    chartQuoteQuery.createdAt = { $gte: chartStart, $lte: chartEnd };
  }
  const chartQuotes = await GetQuote.find(chartQuoteQuery);
  
  chartQuotes.forEach(quote => {
    const date = new Date(quote.createdAt);
    if ((chartStart && chartEnd) || date.getFullYear() === currentYear) {
      const month = date.getMonth();
      earningsRent[month] += quote.calculated_price || 0;
    }
  });
  
  // Format graph arrays: replace 0 with null so apexcharts doesn't show a bar.
  const formattedSell = earningsSell.map(val => val > 0 ? val : null);
  const formattedRent = earningsRent.map(val => val > 0 ? val : null);
  const formattedOrders = ordersCount.map(val => val > 0 ? val : null);

  res.send({
    success: true,
    data: {
      metrics: {
        totalSell,
        totalEarnings: 0, // Static as requested
        totalOrders,
        totalItemsSold: 0, // Static as requested
        activeListings,
        rentalOrdersActive: rentalOrdersCount,
        totalProducts,
        sellProducts: sellActive + sellInactive,
        rentProducts: rentActive + rentInactive,
        sellActive,
        sellInactive,
        rentActive,
        rentInactive,
        totalCustomers,
        monthlyTarget: 20000, // Static as requested
      },
      graphs: {
        months,
        earnings: {
          sell: formattedSell,
          rent: formattedRent,
        },
        orders: formattedOrders,
      }
    }
  });
});

module.exports = {
  getDashboardMetrics,
};
