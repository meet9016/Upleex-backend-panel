const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ServiceListingPlanPurchase = require('../models/serviceListingPlanPurchase.model');
const ServicePriorityPlanPurchase = require('../models/servicePriorityPlanPurchase.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');

const getServicePlansReportData = async (req) => {
  const { date_range, start_date, end_date, search } = req.query;

  // Build query
  const query = {};

  if (date_range && date_range !== 'all') {
    const now = new Date();
    let startDate;

    switch (date_range) {
      case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
      case 'week': startDate = new Date(); startDate.setDate(now.getDate() - 7); break;
      case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
      case '3months': startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
      case '6months': startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); break;
      case 'year': startDate = new Date(now.getFullYear(), 0, 1); break;
      case 'custom':
        if (start_date || end_date) {
          startDate = start_date ? new Date(start_date) : new Date(0);
          const endDate = end_date ? new Date(end_date + 'T23:59:59.999Z') : new Date();
          query.createdAt = { $gte: startDate, $lte: endDate };
        }
        break;
    }
    if (startDate && date_range !== 'custom') {
      query.createdAt = { $gte: startDate, $lte: new Date() };
    }
  }

  const [listingPurchases, priorityPurchases, vendorKycs] = await Promise.all([
    ServiceListingPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email vendor_type').sort({ createdAt: -1 }),
    ServicePriorityPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email vendor_type').sort({ createdAt: -1 }),
    VendorKyc.find({}).lean(),
  ]);

  const gstMap = {};
  vendorKycs.forEach(kyc => {
    const vendorId = kyc.ContactDetails?.vendor_id || kyc.vendor_id;
    if (vendorId) {
      gstMap[vendorId.toString()] = kyc.Identity?.gst_number || '-';
    }
  });

  const rawCombinedData = [];

  listingPurchases.forEach(purchase => {
    const rate = purchase.amount || 0;
    const tax = rate * 0.18;

    rawCombinedData.push({
      id: purchase._id ? purchase._id.toString() : 'service_listing',
      originalCreatedAt: purchase.createdAt || new Date(),
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-',
      transaction_type: 'Service Listing Plan',
      description: purchase.plan_name || '-',
      vendor_name: purchase.vendor_id?.full_name || '-',
      business_name: purchase.vendor_id?.business_name || '-',
      vendor_type: purchase.vendor_id?.vendor_type || '-',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || '-' : '-',
      rate: rate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: rate + tax
    });
  });

  priorityPurchases.forEach(purchase => {
    const rate = purchase.amount || 0;
    const addon = purchase.addon_amount || 0;
    const totalRate = rate + addon;
    const tax = totalRate * 0.18;

    rawCombinedData.push({
      id: purchase._id ? purchase._id.toString() : 'service_priority',
      originalCreatedAt: purchase.createdAt || new Date(),
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-',
      transaction_type: 'Service Priority Plan',
      description: purchase.plan_name || '-',
      vendor_name: purchase.vendor_id?.full_name || '-',
      business_name: purchase.vendor_id?.business_name || '-',
      vendor_type: purchase.vendor_id?.vendor_type || '-',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || '-' : '-',
      rate: totalRate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: totalRate + tax
    });
  });

  // Sort chronologically ascending to compute invoice numbers
  rawCombinedData.sort((a, b) => new Date(a.originalCreatedAt) - new Date(b.originalCreatedAt));

  // Compute Invoice Numbers
  let seq = 1;
  let combinedData = rawCombinedData.map(item => {
    item.invoice_no = `UPX-SRV-${String(seq++).padStart(4, '0')}`;
    return item;
  });

  // Filter by search if provided
  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    combinedData = combinedData.filter(item => 
      searchRegex.test(item.vendor_name) || 
      searchRegex.test(item.business_name) || 
      searchRegex.test(item.description) ||
      searchRegex.test(item.transaction_type)
    );
  }

  // Sort chronologically descending so newest transactions appear at the top
  combinedData.sort((a, b) => new Date(b.originalCreatedAt) - new Date(a.originalCreatedAt));

  return combinedData;
};

