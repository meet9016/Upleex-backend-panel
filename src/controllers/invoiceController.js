const PDFDocument = require('pdfkit');
const moment = require('moment');

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

    if (!rawData) {
      console.error('No data provided in request');
      return res.status(400).json({ message: 'Invoice data is required' });
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
    const gstRate = 18;
    const totalGst = (subTotal * gstRate) / (100 + gstRate);
    const subtotalExclGst = subTotal - totalGst;
    
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
    doc.fontSize(20)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(camelVendorProfile?.businessName || '-', 50, currentY);
    
    currentY += 25;

    // Verified Vendor & Status badges
    // doc.fontSize(8)
    //   .font('Helvetica-Bold')
    //   .fillColor('#2563EB')
    //   .text('Verified Vendor', 50, currentY, { width: 80 });
    
    // const statusColor = ['delivered', 'success', 'complete', 'completed'].includes(orderStatus.toLowerCase()) ? '#059669' : '#2563EB';
    // doc.fillColor(statusColor)
    //   .text(orderStatus, 140, currentY, { width: 80 });
    
    currentY += 20;

    // Title (Right)
    doc.fontSize(28)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(isQuote ? 'Quotation' : 'Tax Invoice', 350, 50, { align: 'right', width: 200 });
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text(`${isQuote ? 'Quote' : 'Invoice'} : ${displayId?.slice(-8).toUpperCase()}`, 350, 80, { align: 'right', width: 200 });
    
    doc.text(`Date: ${formattedDate}`, 350, 95, { align: 'right', width: 200 });

    currentY = 130;

    // Info Bars
    const barWidth = 115;
    const barHeight = 35;
    const barGap = 10;
    const bars = [
      { label: 'Place of Supply', value: `${camelVendorProfile?.city || '-'} ${camelVendorProfile?.state || ''}` },
      { label: 'Payment Method', value: paymentMethod },
      { label: 'Customer Payment', value: (data.paymentStatus ? data.paymentStatus.charAt(0).toUpperCase() + data.paymentStatus.slice(1) : 'Pending') }
    ];
    
    if (!req.body.isCustomerView && !isQuote) {
      let adminPaymentStatus = data.paymentStatusInfo?.paymentStatus || data.vendorPaymentInfo?.paymentStatus || 'Pending';
      if (adminPaymentStatus === 'noPayment' || adminPaymentStatus === 'Unprocessed' || !adminPaymentStatus) {
        adminPaymentStatus = 'Pending';
      }
      // Capitalize first letter
      adminPaymentStatus = adminPaymentStatus.charAt(0).toUpperCase() + adminPaymentStatus.slice(1);
      
      bars.push({ label: 'Admin Payout', value: adminPaymentStatus });
    }

    bars.forEach((bar, index) => {
      const x = 50 + index * (barWidth + barGap);
      drawRoundedRect(x, currentY, barWidth, barHeight, 3, '#F9FAFB');
      
      doc.fontSize(7)
        .font('Helvetica-Bold')
        .fillColor('#9CA3AF')
        .text(bar.label, x + 5, currentY + 5, { width: barWidth - 10 });
      
      doc.fontSize(8)
        .font('Helvetica-Bold')
        .fillColor('#374151')
        .text(bar.value, x + 5, currentY + 18, { width: barWidth - 10 });
    });

    currentY += 60;

    // Address Section
    // Seller
    doc.fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#9CA3AF')
      .text('Seller / Sold By', 50, currentY);
    
    currentY += 15;
    
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text(camelVendorProfile?.businessName || '', 50, currentY);
    
    currentY += 15;
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text(camelVendorProfile?.email || '', 50, currentY);
    
    currentY += 12;
    doc.text(`+91 ${camelVendorProfile?.mobile || ''}`, 50, currentY);
    
    currentY += 12;
    doc.text(camelVendorProfile?.address || '', 50, currentY);
    
    currentY += 12;
    doc.text(`${camelVendorProfile?.city || ''}${camelVendorProfile?.city && camelVendorProfile?.state ? ', ' : ''}${camelVendorProfile?.state || ''} - ${camelVendorProfile?.pincode || ''}`, 50, currentY);

    if (camelVendorProfile?.gstNumber) {
      currentY += 15;
      doc.fontSize(7)
        .font('Helvetica-Bold')
        .fillColor('#6B7280')
        .text(`GSTIN: ${camelVendorProfile.gstNumber}`, 50, currentY);
    }

    // Buyer (Right side)
    const buyerX = 350;
    let buyerY = 190;
    
    doc.fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#9CA3AF')
      .text('Buyer / Ship To', buyerX, buyerY, { align: 'right', width: 200 });
    
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
        .fillColor('#6B7280')
        .text(customerEmail, buyerX, buyerY, { align: 'right', width: 200 });
      buyerY += 12;
    }
    
    const customerPhone = customer.phone || customer.mobile || customer.number;
    if (customerPhone) {
      doc.text(`+91 ${customerPhone}`, buyerX, buyerY, { align: 'right', width: 200 });
      buyerY += 12;
    }
    
    if (data.shippingAddress) {
      doc.fontSize(9)
        .fillColor('#3B82F6')
        .text(data.shippingAddress, buyerX, buyerY, { align: 'right', width: 200 });
    }

    currentY = 290;

    // Product Table Header
    drawRoundedRect(50, currentY, 510, 25, 3, '#111827');
    
    const headers = [
      { text: 'Item & Description', x: 55 },
      { text: 'Type', x: 280 },
      { text: 'Unit Price', x: 340 },
      { text: 'Qty', x: 430 },
      { text: 'Net Amount', x: 480 }
    ];

    headers.forEach(header => {
      doc.fontSize(8)
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

      // Alternate row background
      if (index % 2 === 0) {
        drawRoundedRect(50, currentY - 3, 510, 40, 2, '#F9FAFB');
      }

      doc.fontSize(10)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(name || '', 55, currentY, { width: 220 });
      
      doc.fontSize(7)
        .font('Helvetica')
        .fillColor('#9CA3AF')
        .text(`SKU: ${sku}`, 55, currentY + 13, { width: 220 });

      // Type badge
      const typeColor = ['rent', 'rental'].includes(typeLabel.toLowerCase()) ? '#2563EB' : '#059669';
      doc.fillColor(typeColor)
        .fontSize(8)
        .font('Helvetica-Bold')
        .text(typeLabel, 280, currentY + 5, { width: 60 });

      doc.fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#4B5563')
        .text(`Rs. ${Number(price || 0).toLocaleString()}`, 340, currentY + 5, { width: 80, align: 'left' });
      
      doc.text(`${qty}`, 430, currentY + 5, { width: 50, align: 'left' });
      
      doc.fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#111827')
        .text(`Rs. ${Number(rowTotal || 0).toLocaleString()}`, 480, currentY + 5, { width: 80, align: 'left' });

      currentY += 45;
    });

    currentY += 20;

    // Amount in Words
    drawRoundedRect(50, currentY, 320, 50, 5, '#F9FAFB');
    
    doc.fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Amount In Words', 60, currentY + 8);
    
    doc.fontSize(9)
      .font('Helvetica')
      .fillColor('#6B7280')
      .text(numberToWords(subTotal).toLowerCase(), 60, currentY + 22, { width: 300 });

    // Calculation Box (Right)
    const calcX = 390;
    drawRoundedRect(calcX, currentY, 170, 100, 8, '#F9FAFB');
    
    let calcY = currentY + 10;
    
    doc.fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#6B7280')
      .text('Gross Amount', calcX + 10, calcY);
    
    doc.text(`Rs. ${Number(subtotalExclGst).toLocaleString(undefined, {minimumFractionDigits: 2})}`, calcX + 90, calcY, { align: 'right', width: 70 });
    
    calcY += 18;
    doc.text('Tax (IGST 18%)', calcX + 10, calcY);
    doc.text(`Rs. ${Number(totalGst).toLocaleString(undefined, {minimumFractionDigits: 2})}`, calcX + 90, calcY, { align: 'right', width: 70 });
    
    calcY += 18;
    doc.text('Shipping', calcX + 10, calcY);
    doc.text('Rs. 0.00', calcX + 90, calcY, { align: 'right', width: 70 });
    
    calcY += 22;
    doc.fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Total Payable', calcX + 10, calcY);
    
    doc.fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#1D4ED8')
      .text(`Rs. ${Number(subTotal).toLocaleString()}`, calcX + 90, calcY, { align: 'right', width: 70 });

    currentY += 130;

    // Declaration
    doc.fontSize(7)
      .font('Helvetica-Bold')
      .fillColor('#9CA3AF')
      .text('Declaration & Terms', 50, currentY);
    
    currentY += 12;
    
    doc.fontSize(7)
      .font('Helvetica')
      .fillColor('#9CA3AF')
      .text('• This is a valid system-generated document and does not require a physical signature.', 50, currentY, { width: 500 });
    
    currentY += 10;
    doc.text(`• ${isQuote ? 'Quotation is subject to availability of stock at time of booking.' : 'Return/exchange policies apply as per standard vendor terms.'}`, 50, currentY, { width: 500 });

    currentY += 20;

    // Footer
    doc.fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#111827')
      .text('Thank you for shopping', 250, currentY, { align: 'center', width: 100 });
    
    doc.fontSize(6)
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

module.exports = { generateInvoicePDF };
