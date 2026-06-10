const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const PriorityPlanPurchase = require('../models/priorityPlanPurchase.model');
const RentalBoostPlanPurchase = require('../models/rentalBoostPlanPurchase.model');
const GeneralPlanPurchase = require('../models/generalPlanPurchase.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const { exportToExcel, exportToPDF } = require('../utils/export.helper');

const getVendorPlansReportData = async (req) => {
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
        if (start_date && end_date) {
          startDate = new Date(start_date);
          query.createdAt = { $gte: startDate, $lte: new Date(end_date + 'T23:59:59.999Z') };
        }
        break;
    }
    if (startDate && date_range !== 'custom') {
      query.createdAt = { $gte: startDate, $lte: new Date() };
    }
  }

  console.log('ListingPlanPurchase:', !!ListingPlanPurchase);
  console.log('PriorityPlanPurchase:', !!PriorityPlanPurchase);
  console.log('RentalBoostPlanPurchase:', !!RentalBoostPlanPurchase);
  console.log('VendorKyc:', !!VendorKyc);

  if (!ListingPlanPurchase) throw new Error('ListingPlanPurchase is undefined');
  if (!PriorityPlanPurchase) throw new Error('PriorityPlanPurchase is undefined');
  if (!RentalBoostPlanPurchase) throw new Error('RentalBoostPlanPurchase is undefined');
  if (!VendorKyc) throw new Error('VendorKyc is undefined');

  const [listingPurchases, priorityPurchases, rentalPurchases, generalPurchases] = await Promise.all([
    ListingPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
    PriorityPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
    RentalBoostPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
    GeneralPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 })
  ]);

  // Fetch all KYC data to get GST numbers
  const vendorKycs = await VendorKyc.find({}).lean();
  const gstMap = {};
  vendorKycs.forEach(kyc => {
    const vendorId = kyc.ContactDetails?.vendor_id || kyc.vendor_id;
    if (vendorId) {
      gstMap[vendorId.toString()] = kyc.Identity?.gst_number || 'N/A';
    }
  });

  const combinedData = [];

  let index = 1;

  listingPurchases.forEach(purchase => {
    const rate = purchase.amount || 0;
    const tax = rate * 0.18;
    const total = rate + tax;

    combinedData.push({
      id: purchase._id ? purchase._id.toString() : `listing-${index}`,
      invoice_no: `UPX-${String(index++).padStart(4, '0')}`,
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-',
      transaction_type: 'Listing Plan',
      description: purchase.plan_type || 'N/A',
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || 'N/A',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || 'N/A' : 'N/A',
      rate: rate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: total
    });
  });

  priorityPurchases.forEach(purchase => {
    const rate = purchase.amount || 0;
    const tax = rate * 0.18;
    const total = rate + tax;

    combinedData.push({
      id: purchase._id ? purchase._id.toString() : `priority-${index}`,
      invoice_no: `UPX-${String(index++).padStart(4, '0')}`,
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-',
      transaction_type: 'Priority Plan',
      description: purchase.plan_name || 'N/A',
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || 'N/A',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || 'N/A' : 'N/A',
      rate: rate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: total
    });
  });

  rentalPurchases.forEach(purchase => {
    const rate = purchase.price || 0;
    const tax = rate * 0.18;
    const total = rate + tax;

    combinedData.push({
      id: purchase._id ? purchase._id.toString() : `rental-${index}`,
      invoice_no: `UPX-${String(index++).padStart(4, '0')}`,
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-',
      transaction_type: 'Rental Boost',
      description: purchase.plan_name || 'N/A',
      vendor_name: purchase.vendor_name || purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || 'N/A',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || 'N/A' : 'N/A',
      rate: rate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: total
    });
  });

  generalPurchases.forEach(purchase => {
    const rate = purchase.amount || 0;
    const tax = rate * 0.18;
    const total = rate + tax;

    combinedData.push({
      id: purchase._id ? purchase._id.toString() : `general-${index}`,
      invoice_no: `UPX-${String(index++).padStart(4, '0')}`,
      date: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : (purchase.created_at ? new Date(purchase.created_at).toLocaleDateString('en-GB') : '-'),
      transaction_type: 'General Plan',
      description: purchase.plan_type || 'N/A',
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || 'N/A',
      gst_number: purchase.vendor_id ? gstMap[purchase.vendor_id._id.toString()] || 'N/A' : 'N/A',
      rate: rate,
      taxable_amount: tax,
      gst_percent: '18%',
      total_amount: total
    });
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

  // Sort by vendor name to group vendor plans together
  combinedData.sort((a, b) => {
    const nameA = a.vendor_name || '';
    const nameB = b.vendor_name || '';
    return nameA.localeCompare(nameB);
  });

  return combinedData;
};

const getVendorPlansReport = catchAsync(async (req, res) => {
  const data = await getVendorPlansReportData(req);
  
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

const exportVendorPlansReportExcel = catchAsync(async (req, res) => {
  const data = await getVendorPlansReportData(req);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Register');

  worksheet.columns = [
    { key: 'invoice_no', width: 15 },
    { key: 'date', width: 15 },
    { key: 'transaction_type', width: 20 },
    { key: 'description', width: 20 },
    { key: 'vendor_name', width: 25 },
    { key: 'business_name', width: 25 },
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

  worksheet.mergeCells('C1:K1');
  const title1 = worksheet.getCell('C1');
  title1.value = 'UPLEEX';
  title1.font = { bold: true, size: 14 };
  title1.alignment = { horizontal: 'center', vertical: 'middle' };
  title1.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('K1').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells('C2:K2');
  const title2 = worksheet.getCell('C2');
  title2.value = '24DFWPG1451M1ZZ';
  title2.font = { bold: true };
  title2.alignment = { horizontal: 'center', vertical: 'middle' };
  title2.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('K2').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const monthNames = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
  const currentMonth = monthNames[new Date().getMonth()];
  const currentYear = new Date().getFullYear();

  worksheet.mergeCells('C3:K3');
  const title3 = worksheet.getCell('C3');
  title3.value = `${currentMonth} ${currentYear} SALES REGISTER`;
  title3.font = { bold: true };
  title3.alignment = { horizontal: 'center', vertical: 'middle' };
  title3.border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  worksheet.getCell('K3').border = { top: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  worksheet.mergeCells('A6:I6');
  const th1 = worksheet.getCell('A6');
  th1.value = 'Taxable sales';
  th1.font = { bold: true };
  th1.alignment = { horizontal: 'center', vertical: 'middle' };
  th1.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };
  
  const th2 = worksheet.getCell('J6');
  th2.value = 'GST Collected';
  th2.font = { bold: true };
  th2.alignment = { horizontal: 'center', vertical: 'middle' };
  th2.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const th3 = worksheet.getCell('K6');
  th3.value = 'Total Revenue';
  th3.font = { bold: true };
  th3.alignment = { horizontal: 'center', vertical: 'middle' };
  th3.border = { top: {style:'thin'}, left: {style:'thin'}, bottom: {style:'thin'}, right: {style:'thin'} };

  const row7 = worksheet.getRow(7);
  row7.values = [
    'Invoice No', 'Date', 'Transaction Type', 'Description', 'Vendor Name', 
    'Business Name', 'GST Number', 'Rate', 'Taxable amount', 
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

  const filename = `UPLEEX_SALES_REGISTER_${currentYear}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  await workbook.xlsx.write(res);
  res.end();
});

const exportVendorPlansReportPDF = catchAsync(async (req, res) => {
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
        if (start_date && end_date) {
          startDate = new Date(start_date);
          query.createdAt = { $gte: startDate, $lte: new Date(end_date + 'T23:59:59.999Z') };
        }
        break;
    }
    if (startDate && date_range !== 'custom') {
      query.createdAt = { $gte: startDate, $lte: new Date() };
    }
  }

  const [listingPurchases, priorityPurchases, rentalPurchases, generalPurchases] = await Promise.all([
    ListingPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
    PriorityPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
    RentalBoostPlanPurchase.find(query).sort({ createdAt: -1 }),
    GeneralPlanPurchase.find(query).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 })
  ]);

  const treeData = [];

  listingPurchases.forEach(purchase => {
    treeData.push({
      vendor_id: purchase.vendor_id,
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || '',
      plan_type: 'Listing Plan',
      plan_name: purchase.plan_type || 'Listing Plan',
      months: purchase.months || 0,
      max_products: purchase.max_products || 0,
      amount: purchase.amount || 0,
      product_ids: purchase.product_ids || [],
      start_at: purchase.start_at,
      expire_at: purchase.expire_at
    });
  });

  priorityPurchases.forEach(purchase => {
    treeData.push({
      vendor_id: purchase.vendor_id,
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || '',
      plan_type: 'Priority Plan',
      plan_name: purchase.plan_name || 'Priority Plan',
      months: purchase.plan_duration === 'yearly' ? 12 : 1,
      max_products: purchase.total_slots || 0,
      amount: purchase.amount || 0,
      product_ids: [],
      start_at: purchase.start_at,
      expire_at: purchase.expire_at
    });
  });

  rentalPurchases.forEach(purchase => {
    treeData.push({
      vendor_id: purchase.vendor_id || purchase._id,
      vendor_name: purchase.vendor_name || 'N/A',
      business_name: '',
      plan_type: 'Rental Boost',
      plan_name: purchase.plan_name || 'Rental Boost',
      days: purchase.days || 0,
      max_products: 1,
      amount: purchase.price || 0,
      product_ids: [],
      start_date: purchase.start_date || purchase.createdAt,
      expiry_date: purchase.expiry_date
    });
  });

  generalPurchases.forEach(purchase => {
    treeData.push({
      vendor_id: purchase.vendor_id,
      vendor_name: purchase.vendor_id?.full_name || 'N/A',
      business_name: purchase.vendor_id?.business_name || '',
      plan_type: 'General Plan',
      plan_name: purchase.plan_type || 'General Plan',
      months: 1,
      max_products: purchase.max_products || 0,
      amount: purchase.amount || 0,
      product_ids: purchase.product_ids || [],
      start_at: purchase.created_at || purchase.createdAt,
      expire_at: purchase.expire_at
    });
  });

  if (search) {
    const searchRegex = new RegExp(search.trim(), 'i');
    const filteredTreeData = treeData.filter(item => 
      searchRegex.test(item.vendor_name) || 
      searchRegex.test(item.business_name) || 
      searchRegex.test(item.plan_name) ||
      searchRegex.test(item.plan_type)
    );
    treeData.length = 0;
    treeData.push(...filteredTreeData);
  }

  treeData.sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));

  const filename = `vendor_plans_report_${new Date().toISOString().split('T')[0]}.pdf`;
  const title = 'Vendor Plans Report';

  const { exportToTreePDF } = require('../utils/exportTreePDF.helper');
  await exportToTreePDF(res, treeData, filename, title);
});

module.exports = {
  getVendorPlansReport,
  exportVendorPlansReportExcel,
  exportVendorPlansReportPDF
};
