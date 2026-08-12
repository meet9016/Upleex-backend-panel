
const PDFDocument = require('pdfkit');
const moment = require('moment');
const axios = require('axios');
const https = require('https');
const path = require('path');
const fs = require('fs');

/**
 * Convert snake_case to camelCase
 */
const toCamelCase = (str) => {
  return str.replace(/(_\w)/g, (match) => match[1].toUpperCase());
};

/**
 * Normalize _id → id before camelCase conversion so MongoDB IDs map correctly
 */
const normalizeIds = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(normalizeIds);
  } else if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    const result = {};
    for (const key of Object.keys(obj)) {
      const newKey = key === '_id' ? 'id' : key;
      result[newKey] = normalizeIds(obj[key]);
    }
    return result;
  }
  return obj;
};

/**
 * Convert object keys to camelCase recursively
 */
const convertToCamelCase = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(convertToCamelCase);
  } else if (obj !== null && typeof obj === 'object' && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = toCamelCase(key);
      result[camelKey] = convertToCamelCase(obj[key]);
      return result;
    }, {});
  }
  return obj;
};

/**
 * Convert number to Indian currency words
 */
const numberToWords = (num) => {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + inWords(n % 100000) : '');
    return '';
  };

  const amount = Math.floor(num);
  return amount === 0 ? 'Zero' : inWords(amount) + ' Rupees Only';
};

/**
 * Generate Invoice PDF
 */
