const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Common function to export data to Excel
 * @param {Object} res - Express response object
 * @param {Array} data - Data to export
 * @param {Array} columns - Column definitions [{ header, key, width }]
 * @param {String} filename - Output filename
 * @param {String} sheetName - Worksheet name
 */
const exportToExcel = async (res, data, columns, filename, sheetName = 'Sheet1') => {
  console.log('exportToExcel called with data length:', data.length);
  
  if (!data || data.length === 0) {
    console.log('No data to export');
    return res.status(404).json({ success: false, message: 'No data found to export' });
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.columns = columns;

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4A90E2' }
    };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { vertical: 'middle', horizontal: 'le' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });

  // Add data rows
  data.forEach((item, index) => {
    const row = worksheet.addRow(item);

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

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

  await workbook.xlsx.write(res);
  res.end();
};

/**
 * Common function to export data to PDF
 * @param {Object} res - Express response object
 * @param {Array} data - Data to export
 * @param {Array} headers - Table headers
 * @param {Array} columnWidths - Column widths
 * @param {String} filename - Output filename
 * @param {String} title - Report title
 * @param {Function} rowMapper - Function to map data item to row array
 * @param {Object} options - PDF options { size, layout }
 */
const exportToPDF = (res, data, headers, columnWidths, filename, title, rowMapper, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('exportToPDF called with data length:', data.length);
      
      if (!data || data.length === 0) {
        console.log('No data to export');
        res.status(404).json({ success: false, message: 'No data found to export' });
        return resolve();
      }

      const doc = new PDFDocument({ 
        margin: 30, 
        size: options.size || 'A4',
        layout: options.layout || 'landscape',
        bufferPages: true
      });
      
      const brandColor = '#4A90E2';
      const vendorColor = '#1E3A5F';
      const borderColor = '#E5E7EB';
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');
      const watermarkPath = path.join(process.cwd(), 'public', 'images', 'logo', 'favicon.png');
      const pageWidth = doc.page.width - 60;

      // Calculate proportional column widths based on page width
      const totalOriginalWidth = columnWidths.reduce((sum, w) => sum + w, 0);
      const adjustedColumnWidths = columnWidths.map(w => (w / totalOriginalWidth) * pageWidth);

      // Error handling
      doc.on('error', (err) => reject(err));
      res.on('error', (err) => reject(err));
      res.on('finish', () => resolve());

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      doc.pipe(res);

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
        
        let xPosition = 30;
        headers.forEach((h, i) => {
          let align = 'left';
          if (options.align) {
            align = options.align;
          } else if (options.alignments && options.alignments[i]) {
            align = options.alignments[i];
          } else if (h.toLowerCase().includes('price') || h.toLowerCase().includes('amount')) {
            align = 'right';
          }
          doc.text(h, xPosition + 10, tableY + 12, { width: adjustedColumnWidths[i] - 20, align });
          xPosition += adjustedColumnWidths[i];
        });

        return tableY + 35;
      };

      let yPosition = drawHeader();
      const rowHeight = 30;

      data.forEach((item, index) => {
        // Check page break
        if (yPosition + rowHeight > 520) {
          doc.addPage();
          yPosition = drawHeader();
        }
        
        // Alternate row background
        if (index % 2 === 0) {
          doc.save();
          doc.rect(30, yPosition, pageWidth, rowHeight).fill('#FAFBFC');
          doc.restore();
        }

        const rowData = rowMapper(item);
        let xPos = 30;

        rowData.forEach((val, i) => {
          let align = 'left';
          if (options.align) {
            align = options.align;
          } else if (options.alignments && options.alignments[i]) {
            align = options.alignments[i];
          } else if (headers[i] && (headers[i].toLowerCase().includes('price') || headers[i].toLowerCase().includes('amount'))) {
            align = 'right';
          }
          const cellColor = options.cellColorMapper ? options.cellColorMapper(i, String(val || '')) : null;
          doc.fillColor(cellColor || '#374151').fontSize(9).font('Helvetica');
          doc.text(String(val || ''), xPos + 10, yPosition + 11, { width: adjustedColumnWidths[i] - 20, align });
          xPos += adjustedColumnWidths[i];
        });
        doc.fillColor('#374151');

        // Bottom border
        doc.save();
        doc.moveTo(30, yPosition + rowHeight).lineTo(30 + pageWidth, yPosition + rowHeight).strokeColor(borderColor).lineWidth(0.5).stroke();
        doc.restore();

        yPosition += rowHeight;
      });

      // Add watermark to all pages
      if (fs.existsSync(watermarkPath)) {
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count; i < end; i++) {
          doc.switchToPage(i);
          doc.save();
          doc.opacity(0.1);
          const imgWidth = 50;
          const x = (doc.page.width - imgWidth) / 2;
          const y = (doc.page.height - imgWidth) / 2;
          doc.image(watermarkPath, x, y, { width: imgWidth, align: 'center', valign: 'center' });
          doc.restore();
        }
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const { exportToTreePDF, exportOrdersToTreePDF, exportQuotesToTreePDF } = require('./exportTreePDF.helper');

module.exports = {
  exportToExcel,
  exportToPDF,
  exportToTreePDF,
  exportOrdersToTreePDF,
  exportQuotesToTreePDF
};
