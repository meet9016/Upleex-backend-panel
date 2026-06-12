const fs = require('fs');

let content = fs.readFileSync('d:/upleex/upleex-backend/src/utils/exportTreePDF.helper.js', 'utf8');

// Add bufferPages: true
content = content.replace(
  /const doc = new PDFDocument\(\{\s*margin: 30,\s*size: 'A4',\s*layout: 'landscape'\s*\}\);/g,
  `const doc = new PDFDocument({ 
        margin: 30, 
        size: 'A4',
        layout: 'landscape',
        bufferPages: true
      });`
);

// Remove old watermark
const oldWatermark = `      // Watermark function
      const drawWatermark = () => {
        if (fs.existsSync(logoPath)) {
          doc.save();
          doc.opacity(0.1);
          // Draw watermark in center
          const imgWidth = 300;
          doc.image(logoPath, (doc.page.width - imgWidth) / 2, (doc.page.height - imgWidth) / 2, { width: imgWidth, align: 'center', valign: 'center' });
          doc.restore();
        }
      };

      // Listen for new pages to add watermark
      doc.on('pageAdded', drawWatermark);
      drawWatermark(); // Draw for the first page
`;

content = content.split(oldWatermark).join('');

// Add new watermark before doc.end()
const newWatermark = `      // Add watermark to all pages
      if (fs.existsSync(logoPath)) {
        const range = doc.bufferedPageRange();
        for (let i = range.start, end = range.start + range.count; i < end; i++) {
          doc.switchToPage(i);
          doc.save();
          doc.opacity(0.1);
          const imgWidth = 400;
          const x = (doc.page.width - imgWidth) / 2;
          const y = (doc.page.height - imgWidth/2) / 2;
          doc.image(logoPath, x, y, { width: imgWidth, align: 'center', valign: 'center' });
          doc.restore();
        }
      }
      doc.end();`;

content = content.replace(/      doc\.end\(\);/g, newWatermark);

fs.writeFileSync('d:/upleex/upleex-backend/src/utils/exportTreePDF.helper.js', content);
console.log('Done!');
