const catchAsync = require('../utils/catchAsync');
const { Product, Service, Order, GetQuote, Wallet } = require('../models');
const Vendor = require('../models/vendor/vendor.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');

/**
 * Export vendor report to Excel
 */
const exportVendorReportExcel = catchAsync(async (req, res) => {
  const { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue } = req.query;

  console.log('=== EXPORT EXCEL REQUEST ===');
  console.log('Query params:', { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue });

  const vendorQuery = {};
  
  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    vendorQuery.$or = [
      { full_name: searchRegex },
      { email: searchRegex },
      { business_name: searchRegex },
      { number: searchRegex }
    ];
  }
  
  if (vendor_type) {
    vendorQuery.vendor_type = vendor_type.toLowerCase();
    console.log('Applying vendor_type filter:', vendor_type.toLowerCase());
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

  if (Object.keys(dateFilter).length > 0) {
    vendorQuery.createdAt = dateFilter;
  }

  console.log('Export query:', JSON.stringify(vendorQuery, null, 2));

  const vendors = await Vendor.find(vendorQuery).lean();
  console.log('Vendors found from database:', vendors.length);
  
  if (vendors.length === 0) {
    console.log('No vendors found with query:', vendorQuery);
  }

  const vendorReports = await Promise.all(
    vendors.map(async (vendor) => {
      const vendorId = vendor._id.toString();
      const vendorObjectId = vendor._id;

      const [totalProducts, rentProducts, sellProducts, totalServices, activeServices] = await Promise.all([
        Product.countDocuments({ vendor_id: vendorId }),
        Product.countDocuments({ vendor_id: vendorId, listing_type: 'rent' }),
        Product.countDocuments({ vendor_id: vendorId, listing_type: 'sell' }),
        Service.countDocuments({ vendor_id: vendorId }),
        Service.countDocuments({ vendor_id: vendorId, status: 'active' })
      ]);

      const orders = await Order.find({ 'items.vendor_id': vendorId }).lean();
      const totalOrders = orders.length;
      const totalOrderRevenue = orders.reduce((sum, order) => {
        const vendorPayment = order.vendor_payments?.find(p => p.vendor_id === vendorId);
        return sum + (vendorPayment?.vendor_amount || 0);
      }, 0);

      const vendorProducts = await Product.find({ vendor_id: vendorId }).select('_id').lean();
      const vendorProductIds = vendorProducts.map(p => p._id);
      const quotes = await GetQuote.find({ 
        product_id: { $in: vendorProductIds },
        status: { $in: ['successful', 'complete', 'delivery'] }
      }).lean();
      const totalQuotes = quotes.length;
      const totalQuoteRevenue = quotes.reduce((sum, quote) => sum + (quote.calculated_price || 0), 0);

      const wallet = await Wallet.findOne({ vendor_id: vendorObjectId }).lean();

      return {
        full_name: vendor.full_name || 'N/A',
        email: vendor.email || 'N/A',
        phone: vendor.number || 'N/A',
        business_name: vendor.business_name || 'N/A',
        vendor_type: vendor.vendor_type || 'both',
        total_products: totalProducts,
        rent_products: rentProducts,
        sell_products: sellProducts,
        total_services: totalServices,
        active_services: activeServices,
        total_orders: totalOrders,
        order_revenue: totalOrderRevenue,
        total_quotes: totalQuotes,
        quote_revenue: totalQuoteRevenue,
        total_revenue: totalOrderRevenue + totalQuoteRevenue,
        wallet_balance: wallet?.balance || 0,
        registered_date: vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString('en-GB') : 'N/A'
      };
    })
  );

  // Apply revenue filter
  let filteredVendors = vendorReports;
  if (min_revenue || max_revenue) {
    const min = min_revenue ? parseFloat(min_revenue) : 0;
    const max = max_revenue ? parseFloat(max_revenue) : Infinity;
    filteredVendors = vendorReports.filter(v => {
      const totalRevenue = v.total_revenue;
      return totalRevenue >= min && totalRevenue <= max;
    });
  }

  console.log('Total vendors to export:', filteredVendors.length);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Vendor Reports');

  worksheet.columns = [
    { header: 'Vendor Name', key: 'full_name', width: 25 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Business Name', key: 'business_name', width: 25 },
    { header: 'Type', key: 'vendor_type', width: 12 },
    { header: 'Total Products', key: 'total_products', width: 15 },
    { header: 'Rent Products', key: 'rent_products', width: 15 },
    { header: 'Sell Products', key: 'sell_products', width: 15 },
    { header: 'Services', key: 'total_services', width: 12 },
    { header: 'Orders', key: 'total_orders', width: 12 },
    { header: 'Order Revenue', key: 'order_revenue', width: 15 },
    { header: 'Quotes', key: 'total_quotes', width: 12 },
    { header: 'Quote Revenue', key: 'quote_revenue', width: 15 },
    { header: 'Total Revenue', key: 'total_revenue', width: 15 },
    { header: 'Wallet Balance', key: 'wallet_balance', width: 15 },
    { header: 'Registered Date', key: 'registered_date', width: 15 }
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 25;

  // Add data rows - ALL vendors (including those with 0 data)
  filteredVendors.forEach((report, index) => {
    const row = worksheet.addRow(report);
    row.alignment = { vertical: 'middle', wrapText: true };
    
    // Alternate row colors
    if ((index + 1) % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    }
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=vendor-report-${Date.now()}.xlsx`);

  await workbook.xlsx.write(res);
  res.end();
});

/**
 * Export vendor report to PDF
 */
const exportVendorReportPDF = catchAsync(async (req, res) => {
  const { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue } = req.query;

  console.log('=== EXPORT PDF REQUEST ===');
  console.log('Query params:', { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue });

  const vendorQuery = {};
  
  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    vendorQuery.$or = [
      { full_name: searchRegex },
      { email: searchRegex },
      { business_name: searchRegex },
      { number: searchRegex }
    ];
  }
  
  if (vendor_type) {
    vendorQuery.vendor_type = vendor_type.toLowerCase();
    console.log('Applying vendor_type filter:', vendor_type.toLowerCase());
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

  if (Object.keys(dateFilter).length > 0) {
    vendorQuery.createdAt = dateFilter;
  }

  console.log('Export query:', JSON.stringify(vendorQuery, null, 2));

  const vendors = await Vendor.find(vendorQuery).lean();
  console.log('Vendors found from database:', vendors.length);
  
  if (vendors.length === 0) {
    console.log('No vendors found with query:', vendorQuery);
  }

  const vendorReports = await Promise.all(
    vendors.map(async (vendor) => {
      const vendorId = vendor._id.toString();
      const vendorObjectId = vendor._id;

      const [totalProducts, rentProducts, sellProducts, totalServices, totalOrders] = await Promise.all([
        Product.countDocuments({ vendor_id: vendorId }),
        Product.countDocuments({ vendor_id: vendorId, listing_type: 'rent' }),
        Product.countDocuments({ vendor_id: vendorId, listing_type: 'sell' }),
        Service.countDocuments({ vendor_id: vendorId }),
        Order.countDocuments({ 'items.vendor_id': vendorId })
      ]);

      const orders = await Order.find({ 'items.vendor_id': vendorId }).lean();
      const totalOrderRevenue = orders.reduce((sum, order) => {
        const vendorPayment = order.vendor_payments?.find(p => p.vendor_id === vendorId);
        return sum + (vendorPayment?.vendor_amount || 0);
      }, 0);

      const vendorProducts = await Product.find({ vendor_id: vendorId }).select('_id').lean();
      const vendorProductIds = vendorProducts.map(p => p._id);
      const quotes = await GetQuote.find({ 
        product_id: { $in: vendorProductIds },
        status: { $in: ['successful', 'complete', 'delivery'] }
      }).lean();
      const totalQuotes = quotes.length;
      const totalQuoteRevenue = quotes.reduce((sum, quote) => sum + (quote.calculated_price || 0), 0);

      const wallet = await Wallet.findOne({ vendor_id: vendorObjectId }).lean();

      return {
        full_name: vendor.full_name || 'N/A',
        business_name: vendor.business_name || 'N/A',
        vendor_type: vendor.vendor_type || 'both',
        total_products: totalProducts,
        rent_products: rentProducts,
        sell_products: sellProducts,
        total_services: totalServices,
        total_orders: totalOrders,
        order_revenue: totalOrderRevenue,
        total_quotes: totalQuotes,
        quote_revenue: totalQuoteRevenue,
        total_revenue: totalOrderRevenue + totalQuoteRevenue,
        wallet_balance: wallet?.balance || 0
      };
    })
  );

  // Apply revenue filter
  let filteredVendors = vendorReports;
  if (min_revenue || max_revenue) {
    const min = min_revenue ? parseFloat(min_revenue) : 0;
    const max = max_revenue ? parseFloat(max_revenue) : Infinity;
    filteredVendors = vendorReports.filter(v => {
      const totalRevenue = v.total_revenue;
      return totalRevenue >= min && totalRevenue <= max;
    });
  }

  console.log('Total vendors to export:', filteredVendors.length);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=vendor-report-${Date.now()}.pdf`);
  
  doc.pipe(res);

  // Title
  doc.fontSize(22).font('Helvetica-Bold').text('Vendor Reports', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(11).font('Helvetica').text(`Generated on: ${new Date().toLocaleString('en-GB')}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').text(`Total Vendors: ${filteredVendors.length}`, { align: 'center' });
  doc.moveDown(1);

  // Table configuration
  const tableTop = doc.y;
  const tableLeft = 30;
  const colWidths = [80, 80, 50, 50, 50, 50, 50, 55, 55, 55, 60, 80];
  const headers = ['Vendor', 'Business', 'Type', 'Products', 'Rent', 'Sell', 'Services', 'Orders', 'Quotes', 'Revenue', 'Wallet', 'Registered'];
  const rowHeight = 20;
  const headerHeight = 25;

  // Draw header background
  doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), headerHeight)
     .fillAndStroke('#4472C4', '#4472C4');

  // Draw header text
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
  let xPos = tableLeft;
  headers.forEach((header, i) => {
    doc.text(header, xPos + 2, tableTop + 6, { width: colWidths[i] - 4, align: 'center' });
    xPos += colWidths[i];
  });

  // Draw header border
  doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), headerHeight).stroke();

  // Draw data rows - ALL vendors (including those with 0 data)
  doc.fillColor('#000000');
  let yPos = tableTop + headerHeight;

  filteredVendors.forEach((report, index) => {
    // Check if we need a new page
    if (yPos + rowHeight > 540) {
      doc.addPage();
      yPos = 50;
      
      // Redraw header on new page
      doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), headerHeight)
         .fillAndStroke('#4472C4', '#4472C4');
      
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#FFFFFF');
      xPos = tableLeft;
      headers.forEach((header, i) => {
        doc.text(header, xPos + 2, yPos + 6, { width: colWidths[i] - 4, align: 'center' });
        xPos += colWidths[i];
      });
      
      doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), headerHeight).stroke();
      doc.fillColor('#000000');
      yPos += headerHeight;
    }

    // Alternate row background
    if (index % 2 === 1) {
      doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), rowHeight)
         .fillAndStroke('#F2F2F2', '#F2F2F2');
      doc.fillColor('#000000');
    }

    // Draw row border
    doc.rect(tableLeft, yPos, colWidths.reduce((a, b) => a + b, 0), rowHeight).stroke();

    // Draw row data
    doc.fontSize(8).font('Helvetica');
    xPos = tableLeft;
    
    const rowData = [
      report.full_name.substring(0, 20),
      report.business_name.substring(0, 20),
      report.vendor_type.charAt(0).toUpperCase() + report.vendor_type.slice(1),
      report.total_products.toString(),
      report.rent_products.toString(),
      report.sell_products.toString(),
      report.total_services.toString(),
      report.total_orders.toString(),
      report.total_quotes.toString(),
      `₹${report.total_revenue.toLocaleString('en-IN')}`,
      `₹${report.wallet_balance.toLocaleString('en-IN')}`,
      new Date().toLocaleDateString('en-GB')
    ];

    rowData.forEach((data, i) => {
      const align = i >= 3 && i <= 8 ? 'center' : (i >= 9 ? 'right' : 'left');
      doc.text(data, xPos + 2, yPos + 4, { width: colWidths[i] - 4, align: align });
      xPos += colWidths[i];
    });

    yPos += rowHeight;
  });

  // Draw table border around all
  doc.rect(tableLeft, tableTop, colWidths.reduce((a, b) => a + b, 0), yPos - tableTop).stroke();

  doc.end();
});

module.exports = {
  exportVendorReportExcel,
  exportVendorReportPDF
};
