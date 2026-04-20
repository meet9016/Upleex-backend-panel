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
 */
const exportToPDF = (res, data, headers, columnWidths, filename, title, rowMapper) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const brandColor = '#4A90E2';
      const logoPath = path.join(process.cwd(), 'public', 'images', 'logo', 'logo.png');

      // Error handling for the stream
      doc.on('error', (err) => {
        console.error('PDF Generation Error:', err);
        reject(err);
      });

      res.on('error', (err) => {
        console.error('Response Stream Error:', err);
        reject(err);
      });

      // Resolve when the response has finished writing
      res.on('finish', () => {
        resolve();
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      doc.pipe(res);

      // Header Section
      doc.rect(0, 0, doc.page.width, 8).fill(brandColor);

      if (fs.existsSync(logoPath)) {
        try {
          doc.image(logoPath, 30, 20, { width: 100 });
        } catch (imgErr) {
          console.error('Logo Image Load Error:', imgErr);
          doc.fillColor(brandColor).fontSize(24).font('Helvetica-Bold').text('UPLEEX', 30, 25);
        }
      } else {
        doc.fillColor(brandColor).fontSize(24).font('Helvetica-Bold').text('UPLEEX', 30, 25);
      }

      doc.fillColor('#333333').fontSize(20).font('Helvetica-Bold').text(title, 30, 25, { align: 'right' });
      doc.fillColor('#666666').fontSize(10).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString('en-IN')}`, 30, 55, { align: 'right' });

      // Divider Line
      doc.moveTo(30, 85).lineTo(doc.page.width - 30, 85).strokeColor('#E5E7EB').lineWidth(1).stroke();

      let yPosition = 110;
      let xPosition = 30;
      const tableWidth = columnWidths.reduce((sum, w) => sum + w, 0);

      // Draw Table Header
      doc.rect(30, yPosition, tableWidth, 30).fill(brandColor);
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, xPosition + 5, yPosition + 10, { width: columnWidths[i] - 10, align: 'left' });
        xPosition += columnWidths[i];
      });

      yPosition += 30;
      doc.fillColor('#333333').fontSize(9).font('Helvetica');

      data.forEach((item, index) => {
        if (yPosition > 750) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, 8).fill(brandColor);
          yPosition = 40;

          xPosition = 30;
          doc.rect(xPosition, yPosition, tableWidth, 30).fill(brandColor);
          doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
          headers.forEach((h, i) => {
            doc.text(h, xPosition + 5, yPosition + 10, { width: columnWidths[i] - 10, align: 'left' });
            xPosition += columnWidths[i];
          });
          yPosition += 30;
          doc.fillColor('#333333').fontSize(9).font('Helvetica');
        }

        if (index % 2 === 0) {
          doc.save();
          doc.rect(30, yPosition, tableWidth, 28).fill('#F8F9FA');
          doc.restore();
        }

        const rowData = rowMapper(item);
        let xPos = 30;

        // Draw row bottom border
        doc.save();
        doc.moveTo(30, yPosition + 28).lineTo(30 + tableWidth, yPosition + 28).strokeColor('#EEEEEE').lineWidth(1).stroke();
        doc.restore();

        doc.fillColor('#333333');
        rowData.forEach((val, i) => {
          const align = (headers[i] && (headers[i].toLowerCase().includes('price') || headers[i].toLowerCase().includes('amount'))) ? 'right' : 'left';
          doc.text(String(val || ''), xPos + 5, yPosition + 9, { width: columnWidths[i] - 10, align });
          xPos += columnWidths[i];
        });

        yPosition += 28;
      });

      doc.end();
    } catch (error) {
      console.error('PDF Helper Error:', error);
      reject(error);
    }
  });
};


module.exports = {
  exportToExcel,
  exportToPDF
};