const getServicePlansReport = catchAsync(async (req, res) => {
  const data = await getServicePlansReportData(req);
  
  // Calculate summary
  const totalAmount = data.reduce((sum, item) => sum + item.total_amount, 0);
  const totalTax = data.reduce((sum, item) => sum + item.taxable_amount, 0);

  res.send({
    success: true,
    data: {
      reports: data,
      total: data.length,
      summary: {
        totalAmount,
        totalTax
      }
    }
  });
});

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const exportServicePlansReportExcel = catchAsync(async (req, res) => {
  const data = await getServicePlansReportData(req);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Service Sales Register');

  worksheet.columns = [
    { key: 'invoice_no', width: 20 },
    { key: 'date', width: 15 },
    { key: 'transaction_type', width: 25 },
    { key: 'description', width: 25 },
    { key: 'vendor_name', width: 25 },
    { key: 'business_name', width: 25 },
    { key: 'vendor_type', width: 15 },
    { key: 'gst_number', width: 20 },
    { key: 'rate', width: 15 },
    { key: 'taxable_amount', width: 15 },
    { key: 'gst_percent', width: 10 },
    { key: 'total_amount', width: 15 }
  ];

  worksheet.mergeCells('A1:B5');
  const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');
  if (fs.existsSync(logoPath)) {
    const logoId = workbook.addImage({
      filename: logoPath,
      extension: 'png',
    });
    worksheet.addImage(logoId, {
      tl: { col: 0.1, row: 0.1 },
      ext: { width: 150, height: 100 }
    });
  }

  worksheet.mergeCells('C1:L1');
  const title1 = worksheet.getCell('C1');
  title1.value = 'UPLEEX';
  title1.font = { bold: true, size: 14 };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };
  title1.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('L1').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells('C2:L2');
  const title2 = worksheet.getCell('C2');
  title2.value = '24DFWPG1451M1ZZ';
  title2.font = { bold: true };
  title2.alignment = { horizontal: 'center', vertical: 'middle' };
  title2.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('L2').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const currentMonth = monthNames[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  worksheet.mergeCells('C3:L3');
  const title3 = worksheet.getCell('C3');
  title3.value = `${currentMonth} ${currentYear} SERVICE SALES REGISTER`;
  title3.font = { bold: true };
  title3.alignment = { horizontal: 'center', vertical: 'middle' };
  title3.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('L3').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells('A6:J6');
  const th1 = worksheet.getCell('A6');
  th1.value = 'Taxable sales';
  th1.font = { bold: true };
  th1.alignment = { horizontal: 'center', vertical: 'middle' };
  th1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  
  const th2 = worksheet.getCell('K6');
  th2.value = 'GST Collected';
  th2.font = { bold: true };
  th2.alignment = { horizontal: 'center', vertical: 'middle' };
  th2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const th3 = worksheet.getCell('L6');
  th3.value = 'Total Revenue';
  th3.font = { bold: true };
  th3.alignment = { horizontal: 'center', vertical: 'middle' };
  th3.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const row7 = worksheet.getRow(7);
  row7.values = [
    'Invoice No', 'Date', 'Transaction Type', 'Description', 'Vendor Name', 
    'Business Name', 'Vendor Type', 'GST Number', 'Rate', 'Taxable amount', 
    'GST%', 'Total Amount'
  ];
  row7.font = { bold: true };
  row7.eachCell((cell) => {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  });

  let rowIndex = 8;
  data.forEach(item => {
    const row = worksheet.getRow(rowIndex++);
    row.values = {
      invoice_no: item.invoice_no,
      date: item.date,
      transaction_type: item.transaction_type,
      description: item.description,
      vendor_name: item.vendor_name,
      business_name: item.business_name,
      vendor_type: item.vendor_type ? (item.vendor_type.charAt(0).toUpperCase() + item.vendor_type.slice(1)) : '-',
      gst_number: item.gst_number,
      rate: Number(item.rate).toFixed(2),
      taxable_amount: Number(item.taxable_amount).toFixed(2),
      gst_percent: item.gst_percent,
      total_amount: Number(item.total_amount).toFixed(2)
    };
    
    row.eachCell((cell) => {
      cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
      if(cell._column._key !== 'description' && cell._column._key !== 'vendor_name' && cell._column._key !== 'business_name'){
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else {
        cell.alignment = { vertical: 'middle' };
      }
    });
  });

  let totalRate = 0;
  let totalTaxable = 0;
  let totalAmount = 0;
  data.forEach(item => {
    totalRate += Number(item.rate) || 0;
    totalTaxable += Number(item.taxable_amount) || 0;
    totalAmount += Number(item.total_amount) || 0;
  });

  const totalRow = worksheet.getRow(rowIndex++);
  totalRow.values = {
    gst_number: 'TOTAL:',
    rate: totalRate.toFixed(2),
    taxable_amount: totalTaxable.toFixed(2),
    total_amount: totalAmount.toFixed(2)
  };
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  const filename = `UPLEEX_SERVICE_SALES_REGISTER_${currentYear}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  await workbook.xlsx.write(res);
  res.end();
});

const exportServicePlansReportPDF = catchAsync(async (req, res) => {
  const data = await getServicePlansReportData(req);

  const headers = [
    'Invoice No', 'Date', 'Type', 'Description', 'Vendor Name', 
    'Vendor Type', 'GST Number', 'Rate', 'Taxable', 'GST%', 'Total'
  ];

  const columnWidths = [
    65, // Invoice No
    50, // Date
    60, // Type
    90, // Description
    80, // Vendor Name
    50, // Vendor Type
    60, // GST Number
    40, // Rate
    50, // Taxable
    35, // GST%
    50  // Total
  ];

  const filename = `service_plans_report_${new Date().toISOString().split('T')[0]}.pdf`;
  const title = 'Service Plans Report';

  let totalRate = 0;
  let totalTaxable = 0;
  let totalAmount = 0;

  data.forEach(item => {
    totalRate += Number(item.rate || 0);
    totalTaxable += Number(item.taxable_amount || 0);
    totalAmount += Number(item.total_amount || 0);
  });

  data.push({
    isTotalRow: true,
    gst_number: 'TOTAL:',
    rate: totalRate,
    taxable_amount: totalTaxable,
    total_amount: totalAmount
  });

  const rowMapper = (item) => {
    if (item.isTotalRow) {
      return [
        '', '', '', '', '', '', 'TOTAL:',
        Number(item.rate).toFixed(2),
        Number(item.taxable_amount).toFixed(2),
        '',
        Number(item.total_amount).toFixed(2)
      ];
    }
    return [
      item.invoice_no || '-',
      item.date || '-',
      item.transaction_type || '-',
      item.description || '-',
      item.vendor_name || '-',
      item.vendor_type ? (item.vendor_type.charAt(0).toUpperCase() + item.vendor_type.slice(1)) : '-',
      item.gst_number || '-',
      Number(item.rate || 0).toFixed(2),
      Number(item.taxable_amount || 0).toFixed(2),
      item.gst_percent || '0%',
      Number(item.total_amount || 0).toFixed(2)
    ];
  };

  const { exportToPDF } = require('../utils/export.helper');
  await exportToPDF(res, data, headers, columnWidths, filename, title, rowMapper, { size: 'A4', layout: 'landscape' });
});

module.exports = {
  getServicePlansReport,
  exportServicePlansReportExcel,
  exportServicePlansReportPDF
};
