const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const truncateText = (text, maxLength = 30) => {
  const str = String(text || '');
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

/**
 * Tree-like PDF export function with vendor grouping
 * @param {Object} res - Express response object
 * @param {Array} data - Data to export
 * @param {String} filename - Output filename
 * @param {String} title - Report title
 */
const exportToTreePDF = (res, data, filename, title) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('exportToTreePDF called with data length:', data.length);
      
      if (!data || data.length === 0) {
        console.log('No data to export');
        res.status(404).json({ success: false, message: 'No data found to export' });
        return resolve();
      }
      
      // Debug log first 2 items
      console.log('First item keys:', Object.keys(data[0]));
      if (data.length > 1) {
        console.log('Second item keys:', Object.keys(data[1]));
      }

      // Group data by vendor
      const vendorMap = {};
      data.forEach((item, index) => {
        let vendorId;
        
        if (item.vendor_id) {
          if (typeof item.vendor_id === 'object' && item.vendor_id._id) {
            vendorId = String(item.vendor_id._id);
          } else if (typeof item.vendor_id === 'object' && item.vendor_id.toString) {
            vendorId = String(item.vendor_id);
          } else {
            vendorId = String(item.vendor_id);
          }
        } else {
          vendorId = String(item._id || 'unknown-' + index);
        }
        
        if (!vendorMap[vendorId]) {
          let vendorName = 'Unknown';
          let businessName = '';
          
          if (item.vendor_id && typeof item.vendor_id === 'object') {
            vendorName = item.vendor_id.full_name || item.vendor_name || vendorName;
            businessName = item.vendor_id.business_name || item.business_name || '';
          } else {
            vendorName = item.vendor_name || vendorName;
            businessName = item.business_name || '';
          }
          
          vendorMap[vendorId] = {
            vendor_name: vendorName,
            business_name: businessName,
            items: []
          };
        }
        vendorMap[vendorId].items.push(item);
      });

      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        layout: 'landscape'
      });
      
      const brandColor = '#4A90E2';
      const vendorColor = '#1E3A5F';
      const planColor = '#4A90E2';
      const lightGray = '#F8F9FA';
      const borderColor = '#E5E7EB';
      
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');
      const pageWidth = doc.page.width - 60;
      
      // --- Column Positions ---
      const col1X = 30;       // Vendor/Plan
      const col2X = 250;      // Months
      const col3X = 350;      // Max Products
      const col4X = 480;      // Amount
      const col5X = 580;      // Products Count
      const col6X = 700;      // Start
      const col7X = 820;      // Expire

      // Function to draw header
      const drawHeader = () => {
        doc.rect(0, 0, doc.page.width, 8).fill(brandColor);

        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 30, 20, { width: 80 });
          } catch (imgErr) {
            doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
          }
        } else {
          doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
        }

        doc.fillColor('#333333').fontSize(18).font('Helvetica-Bold').text(title, 30, 25, { align: 'right' });
        doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 30, 55, { align: 'right' });

        // Divider
        doc.moveTo(30, 85).lineTo(doc.page.width - 30, 85).strokeColor(borderColor).lineWidth(1).stroke();

        // Table Header
        const tableY = 110;
        doc.rect(30, tableY, pageWidth, 35).fill('#E3F2FD');
        doc.fillColor(vendorColor).fontSize(10).font('Helvetica-Bold');
        
        doc.text('Vendor / Plan / Product', col1X + 10, tableY + 12);
        doc.text('Months', col2X, tableY + 12, { width: 80, align: 'center' });
        doc.text('Max Products', col3X, tableY + 12, { width: 100, align: 'center' });
        doc.text('Amount', col4X, tableY + 12, { width: 80, align: 'right' });
        doc.text('Products', col5X, tableY + 12, { width: 100, align: 'center' });
        doc.text('Start Date', col6X, tableY + 12, { width: 100, align: 'center' });
        doc.text('Expire Date', col7X, tableY + 12, { width: 100, align: 'center' });

        return tableY + 35;
      };

      // Error handling
      doc.on('error', (err) => reject(err));
      res.on('error', (err) => reject(err));
      res.on('finish', () => resolve());

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      doc.pipe(res);

      let yPosition = drawHeader(); // Start after header
      
      // --- Draw rows for each vendor and their items ---
      Object.values(vendorMap).forEach((vendorData, vendorIndex) => {
        const vendorRowHeight = 40;
        const planRowHeight = 30;

        // Check page break only before vendor row if needed
        if (yPosition + vendorRowHeight > 520) {
          doc.addPage();
          yPosition = drawHeader();
        }

        // --- Vendor Row ---
        doc.save();
        doc.rect(30, yPosition, pageWidth, vendorRowHeight).fill('#F0F4FF');
        doc.restore();
        
        // Draw vendor circle icon
        doc.save();
        doc.circle(col1X + 20, yPosition + vendorRowHeight/2, 14).fill(vendorColor);
        doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
        const vendorNameStr = String(vendorData.vendor_name || 'V');
        const initials = vendorNameStr.charAt(0).toUpperCase();
        doc.text(initials, col1X + 12, yPosition + vendorRowHeight/2 - 4, { width: 16, align: 'center' });
        doc.restore();

        // Vendor name and business name in same cell
        doc.fillColor(vendorColor).fontSize(11).font('Helvetica-Bold');
        doc.text(truncateText(vendorData.vendor_name, 20), col1X + 40, yPosition + 10);
        
        if (vendorData.business_name) {
          doc.fillColor('#6B7280').fontSize(9).font('Helvetica');
          doc.text(truncateText(vendorData.business_name, 25), col1X + 40, yPosition + 24);
        }

        yPosition += vendorRowHeight;

        // --- Plan Rows ---
        vendorData.items.forEach((item, itemIndex) => {
          // Check page break before each plan
          if (yPosition + planRowHeight > 550) {
            doc.addPage();
            yPosition = drawHeader();
          }
          
          // Alternate row background
          if (itemIndex % 2 === 0) {
            doc.save();
            doc.rect(30, yPosition, pageWidth, planRowHeight).fill('#FAFBFC');
            doc.restore();
          }
          
          // Draw plan circle icon
          doc.save();
          doc.circle(col1X + 45, yPosition + planRowHeight/2, 10).fill(planColor);
          doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
          const planInitial = (item.plan_type || item.plan_name || 'P').charAt(0).toUpperCase();
          doc.text(planInitial, col1X + 40, yPosition + planRowHeight/2 - 3, { width: 10, align: 'center' });
          doc.restore();

          // Plan details - show both type and name
          doc.fillColor('#374151').fontSize(10).font('Helvetica');
          
          let planDisplay = '';
          if (item.plan_type && item.plan_name && item.plan_type !== item.plan_name) {
            planDisplay = `${item.plan_type} - ${item.plan_name}`;
          } else if (item.plan_type) {
            planDisplay = item.plan_type;
          } else {
            planDisplay = item.plan_name || 'Unknown Plan';
          }
          doc.text(truncateText(planDisplay, 25), col1X + 62, yPosition + 10);
          
          doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica');
          doc.text('Plan Details', col1X + 62, yPosition + 20);

          // Months
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          const months = item.months || item.days || '-';
          doc.text(String(months), col2X, yPosition + 11, { width: 80, align: 'center' });

          // Max Products
          const maxProducts = item.max_products || item.total_slots || item.days || '-';
          doc.text(String(maxProducts), col3X, yPosition + 11, { width: 100, align: 'center' });

          // Amount
          const amount = item.amount || item.price || 0;
          doc.fillColor(planColor).fontSize(10).font('Helvetica-Bold');
          doc.text(`${Number(amount).toFixed(2)}`, col4X, yPosition + 11, { width: 80, align: 'right' });

          // Products count
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          const productsCount = item.product_ids?.length || 0;
          doc.text(String(productsCount), col5X, yPosition + 11, { width: 100, align: 'center' });

          // Start Date
          const startDate = item.start_at || item.start_date || item.startDate;
          const startStr = startDate ? new Date(startDate).toLocaleDateString('en-GB') : '-';
          doc.text(startStr, col6X, yPosition + 11, { width: 100, align: 'center' });

          // Expire Date
          const expireDate = item.expire_at || item.expiry_date || item.expireDate;
          const expireStr = expireDate ? new Date(expireDate).toLocaleDateString('en-GB') : '-';
          doc.text(expireStr, col7X, yPosition + 11, { width: 100, align: 'center' });

          // Bottom border
          doc.save();
          doc.moveTo(30, yPosition + planRowHeight).lineTo(30 + pageWidth, yPosition + planRowHeight).strokeColor(borderColor).lineWidth(0.5).stroke();
          doc.restore();

          yPosition += planRowHeight;
        });
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const exportOrdersToTreePDF = (res, data, filename, title) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('exportOrdersToTreePDF called with data length:', data.length);
      
      if (!data || data.length === 0) {
        console.log('No data to export');
        res.status(404).json({ success: false, message: 'No data found to export' });
        return resolve();
      }
      
      // Debug log first 2 items
      console.log('First item keys:', Object.keys(data[0]));
      if (data.length > 1) {
        console.log('Second item keys:', Object.keys(data[1]));
      }

      // Group data by customer
      const customerMap = {};
      data.forEach((item, index) => {
        let customerId;
        
        if (item.user_id) {
          if (typeof item.user_id === 'object' && item.user_id._id) {
            customerId = String(item.user_id._id);
          } else if (typeof item.user_id === 'object' && item.user_id.toString) {
            customerId = String(item.user_id);
          } else {
            customerId = String(item.user_id);
          }
        } else {
          customerId = String(item._id || 'unknown-' + index);
        }
        
        if (!customerMap[customerId]) {
          let customerName = 'Unknown';
          let customerEmail = '';
          
          if (item.user_id && typeof item.user_id === 'object') {
            customerName = item.user_id.name || 'Unknown Customer';
            customerEmail = item.user_id.email || '';
          }
          
          customerMap[customerId] = {
            customer_name: customerName,
            customer_email: customerEmail,
            items: []
          };
        }
        customerMap[customerId].items.push(item);
      });

      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        layout: 'landscape'
      });
      
      const brandColor = '#4A90E2';
      const customerColor = '#1E3A5F';
      const orderColor = '#4A90E2';
      const lightGray = '#F8F9FA';
      const borderColor = '#E5E7EB';
      
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');
      const pageWidth = doc.page.width - 60;
      
      // --- Column Positions ---
      const col1X = 30;       // Customer/Order
      const col2X = 250;      // Items
      const col3X = 350;      // Products
      const col4X = 500;      // Amount
      const col5X = 620;      // Order Status
      const col6X = 750;      // Payment Status
      const col7X = 870;      // Date

      // Function to draw header
      const drawHeader = () => {
        doc.rect(0, 0, doc.page.width, 8).fill(brandColor);

        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 30, 20, { width: 80 });
          } catch (imgErr) {
            doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
          }
        } else {
          doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
        }

        doc.fillColor('#333333').fontSize(18).font('Helvetica-Bold').text(title, 30, 25, { align: 'right' });
        doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 30, 55, { align: 'right' });

        // Divider
        doc.moveTo(30, 85).lineTo(doc.page.width - 30, 85).strokeColor(borderColor).lineWidth(1).stroke();

        // Table Header
        const tableY = 110;
        doc.rect(30, tableY, pageWidth, 35).fill('#E3F2FD');
        doc.fillColor(customerColor).fontSize(10).font('Helvetica-Bold');
        
        doc.text('Customer / Order', col1X + 10, tableY + 12);
        doc.text('Items', col2X, tableY + 12, { width: 80, align: 'center' });
        doc.text('Products', col3X, tableY + 12, { width: 130, align: 'center' });
        doc.text('Amount', col4X, tableY + 12, { width: 100, align: 'right' });
        doc.text('Order Status', col5X, tableY + 12, { width: 110, align: 'center' });
        doc.text('Payment Status', col6X, tableY + 12, { width: 100, align: 'center' });
        doc.text('Date', col7X, tableY + 12, { width: 100, align: 'center' });

        return tableY + 35;
      };

      // Error handling
      doc.on('error', (err) => reject(err));
      res.on('error', (err) => reject(err));
      res.on('finish', () => resolve());

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      doc.pipe(res);

      let yPosition = drawHeader(); // Start after header
      
      // --- Draw rows for each customer and their orders ---
      Object.values(customerMap).forEach((customerData, customerIndex) => {
        const customerRowHeight = 40;
        const orderRowHeight = 30;

        // Check page break only before customer row if needed
        if (yPosition + customerRowHeight > 520) {
          doc.addPage();
          yPosition = drawHeader();
        }

        // --- Customer Row ---
        doc.save();
        doc.rect(30, yPosition, pageWidth, customerRowHeight).fill('#F0F4FF');
        doc.restore();
        
        // Draw customer circle icon
        doc.save();
        doc.circle(col1X + 20, yPosition + customerRowHeight/2, 14).fill(customerColor);
        doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
        const initials = (customerData.customer_name || 'C').charAt(0).toUpperCase();
        doc.text(initials, col1X + 12, yPosition + customerRowHeight/2 - 4, { width: 16, align: 'center' });
        doc.restore();

        // Customer name and email in same cell
        doc.fillColor(customerColor).fontSize(11).font('Helvetica-Bold');
        doc.text(truncateText(customerData.customer_name, 20), col1X + 40, yPosition + 10);
        
        if (customerData.customer_email) {
          doc.fillColor('#6B7280').fontSize(9).font('Helvetica');
          doc.text(truncateText(customerData.customer_email, 30), col1X + 40, yPosition + 24);
        }

        yPosition += customerRowHeight;

        // --- Order Rows ---
        customerData.items.forEach((item, itemIndex) => {
          // Check page break before each order
          if (yPosition + orderRowHeight > 550) {
            doc.addPage();
            yPosition = drawHeader();
          }
          
          // Alternate row background
          if (itemIndex % 2 === 0) {
            doc.save();
            doc.rect(30, yPosition, pageWidth, orderRowHeight).fill('#FAFBFC');
            doc.restore();
          }
          
          // Draw order circle icon
          doc.save();
          doc.circle(col1X + 45, yPosition + orderRowHeight/2, 10).fill(orderColor);
          doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
          const orderInitial = (item.order_id || 'O').charAt(0).toUpperCase();
          doc.text(orderInitial, col1X + 40, yPosition + orderRowHeight/2 - 3, { width: 10, align: 'center' });
          doc.restore();

          // Order details
          doc.fillColor('#374151').fontSize(10).font('Helvetica');
          doc.text(`#${item.order_id}`, col1X + 62, yPosition + 10);
          
          doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica');
          doc.text('Order Details', col1X + 62, yPosition + 20);

          // Items count
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          const itemsCount = item.items?.length || 0;
          doc.text(String(itemsCount), col2X, yPosition + 11, { width: 80, align: 'center' });

          // Products
          const productNames = truncateText(item.items?.map((i) => i.product_id?.name || i.product_name || 'N/A').join(', ') || 'N/A', 25);
          doc.text(productNames, col3X + 10, yPosition + 11, { width: 110, align: 'left' });

          // Amount
          const vendorTotal = item.items?.filter((i) => i.vendor_id).reduce((sum, i) => sum + i.final_amount, 0) || item.total_amount || 0;
          doc.fillColor(orderColor).fontSize(10).font('Helvetica-Bold');
          doc.text(`${Number(vendorTotal).toFixed(2)}`, col4X, yPosition + 11, { width: 100, align: 'right' });

          // Order status
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          doc.text(String(item.vendor_status || 'Pending'), col5X, yPosition + 11, { width: 110, align: 'center' });

          // Payment status
          doc.text(String(item.payment_status || 'Pending'), col6X, yPosition + 11, { width: 100, align: 'center' });

          // Date
          const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '-';
          doc.text(dateStr, col7X, yPosition + 11, { width: 100, align: 'center' });

          // Bottom border
          doc.save();
          doc.moveTo(30, yPosition + orderRowHeight).lineTo(30 + pageWidth, yPosition + orderRowHeight).strokeColor(borderColor).lineWidth(0.5).stroke();
          doc.restore();

          yPosition += orderRowHeight;
        });
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const exportQuotesToTreePDF = (res, data, filename, title) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('exportQuotesToTreePDF called with data length:', data.length);
      
      if (!data || data.length === 0) {
        console.log('No data to export');
        res.status(404).json({ success: false, message: 'No data found to export' });
        return resolve();
      }
      
      // Debug log first 2 items
      console.log('First item keys:', Object.keys(data[0]));
      if (data.length > 1) {
        console.log('Second item keys:', Object.keys(data[1]));
      }

      // Group data by customer
      const customerMap = {};
      data.forEach((item, index) => {
        let customerId;
        
        if (item.user_id) {
          if (typeof item.user_id === 'object' && item.user_id._id) {
            customerId = String(item.user_id._id);
          } else if (typeof item.user_id === 'object' && item.user_id.toString) {
            customerId = String(item.user_id);
          } else {
            customerId = String(item.user_id);
          }
        } else {
          customerId = String(item._id || 'unknown-' + index);
        }
        
        if (!customerMap[customerId]) {
          let customerName = 'Unknown';
          let customerEmail = '';
          
          if (item.user_id && typeof item.user_id === 'object') {
            customerName = item.user_id.name || 'Unknown Customer';
            customerEmail = item.user_id.email || '';
          }
          
          customerMap[customerId] = {
            customer_name: customerName,
            customer_email: customerEmail,
            items: []
          };
        }
        customerMap[customerId].items.push(item);
      });

      const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        layout: 'landscape'
      });
      
      const brandColor = '#4A90E2';
      const customerColor = '#1E3A5F';
      const quoteColor = '#4A90E2';
      const lightGray = '#F8F9FA';
      const borderColor = '#E5E7EB';
      
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');
      const pageWidth = doc.page.width - 60;
      
      // --- Column Positions ---
      const col1X = 30;       // Customer/Quote
      const col2X = 250;      // Qty
      const col3X = 350;      // Days
      const col4X = 450;      // Price
      const col5X = 580;      // Status
      const col6X = 720;      // Date

      // Function to draw header
      const drawHeader = () => {
        doc.rect(0, 0, doc.page.width, 8).fill(brandColor);

        if (fs.existsSync(logoPath)) {
          try {
            doc.image(logoPath, 30, 20, { width: 80 });
          } catch (imgErr) {
            doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
          }
        } else {
          doc.fillColor(brandColor).fontSize(20).font('Helvetica-Bold').text('UPLEEX', 30, 25);
        }

        doc.fillColor('#333333').fontSize(18).font('Helvetica-Bold').text(title, 30, 25, { align: 'right' });
        doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 30, 55, { align: 'right' });

        // Divider
        doc.moveTo(30, 85).lineTo(doc.page.width - 30, 85).strokeColor(borderColor).lineWidth(1).stroke();

        // Table Header
        const tableY = 110;
        doc.rect(30, tableY, pageWidth, 35).fill('#E3F2FD');
        doc.fillColor(customerColor).fontSize(10).font('Helvetica-Bold');
        
        doc.text('Customer / Quote', col1X + 10, tableY + 12);
        doc.text('Qty', col2X, tableY + 12, { width: 80, align: 'center' });
        doc.text('Days', col3X, tableY + 12, { width: 80, align: 'center' });
        doc.text('Price', col4X, tableY + 12, { width: 100, align: 'right' });
        doc.text('Status', col5X, tableY + 12, { width: 120, align: 'center' });
        doc.text('Date', col6X, tableY + 12, { width: 100, align: 'center' });

        return tableY + 35;
      };

      // Error handling
      doc.on('error', (err) => reject(err));
      res.on('error', (err) => reject(err));
      res.on('finish', () => resolve());

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      doc.pipe(res);

      let yPosition = drawHeader(); // Start after header
      
      // --- Draw rows for each customer and their quotes ---
      Object.values(customerMap).forEach((customerData, customerIndex) => {
        const customerRowHeight = 40;
        const quoteRowHeight = 30;

        // Check page break only before customer row if needed
        if (yPosition + customerRowHeight > 520) {
          doc.addPage();
          yPosition = drawHeader();
        }

        // --- Customer Row ---
        doc.save();
        doc.rect(30, yPosition, pageWidth, customerRowHeight).fill('#F0F4FF');
        doc.restore();
        
        // Draw customer circle icon
        doc.save();
        doc.circle(col1X + 20, yPosition + customerRowHeight/2, 14).fill(customerColor);
        doc.fillColor('white').fontSize(11).font('Helvetica-Bold');
        const initials = (customerData.customer_name || 'C').charAt(0).toUpperCase();
        doc.text(initials, col1X + 12, yPosition + customerRowHeight/2 - 4, { width: 16, align: 'center' });
        doc.restore();

        // Customer name and email in same cell
        doc.fillColor(customerColor).fontSize(11).font('Helvetica-Bold');
        doc.text(truncateText(customerData.customer_name, 20), col1X + 40, yPosition + 10);
        
        if (customerData.customer_email) {
          doc.fillColor('#6B7280').fontSize(9).font('Helvetica');
          doc.text(truncateText(customerData.customer_email, 30), col1X + 40, yPosition + 24);
        }

        yPosition += customerRowHeight;

        // --- Quote Rows ---
        customerData.items.forEach((item, itemIndex) => {
          // Check page break before each quote
          if (yPosition + quoteRowHeight > 550) {
            doc.addPage();
            yPosition = drawHeader();
          }
          
          // Alternate row background
          if (itemIndex % 2 === 0) {
            doc.save();
            doc.rect(30, yPosition, pageWidth, quoteRowHeight).fill('#FAFBFC');
            doc.restore();
          }
          
          // Draw quote circle icon
          doc.save();
          doc.circle(col1X + 45, yPosition + quoteRowHeight/2, 10).fill(quoteColor);
          doc.fillColor('white').fontSize(9).font('Helvetica-Bold');
          const quoteIdStr = typeof item._id === 'object' ? String(item._id) : String(item._id || 'Q');
          const quoteInitial = quoteIdStr.charAt(0).toUpperCase();
          doc.text(quoteInitial, col1X + 40, yPosition + quoteRowHeight/2 - 3, { width: 10, align: 'center' });
          doc.restore();

          // Quote details
          doc.fillColor('#374151').fontSize(10).font('Helvetica');
          doc.text(truncateText(item.product_id?.product_name || 'Quote', 25), col1X + 62, yPosition + 10);
          
          doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica');
          doc.text('Quote Details', col1X + 62, yPosition + 20);

          // Qty
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          const qty = item.qty || 1;
          doc.text(String(qty), col2X, yPosition + 11, { width: 80, align: 'center' });

          // Days
          const days = item.number_of_days || '-';
          doc.text(String(days), col3X, yPosition + 11, { width: 80, align: 'center' });

          // Price
          const price = item.calculated_price || 0;
          doc.fillColor(quoteColor).fontSize(10).font('Helvetica-Bold');
          doc.text(`${Number(price).toFixed(2)}`, col4X, yPosition + 11, { width: 100, align: 'right' });

          // Status
          doc.fillColor('#374151').fontSize(9).font('Helvetica');
          doc.text(String(item.status || 'Pending'), col5X, yPosition + 11, { width: 120, align: 'center' });

          // Date
          const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '-';
          doc.text(dateStr, col6X, yPosition + 11, { width: 100, align: 'center' });

          // Bottom border
          doc.save();
          doc.moveTo(30, yPosition + quoteRowHeight).lineTo(30 + pageWidth, yPosition + quoteRowHeight).strokeColor(borderColor).lineWidth(0.5).stroke();
          doc.restore();

          yPosition += quoteRowHeight;
        });
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  exportToTreePDF,
  exportOrdersToTreePDF,
  exportQuotesToTreePDF
};
