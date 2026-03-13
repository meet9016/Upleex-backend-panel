const httpStatus = require('http-status');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Product, GetQuote, Category, SubCategory } = require('../models');
const VendorKyc = require('../models/vendor/vendorKyc.model');

// Export Products to Excel
const exportProductsToExcel = {
  handler: async (req, res) => {
    try {
      const { vendor_id, category_id, sub_category_id, filter_rent_sell, filter_tenure, search } = req.query;
      const user = req.user;
      
      // Build query - IMPORTANT: Filter by vendor
      const query = {};
      
      // If vendor_id is provided in query, use it (for admin)
      if (vendor_id) {
        query.vendor_id = vendor_id;
      } 
      // If user is logged in and is a vendor, only show their products
      else if (user && user.userType === 'vendor') {
        query.vendor_id = user.id || user._id;
      }
      // If no vendor specified and not a vendor user, show only approved products
      else {
        query.approval_status = 'approved';
      }
      
      if (category_id) query.category_id = category_id;
      if (sub_category_id && sub_category_id !== 'all') query.sub_category_id = sub_category_id;
      if (filter_rent_sell === '1') query.product_type_name = 'Rent';
      else if (filter_rent_sell === '2') query.product_type_name = 'Sell';
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { product_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex }
        ];
      }

      console.log('Export Products Query:', query); // Debug log
      const products = await Product.find(query).sort({ createdAt: -1 });
      console.log(`Found ${products.length} products for export`); // Debug log

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Products');

      // Define columns with colored headers
      worksheet.columns = [
        { header: 'Product Name', key: 'product_name', width: 25 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'Sub Category', key: 'sub_category_name', width: 20 },
        { header: 'Type', key: 'product_type_name', width: 15 },
        { header: 'Price (₹)', key: 'price', width: 15 },
        { header: 'Cancel Price (₹)', key: 'cancel_price', width: 15 },
        { header: 'Listing Type', key: 'product_listing_type_name', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Created Date', key: 'createdAt', width: 15 },
        { header: 'Expires On', key: 'expires_at', width: 15 }
      ];

      // Style header row with blue background
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4A90E2' }
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      products.forEach((product, index) => {
        const row = worksheet.addRow({
          product_name: product.product_name || '',
          category_name: product.category_name || '',
          sub_category_name: product.sub_category_name || '',
          product_type_name: product.product_type_name || '',
          price: product.price ? `₹${Number(product.price).toFixed(2)}` : '₹0.00',
          cancel_price: product.cancel_price ? `₹${Number(product.cancel_price).toFixed(2)}` : '₹0.00',
          product_listing_type_name: product.product_listing_type_name || '',
          status: product.status || '',
          vendor_name: product.vendor_name || 'N/A',
          createdAt: product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '',
          expires_at: product.expires_at ? new Date(product.expires_at).toLocaleDateString() : ''
        });

        // Alternate row colors
        if (index % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          });
        }

        // Add borders to all cells
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Set response headers
      const filename = user && user.userType === 'vendor' 
        ? `my_products_${new Date().toISOString().split('T')[0]}.xlsx`
        : `products_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('Export products to Excel error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Products to PDF
const exportProductsToPDF = {
  handler: async (req, res) => {
    try {
      const { vendor_id, category_id, sub_category_id, filter_rent_sell, filter_tenure, search } = req.query;
      const user = req.user;
      
      // Build query - IMPORTANT: Filter by vendor (same as Excel)
      const query = {};
      
      // If vendor_id is provided in query, use it (for admin)
      if (vendor_id) {
        query.vendor_id = vendor_id;
      } 
      // If user is logged in and is a vendor, only show their products
      else if (user && user.userType === 'vendor') {
        query.vendor_id = user.id || user._id;
      }
      // If no vendor specified and not a vendor user, show only approved products
      else {
        query.approval_status = 'approved';
      }
      
      if (category_id) query.category_id = category_id;
      if (sub_category_id && sub_category_id !== 'all') query.sub_category_id = sub_category_id;
      if (filter_rent_sell === '1') query.product_type_name = 'Rent';
      else if (filter_rent_sell === '2') query.product_type_name = 'Sell';
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { product_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex }
        ];
      }

      console.log('Export Products PDF Query:', query); // Debug log
      const products = await Product.find(query).sort({ createdAt: -1 });
      console.log(`Found ${products.length} products for PDF export`); // Debug log

      // Create PDF
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      
      // Set response headers
      const filename = user && user.userType === 'vendor' 
        ? `my_products_${new Date().toISOString().split('T')[0]}.pdf`
        : `products_${new Date().toISOString().split('T')[0]}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      
      doc.pipe(res);

      // Add title with blue background
      const title = user && user.userType === 'vendor' ? 'My Products Report' : 'Products Report';
      doc.rect(30, 30, doc.page.width - 60, 40).fill('#4A90E2');
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold');
      doc.text(title, 50, 45);

      // Add generation date
      doc.fillColor('black').fontSize(10).font('Helvetica');
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 85);

      let yPosition = 120;

      // Table headers with blue background
      const headers = ['Product Name', 'Category', 'Type', 'Price', 'Status', 'Vendor'];
      const columnWidths = [120, 80, 60, 60, 60, 80];
      let xPosition = 50;
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

      // Draw table border
      doc.rect(50, yPosition, tableWidth, 25).stroke();
      
      // Draw header background
      doc.rect(50, yPosition, tableWidth, 25).fill('#4A90E2');
      
      // Draw header text with borders
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      headers.forEach((header, index) => {
        // Draw vertical lines for columns
        if (index > 0) {
          doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 25).stroke();
        }
        doc.text(header, xPosition + 5, yPosition + 8, { width: columnWidths[index] - 10, align: 'center' });
        xPosition += columnWidths[index];
      });

      yPosition += 25;

      // Add data rows with proper table formatting
      doc.fillColor('black').fontSize(9).font('Helvetica');
      products.forEach((product, index) => {
        if (yPosition > 750) {
          doc.addPage();
          yPosition = 50;
          
          // Redraw headers on new page
          xPosition = 50;
          doc.rect(50, yPosition, tableWidth, 25).fill('#4A90E2');
          doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
          headers.forEach((header, headerIndex) => {
            if (headerIndex > 0) {
              doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 25).stroke();
            }
            doc.text(header, xPosition + 5, yPosition + 8, { width: columnWidths[headerIndex] - 10, align: 'center' });
            xPosition += columnWidths[headerIndex];
          });
          yPosition += 25;
          doc.fillColor('black').fontSize(9).font('Helvetica');
        }

        xPosition = 50;
        
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, yPosition, tableWidth, 20).fill('#F8F9FA');
        }

        // Draw row border
        doc.rect(50, yPosition, tableWidth, 20).stroke();

        const rowData = [
          product.product_name || '',
          product.category_name || '',
          product.product_type_name || '',
          product.price ? `₹${Number(product.price).toFixed(2)}` : '₹0.00',
          product.status || '',
          product.vendor_name || 'N/A'
        ];

        doc.fillColor('black');
        rowData.forEach((data, colIndex) => {
          // Draw vertical lines for columns
          if (colIndex > 0) {
            doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 20).stroke();
          }
          
          // Add text with proper alignment
          const textOptions = { 
            width: columnWidths[colIndex] - 10,
            height: 15,
            ellipsis: true,
            align: colIndex === 3 ? 'right' : 'left' // Right align price column
          };
          
          doc.text(data, xPosition + 5, yPosition + 5, textOptions);
          xPosition += columnWidths[colIndex];
        });

        yPosition += 20;
      });

      // Draw final bottom border
      doc.moveTo(50, yPosition).lineTo(50 + tableWidth, yPosition).stroke();

      doc.end();

    } catch (error) {
      console.error('Export products to PDF error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Quotes to Excel
const exportQuotesToExcel = {
  handler: async (req, res) => {
    try {
      const { status, search, product_type, listing_type, month } = req.query;
      const user = req.user;

      // Build query
      const query = {};
      if (user.userType === 'vendor') {
        const vendorProducts = await Product.find({ vendor_id: user._id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      } else {
        query.user_id = user._id;
      }

      if (status) query.status = status;
      if (month) query.months_id = month;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ note: searchRegex }, { status: searchRegex }];
      }

      const quotes = await GetQuote.find(query).populate('product_id').sort({ createdAt: -1 });

      // Create workbook
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Quotes');

      // Define columns
      worksheet.columns = [
        { header: 'Quote ID', key: 'quote_id', width: 15 },
        { header: 'Product Name', key: 'product_name', width: 25 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Quantity', key: 'qty', width: 12 },
        { header: 'Days', key: 'number_of_days', width: 12 },
        { header: 'Price (₹)', key: 'calculated_price', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Delivery Date', key: 'delivery_date', width: 15 },
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Created Date', key: 'createdAt', width: 15 }
      ];

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF28A745' }
        };
        cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      quotes.forEach((quote, index) => {
        const row = worksheet.addRow({
          quote_id: quote._id.toString().slice(-8),
          product_name: quote.product_id?.product_name || '',
          category: quote.product_id?.category_name || '',
          qty: quote.qty || 1,
          number_of_days: quote.number_of_days || '',
          calculated_price: quote.calculated_price ? `₹${Number(quote.calculated_price).toFixed(2)}` : '₹0.00',
          status: quote.status || '',
          delivery_date: quote.delivery_date ? new Date(quote.delivery_date).toLocaleDateString() : '',
          note: quote.note || '',
          createdAt: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : ''
        });

        // Alternate row colors
        if (index % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8F9FA' }
            };
          });
        }

        // Add borders
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=quotes_${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      console.error('Export quotes to Excel error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Quotes to PDF
const exportQuotesToPDF = {
  handler: async (req, res) => {
    try {
      const { status, search, product_type, listing_type, month } = req.query;
      const user = req.user;

      // Build query (same as Excel)
      const query = {};
      if (user.userType === 'vendor') {
        const vendorProducts = await Product.find({ vendor_id: user._id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      } else {
        query.user_id = user._id;
      }

      if (status) query.status = status;
      if (month) query.months_id = month;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ note: searchRegex }, { status: searchRegex }];
      }

      const quotes = await GetQuote.find(query).populate('product_id').sort({ createdAt: -1 });

      // Create PDF
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=quotes_${Date.now()}.pdf`);
      
      doc.pipe(res);

      // Add title with green background
      doc.rect(30, 30, doc.page.width - 60, 40).fill('#28A745');
      doc.fillColor('white').fontSize(18).font('Helvetica-Bold');
      doc.text('Quotes Report', 50, 45);

      doc.fillColor('black').fontSize(10).font('Helvetica');
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, 85);

      let yPosition = 120;

      // Table headers
      const headers = ['Quote ID', 'Product', 'Qty', 'Price', 'Status'];
      const columnWidths = [80, 180, 60, 80, 80];
      let xPosition = 50;
      const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);

      // Draw table border
      doc.rect(50, yPosition, tableWidth, 25).stroke();
      
      // Draw header background
      doc.rect(50, yPosition, tableWidth, 25).fill('#28A745');
      
      // Draw header text with borders
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      headers.forEach((header, index) => {
        // Draw vertical lines for columns
        if (index > 0) {
          doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 25).stroke();
        }
        doc.text(header, xPosition + 5, yPosition + 8, { width: columnWidths[index] - 10, align: 'center' });
        xPosition += columnWidths[index];
      });

      yPosition += 25;

      // Add data rows with proper table formatting
      doc.fillColor('black').fontSize(9).font('Helvetica');
      quotes.forEach((quote, index) => {
        if (yPosition > 750) {
          doc.addPage();
          yPosition = 50;
          
          // Redraw headers on new page
          xPosition = 50;
          doc.rect(50, yPosition, tableWidth, 25).fill('#28A745');
          doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
          headers.forEach((header, headerIndex) => {
            if (headerIndex > 0) {
              doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 25).stroke();
            }
            doc.text(header, xPosition + 5, yPosition + 8, { width: columnWidths[headerIndex] - 10, align: 'center' });
            xPosition += columnWidths[headerIndex];
          });
          yPosition += 25;
          doc.fillColor('black').fontSize(9).font('Helvetica');
        }

        xPosition = 50;
        
        // Alternate row background
        if (index % 2 === 0) {
          doc.rect(50, yPosition, tableWidth, 20).fill('#F8F9FA');
        }

        // Draw row border
        doc.rect(50, yPosition, tableWidth, 20).stroke();

        const rowData = [
          quote._id.toString().slice(-8),
          quote.product_id?.product_name || '',
          quote.qty || '1',
          quote.calculated_price ? `₹${Number(quote.calculated_price).toFixed(2)}` : '₹0.00',
          quote.status || ''
        ];

        doc.fillColor('black');
        rowData.forEach((data, colIndex) => {
          // Draw vertical lines for columns
          if (colIndex > 0) {
            doc.moveTo(xPosition, yPosition).lineTo(xPosition, yPosition + 20).stroke();
          }
          
          // Add text with proper alignment
          const textOptions = { 
            width: columnWidths[colIndex] - 10,
            height: 15,
            ellipsis: true,
            align: colIndex === 3 ? 'right' : 'left' // Right align price column
          };
          
          doc.text(data, xPosition + 5, yPosition + 5, textOptions);
          xPosition += columnWidths[colIndex];
        });

        yPosition += 20;
      });

      // Draw final bottom border
      doc.moveTo(50, yPosition).lineTo(50 + tableWidth, yPosition).stroke();

      doc.end();

    } catch (error) {
      console.error('Export quotes to PDF error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

module.exports = {
  exportProductsToExcel,
  exportProductsToPDF,
  exportQuotesToExcel,
  exportQuotesToPDF
};