const generateInvoicePDF = async (req, res) => {
  try {
    const { data: rawData, vendorProfile, type = 'order' } = req.body;
console.log(req.body,'req.body');
    if (!rawData) {
      console.error('No data provided in request');
      return res.status(400).json({ message: 'Invoice data is required' });
    }
    
    if (type === 'plan') {
      return generatePlanInvoicePDF(req, res, rawData, vendorProfile);
    }
    
    // Normalize _id → id, then convert all keys to camelCase
    const camelData = convertToCamelCase(normalizeIds(rawData));
    const camelVendorProfile = vendorProfile ? convertToCamelCase(normalizeIds(vendorProfile)) : {};

    // Normalize data (using camelCase)
    const data = camelData.order || camelData.quote || camelData.data || camelData;
    const isQuote = type === 'quote';
    const displayId = isQuote ? (data.id || data._id) : (data.orderId || data.id || data._id);
    
    const dateStr = data.createdAt;
    const formattedDate = dateStr ? moment(dateStr).format('DD MMMM YYYY') : 'N/A';

    const customer = data.userId || {};
    const items = data.items || (isQuote ? [data] : []);
    const subTotal = isQuote ? (data.totalPrice || data.calculatedPrice || 0) : (data.totalAmount || 0);
    
    const paymentMethod = data.paymentMode || data.paymentMethod || (data.paymentStatus?.toLowerCase() === 'paid' ? 'Online/Prepaid' : 'Pending');
    const totalGst = data.gstAmount || data.gst_amount || (isQuote ? 0 : 0);
    const subtotalExclGst = data.subTotal || data.subtotal || (subTotal - totalGst);
    
    const orderStatus = data.vendorStatus || data.status || 'Pending';

    // Create PDF document
    const doc = new PDFDocument({ 
      size: 'A4', 
      margin: 50 
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${displayId?.slice(-8).toUpperCase()}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Helper functions
    const drawRoundedRect = (x, y, width, height, radius, fillColor) => {
      doc.fillColor(fillColor)
        .roundedRect(x, y, width, height, radius)
        .fill();
    };

    const drawText = (text, x, y, options = {}) => {
      doc.fontSize(options.size || 10)
        .font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
        .fillColor(options.color || '#000000')
        .text(text, x, y, {
          width: options.width,
          align: options.align || 'left'
        });
    };

    let currentY = 50;

    // Header Section
    doc.moveDown(1);
    
    // Business Name (Left)
    doc.fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(camelVendorProfile?.businessName || '-', 50, currentY);
    
    currentY += 24;

    // Title (Right)
    doc.fontSize(22)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(isQuote ? 'Quotation' : 'Tax Invoice', 350, 48, { align: 'right', width: 200 });
    
    doc.fontSize(9.5)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text(`${isQuote ? 'Quote' : 'Invoice'} #: ${displayId?.slice(-8).toUpperCase()}`, 350, 75, { align: 'right', width: 200 });
    
    doc.fontSize(9.5)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text(`Date: ${formattedDate}`, 350, 90, { align: 'right', width: 200 });

    currentY = 120;

    // Info Bars
    const barWidth = 115;
    const barHeight = 38;
    const barGap = 10;
    const bars = [
      { label: 'Place of Supply', value: `${camelVendorProfile?.city || '-'} ${camelVendorProfile?.state || ''}` },
      { label: 'Payment Method', value: paymentMethod },
      { label: 'Customer Payment', value: (data.paymentStatus ? data.paymentStatus.charAt(0).toUpperCase() + data.paymentStatus.slice(1) : 'Pending') }
    ];
    
    if (!req.body.isCustomerView && !isQuote) {
      // Robust extraction of admin payout status
      let adminPaymentStatus = data.paymentStatusInfo?.paymentStatus || 
                              data.vendorPaymentInfo?.paymentStatus || 
                              data.adminPaymentStatus || 
                              'Pending';
                              
      if (adminPaymentStatus === 'noPayment' || adminPaymentStatus === 'Unprocessed' || adminPaymentStatus === 'no_payment' || !adminPaymentStatus) {
        adminPaymentStatus = 'Pending';
      }
      // Capitalize first letter
      adminPaymentStatus = adminPaymentStatus.charAt(0).toUpperCase() + adminPaymentStatus.slice(1);
      
      bars.push({ label: 'Admin Payment', value: adminPaymentStatus });
    }

    bars.forEach((bar, index) => {
      const x = 50 + index * (barWidth + barGap);
      drawRoundedRect(x, currentY, barWidth, barHeight, 4, '#F3F4F6');
      
      doc.fontSize(7.5)
        .font('Helvetica')
        .fillColor('#6B7280')
        .text(bar.label.toUpperCase(), x + 6, currentY + 6, { width: barWidth - 12 });
      
      doc.fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(bar.value, x + 6, currentY + 18, { width: barWidth - 12 });
    });

    currentY += 55;

    // Address Section
    // Seller
    doc.fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor('#6B7280')
      .text('SELLER / SOLD BY', 50, currentY);
    
    currentY += 15;
    
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(camelVendorProfile?.businessName || '', 50, currentY);
    
    currentY += 15;
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text(camelVendorProfile?.email || '', 50, currentY);
    
    currentY += 12;
    doc.text(`+91 ${camelVendorProfile?.mobile || ''}`, 50, currentY);
    
    currentY += 12;
    doc.text(camelVendorProfile?.address || '', 50, currentY);
    
    currentY += 12;
    doc.text(`${camelVendorProfile?.city || ''}${camelVendorProfile?.city && camelVendorProfile?.state ? ', ' : ''}${camelVendorProfile?.state || ''} - ${camelVendorProfile?.pincode || ''}`, 50, currentY);

    if (camelVendorProfile?.gstNumber) {
      currentY += 14;
      doc.fontSize(8.5)
        .font('Helvetica')
        .fillColor('#374151')
        .text(`GSTIN: ${camelVendorProfile.gstNumber}`, 50, currentY);
    }

    // Buyer (Right side)
    const buyerX = 350;
    let buyerY = 175;
    
    doc.fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor('#6B7280')
      .text('BUYER / SHIP TO', buyerX, buyerY, { align: 'right', width: 200 });
    
    buyerY += 15;
    
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(customer.name || customer.fullName || customer.full_name || 'Customer', buyerX, buyerY, { align: 'right', width: 200 });
    
    buyerY += 15;
    
    const customerEmail = customer.email || customer.mail;
    if (customerEmail) {
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#4B5563')
        .text(customerEmail, buyerX, buyerY, { align: 'right', width: 200 });
      buyerY += 12;
    }
    
    const customerPhone = customer.phone || customer.mobile || customer.number;
    if (customerPhone) {
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#4B5563')
        .text(`+91 ${customerPhone}`, buyerX, buyerY, { align: 'right', width: 200 });
      buyerY += 12;
    }
    
    if (data.shippingAddress) {
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#2563EB')
        .text(typeof data.shippingAddress === 'string' ? data.shippingAddress : (data.shippingAddress.addressLine1 || ''), buyerX, buyerY, { align: 'right', width: 200 });
    }

    currentY = 285;

    // Product Table Header
    drawRoundedRect(50, currentY, 500, 26, 4, '#111827');
    
    const headers = [
      { text: 'Item & Description', x: 55 },
      { text: 'HSN', x: 230 },
      { text: 'Type', x: 275 },
      { text: 'Unit Price', x: 325 },
      { text: 'Qty', x: 395 },
      { text: 'Net Amount', x: 445 }
    ];

    headers.forEach(header => {
      doc.fontSize(8.5)
        .font('Helvetica-Bold')
        .fillColor('#FFFFFF')
        .text(header.text, header.x, currentY + 7);
    });

    currentY += 30;

    // Product Items
    items.forEach((item, index) => {
      if (currentY > 700) {
        doc.addPage();
        currentY = 50;
      }

      const product = isQuote ? (item.productId || item.product || {}) : (item.productId || {});
      const name = isQuote ? (product.productName || item.productName) : (product.name || item.productName || item.name);
      const sku = product.sku || item.sku || (isQuote ? item.productSku : null) || 'N/A';
      const typeLabel = product.productTypeName || item.productTypeName || 'Sell';
      const price = isQuote ? (item.price || product.price) : (item.price || product.price);
      const qty = isQuote ? (item.qty) : (item.quantity || 1);
      const rowTotal = isQuote ? (item.totalPrice || item.calculatedPrice) : (item.price * (item.quantity || 1));

      const hsn = item.hsnCode || item.hsn_code || product.hsnCode || product.hsn_code || 'N/A';

      // Alternate row background
      if (index % 2 === 0) {
        drawRoundedRect(50, currentY - 4, 500, 40, 3, '#F9FAFB');
      }

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(name || '', 55, currentY, { width: 170 });
      
      doc.fontSize(8)
        .font('Helvetica')
        .fillColor('#9CA3AF')
        .text(`SKU: ${sku}`, 55, currentY + 14, { width: 170 });

      doc.fontSize(8.5)
        .font('Helvetica')
        .fillColor('#374151')
        .text(hsn, 230, currentY + 4, { width: 40 });

      // Type badge
      const typeColor = ['rent', 'rental'].includes(typeLabel.toLowerCase()) ? '#2563EB' : '#059669';
      doc.fillColor(typeColor)
        .fontSize(8.5)
        .font('Helvetica-Bold')
        .text(typeLabel, 275, currentY + 4, { width: 45 });

      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#374151')
        .text(`Rs. ${Number(price || 0).toLocaleString()}`, 325, currentY + 4, { width: 65, align: 'left' });
      
      doc.fontSize(9)
        .font('Helvetica')
        .fillColor('#111827')
        .text(`${qty}`, 395, currentY + 4, { width: 40, align: 'left' });
      
      doc.fontSize(9.5)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(`Rs. ${Number(rowTotal || 0).toLocaleString()}`, 445, currentY + 4, { width: 80, align: 'left' });

      currentY += 44;
    });

    currentY += 15;

    // Amount in Words
    drawRoundedRect(50, currentY, 300, 48, 6, '#F9FAFB');
    
    doc.fontSize(8.5)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('AMOUNT IN WORDS', 60, currentY + 7);
    
    doc.fontSize(9.5)
      .font('Helvetica')
      .fillColor('#374151')
      .text(numberToWords(subTotal), 60, currentY + 22, { width: 280 });

    // Calculation Box (Right)
    const calcX = 370;
    drawRoundedRect(calcX, currentY, 180, 95, 8, '#F9FAFB');
    
    let calcY = currentY + 8;
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#4B5563')
      .text('Gross Amount', calcX + 10, calcY);
    
    doc.text(`Rs. ${Number(subtotalExclGst).toLocaleString(undefined, {minimumFractionDigits: 2})}`, calcX + 90, calcY, { align: 'right', width: 78 });
    
    calcY += 18;
    doc.text('Tax (GST)', calcX + 10, calcY);
    doc.text(`Rs. ${Number(totalGst).toLocaleString(undefined, {minimumFractionDigits: 2})}`, calcX + 90, calcY, { align: 'right', width: 78 });
    
    calcY += 18;
    doc.text('Shipping', calcX + 10, calcY);
    doc.text('Rs. 0.00', calcX + 90, calcY, { align: 'right', width: 78 });
    
    calcY += 20;
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Total Payable', calcX + 10, calcY);
    
    doc.fontSize(13)
      .font('Helvetica-Bold')
      .fillColor('#1D4ED8')
      .text(`Rs. ${Number(subTotal).toLocaleString()}`, calcX + 90, calcY, { align: 'right', width: 78 });

    currentY += 120;

    // Declaration
    doc.fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#6B7280')
      .text('DECLARATION & TERMS', 50, currentY);
    
    currentY += 12;
    
    doc.fontSize(8)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text('• This is a valid system-generated document and does not require a physical signature.', 50, currentY, { width: 500 });
    
    currentY += 10;
    doc.text(`• ${isQuote ? 'Quotation is subject to availability of stock at time of booking.' : 'Return/exchange policies apply as per standard vendor terms.'}`, 50, currentY, { width: 500 });

    currentY += 20;

    // Footer
    doc.fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Thank you for shopping', 250, currentY, { align: 'center', width: 100 });
    
    doc.fontSize(7.5)
      .font('Helvetica')
      .fillColor('#9CA3AF')
      .text('info@upleex.com', 250, currentY + 12, { align: 'center', width: 100 });

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    console.error('Error stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    }
  }
};

const generatePlanInvoicePDF = async (req, res, rawData, vendorProfile) => {
  try {
    const camelData = convertToCamelCase(normalizeIds(rawData));
    const camelVendorProfile = vendorProfile ? convertToCamelCase(normalizeIds(vendorProfile)) : {};
    console.log(camelData,'camelData');
    console.log(camelVendorProfile,'camelVendorProfile');
    const data = camelData.items || camelData.data || (Array.isArray(camelData) ? camelData : [camelData]); 
    if (!Array.isArray(data) || data.length === 0) throw new Error("No data items");
    
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    const billId = camelData.id || camelData._id || data[0]?.id || data[0]?._id || '000000';
    const billNo = parseInt(String(billId).slice(-6), 16) || Math.floor(Math.random() * 1000000);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${billNo}.pdf`);
    doc.pipe(res);

    if (camelVendorProfile?.businessLogo) {
      try {
        console.log('Fetching logo from:', camelVendorProfile.businessLogo);
        const response = await axios.get(camelVendorProfile.businessLogo, { 
          responseType: 'arraybuffer',
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
          }
        });
        doc.image(response.data, 50, 45, { height: 50 });
        console.log('Logo loaded for PDF successfully');
      } catch (err) {
        console.error('Failed to load logo for PDF:', err.message, err.response?.status);
      }
    }

    try {
      const upleexLogoPath = path.join(__dirname, '../../public/images/logo/logo.png');
      if (fs.existsSync(upleexLogoPath)) {
        doc.image(upleexLogoPath, 400, 40, { height: 80 });
      }
    } catch (err) {
      console.error('Failed to load Upleex local logo for PDF:', err.message);
    }

    doc.font('Helvetica-Bold')
       .fontSize(10)
       .text('|| SHREE GANESHAY NAMAH ||', 0, 50, { align: 'center' });
    
    doc.fontSize(24)
       .text('INVOICE', 0, 65, { align: 'center' });

    const city = camelVendorProfile?.city || 'SURAT';
    const pin = camelVendorProfile?.pincode || '395010';
    const state = camelVendorProfile?.state || 'GUJARAT';
    
    const addressLine = camelVendorProfile?.address ? `${camelVendorProfile.address},\n` : '';
    const fullAddress = `${addressLine}${city}-${pin}, ${state}`.toUpperCase();
    
    doc.font('Helvetica')
       .fontSize(10)
       .text(fullAddress, 0, 95, { align: 'center' });

    let currentY = camelVendorProfile?.address ? 145 : 130;
    
    // Top border
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
    currentY += 10;
    
    // Customer Details
    doc.font('Helvetica-Bold').fontSize(10);
    doc.text(`Customer : ${camelVendorProfile?.businessName || 'VENDOR'}`, 50, currentY);
    doc.text(`Mob.No. : ${camelVendorProfile?.mobile || 'N/A'}`, 50, currentY + 15);
    
    doc.text(`Bill No: ${billNo}`, 400, currentY, { align: 'right', width: 145 });
    doc.text(`Date : ${moment().format('DD/MM/YYYY')}`, 400, currentY + 15, { align: 'right', width: 145 });

    currentY += 35;

    const tableStartY = currentY;
    
    // Bottom border of customer details = top border of table header
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
    currentY += 10;

    // Table Header
    doc.text('No.', 55, currentY);
    doc.text('Description', 90, currentY);
    doc.text('Type', 250, currentY);
    doc.text('Rate', 330, currentY, { width: 60, align: 'right' });
    doc.text('Tax GST', 400, currentY, { width: 60, align: 'right' });
    doc.text('Amount', 475, currentY, { width: 65, align: 'right' });

    currentY += 15;
    const headerBottomY = currentY;
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
    currentY += 10;
    
    doc.font('Helvetica');
    
    let totalAmount = 0;
    
    data.forEach((item, index) => {
      const price = Number(item.price) || 0;
      const total = Number(item.totalPrice) || price;
      const gst = Number(item.gstAmount) || 0;
      const rate = total - gst;
      totalAmount += total;
      
      doc.text(`${index + 1}`, 55, currentY);
      doc.text(item.productName || 'Plan', 90, currentY);
      doc.text(item.productTypeName || 'Type', 250, currentY, { width: 70, align: 'center' });
      doc.text(rate.toFixed(2), 330, currentY, { width: 60, align: 'right' });
      doc.text(gst.toFixed(2), 400, currentY, { width: 60, align: 'right' });
      doc.text(total.toFixed(2), 475, currentY, { width: 65, align: 'right' });
      
      currentY += 20;
      if (index < data.length - 1) {
         doc.moveTo(50, currentY - 5).lineTo(545, currentY - 5).stroke();
      }
    });

    currentY += 5;
    const preTotalY = currentY;
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
    currentY += 10;
    
    doc.font('Helvetica-Bold');
    doc.text('Bill Total Amount :', 200, currentY, { width: 260, align: 'right' });
    doc.text(totalAmount.toFixed(2), 475, currentY, { width: 65, align: 'right' });
    
    currentY += 15;
    const tableEndY = currentY;
    doc.moveTo(50, currentY).lineTo(545, currentY).stroke();
    
    // Draw vertical lines
    doc.moveTo(50, tableStartY).lineTo(50, tableEndY).stroke();
    doc.moveTo(85, tableStartY).lineTo(85, preTotalY).stroke();
    doc.moveTo(250, tableStartY).lineTo(250, preTotalY).stroke();
    doc.moveTo(330, tableStartY).lineTo(330, preTotalY).stroke();
    doc.moveTo(400, tableStartY).lineTo(400, preTotalY).stroke();
    doc.moveTo(470, tableStartY).lineTo(470, tableEndY).stroke();
    doc.moveTo(545, tableStartY).lineTo(545, tableEndY).stroke();

    currentY += 40;
    
    doc.font('Helvetica').fontSize(8);
    doc.text('* Goods Once Sold will not be Refunded.', 50, currentY);
    doc.text('* No Guarantee for Cloth, Colour & Work.', 50, currentY + 12);
    doc.text('SUBJECT TO SURAT JURISDICTION', 50, currentY + 24);
    
    doc.moveTo(400, currentY + 24).lineTo(545, currentY + 24).stroke();
    doc.text('For, UPLEEX', 400, currentY + 30, { width: 145, align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error generating Plan PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate PDF', error: error.message });
    }
  }
};

module.exports = { generateInvoicePDF };
