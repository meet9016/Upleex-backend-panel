const Joi = require('joi');
const httpStatus = require('http-status');
const VendorKyc = require('../../models/vendor/vendorKyc.model');
const Vendor = require('../../models/vendor/vendor.model');
const { AccountType } = require('../../models');
const { uploadToExternalService } = require('../../utils/fileUpload');

const saveKyc = {
  handler: async (req, res) => {
    try {
      const body = req.body;
      let vendor_id = '';

      if (req.user && (req.user.id || req.user._id)) {
        vendor_id = String(req.user.id || req.user._id);
      }

      // Handle Image Uploads for Documents section
      if (req.files) {
        const map = [
          'pancard_front_image',
          'aadharcard_front_image',
          'aadharcard_back_image',
          'gst_certificate_image',
          'vendor_image',
          'business_logo_image',
        ];

        // Documents might come as a stringified JSON if it's multipart/form-data
        let docObj = {};
        if (body.Documents) {
          docObj = Array.isArray(body.Documents) ? body.Documents[0] || {} : (typeof body.Documents === 'string' ? JSON.parse(body.Documents) : body.Documents || {});
          if (Array.isArray(docObj)) docObj = docObj[0] || {};
        }

        for (const key of map) {
          const file = Array.isArray(req.files[key]) ? req.files[key][0] : undefined;
          if (file) {
            const url = await uploadToExternalService(file, `vendor_kyc/${key}`);
            docObj[key] = url;
          }
        }
        body.Documents = [docObj];
      }

      // Helper to extract nested data from arrays (payload format: Array of objects or flat objects)
      const extract = (section) => {
        if (body[section]) {
          let data = Array.isArray(body[section]) ? body[section][0] : (typeof body[section] === 'string' ? JSON.parse(body[section]) : body[section]);
          if (Array.isArray(data)) data = data[0];
          return data;
        }
        return null;
      };

      const contact = extract('ContactDetails');
      const identity = extract('Identity');
      let bank = extract('Bank');
      const documents = extract('Documents');

      if (bank && bank.account_type) {
        try {
          const at = await AccountType.findById(bank.account_type);
          if (at) bank.account_type_name = at.type_name;
        } catch (e) { }
      }

      // Find by vendor_id or mobile/email in ContactDetails
      const searchEmail = contact?.email || body.email;
      const searchMobile = contact?.mobile || body.mobile;

      const filter = {
        $or: [
          ...(vendor_id ? [{ 'ContactDetails.vendor_id': vendor_id }] : []),
          ...(searchEmail ? [{ 'ContactDetails.email': searchEmail }] : []),
          ...(searchMobile ? [{ 'ContactDetails.mobile': searchMobile }] : []),
        ],
      };

      let doc = await VendorKyc.findOne(filter);

      const pageStr = String(body.page || '');
      const pushPage = (currentPages) => {
        if (pageStr && pageStr !== 'undefined' && !currentPages.includes(pageStr)) {
          currentPages.push(pageStr);
        }
        // Also check if step has page attribute encoded within
        [contact, identity, bank, documents].forEach(item => {
          if (item && item.page && !currentPages.includes(String(item.page))) {
            currentPages.push(String(item.page));
          }
        });
        return currentPages;
      };

      if (doc) {
        // Deep merge for nested sections
        if (contact) {
          doc.ContactDetails = { ...doc.ContactDetails.toObject(), ...contact };
          if (vendor_id) doc.ContactDetails.vendor_id = vendor_id;
        }
        if (identity) doc.Identity = { ...doc.Identity.toObject(), ...identity };
        if (bank) doc.Bank = { ...doc.Bank.toObject(), ...bank };
        if (documents) doc.Documents = { ...doc.Documents.toObject(), ...documents };

        doc.completed_pages = pushPage(doc.completed_pages || []);

        await doc.save();
      } else {
        const initialContact = contact || {};
        if (vendor_id) initialContact.vendor_id = vendor_id;

        doc = await VendorKyc.create({
          ContactDetails: initialContact,
          Identity: identity || {},
          Bank: bank || {},
          Documents: documents || {},
          completed_pages: pushPage([]),
          status: 'pending'
        });
      }

      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: doc.toJSON(),
      });
    } catch (error) {
      console.error("KYC Save Error:", error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getSingleKyc = {
  handler: async (req, res) => {
    try {
      let { vendor_id, mobile, email } = { ...req.body, ...req.query };
      if (req.user && (req.user.id || req.user._id)) {
        vendor_id = String(req.user.id || req.user._id);
      }

      let filter = {};
      if (vendor_id || mobile || email) {
        filter = {
          $or: [
            ...(vendor_id ? [{ 'ContactDetails.vendor_id': vendor_id }] : []),
            ...(mobile ? [{ 'ContactDetails.mobile': mobile }] : []),
            ...(email ? [{ 'ContactDetails.email': email }] : []),
          ],
        };
      }
      const doc = await VendorKyc.findOne(filter).sort({ updatedAt: -1 });

      let dataObj = doc ? doc.toJSON() : {};
      if (dataObj?.Bank?.account_type && !dataObj?.Bank?.account_type_name) {
        try {
          const at = await AccountType.findById(dataObj.Bank.account_type);
          if (at) dataObj.Bank.account_type_name = at.type_name;
        } catch (e) { }
      }
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: dataObj,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const listKyc = {
  handler: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const skip = (page - 1) * limit;
      const status = req.query.status;
      const q = status ? { status } : {};
      const total = await VendorKyc.countDocuments(q);
      const docs = await VendorKyc.find(q)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);

      const ids = [...new Set(docs.map(d => (d.toJSON().Bank?.account_type || '')).filter(Boolean))];
      let atMap = {};
      if (ids.length) {
        const ats = await AccountType.find({ _id: { $in: ids } });
        ats.forEach(a => { atMap[String(a._id)] = a.type_name; });
      }
      const dataArr = docs.map((d) => {
        const obj = d.toJSON();
        if (obj?.Bank?.account_type && !obj?.Bank?.account_type_name) {
          obj.Bank.account_type_name = atMap[String(obj.Bank.account_type)] || '';
        }
        return obj;
      });
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: dataArr,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getKycById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const doc = await VendorKyc.findById(_id);
      if (!doc) {
        return res.status(404).json({ status: 404, message: 'Not found', data: {} });
      }
      return res.status(200).json({ status: 200, message: 'Successfully', data: doc.toJSON() });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateKyc = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const body = req.body;
      const existing = await VendorKyc.findById(_id);
      if (!existing) {
        return res.status(404).json({ status: 404, message: 'Not found' });
      }

      // We should probably rely on the schema logic or standard Object.assign if we want flat updates
      // But user wants structured updates. For now, let's keep it simple.
      Object.assign(existing, body);
      await existing.save();
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: existing.toJSON(),
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const deleteKyc = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      await VendorKyc.findByIdAndDelete(_id);
      return res.status(200).json({ status: 200, message: 'Deleted successfully' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const changeStatus = {
  validation: {
    body: Joi.object().keys({
      kyc_id: Joi.string().allow(''),
      vendor_id: Joi.string().allow(''),
      status: Joi.string().valid('pending', 'approved', 'rejected').required(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { kyc_id, vendor_id, status } = req.body;
      const filter = kyc_id ? { _id: kyc_id } : vendor_id ? { 'ContactDetails.vendor_id': vendor_id } : null;
      if (!filter) {
        return res.status(400).json({ status: 400, message: 'kyc_id or vendor_id is required' });
      }
      const doc = await VendorKyc.findOne(filter);
      if (!doc) {
        return res.status(404).json({ status: 404, message: 'KYC not found' });
      }
      doc.status = status;
      const v_id = doc.ContactDetails?.vendor_id || doc.vendor_id;
      if (status === 'approved') {
        doc.approved_at = new Date();
        if (v_id) {
          await Vendor.findByIdAndUpdate(v_id, { isVerified: true });
        }
      } else {
        doc.approved_at = undefined;
        if (v_id && status === 'rejected') {
          await Vendor.findByIdAndUpdate(v_id, { isVerified: false });
        }
      }
      await doc.save();
      return res.status(200).json({ status: 200, message: 'Status updated', data: doc.toJSON() });
    } catch (error) {
      console.error("Change Status Error:", error);
      res.status(500).json({ status: 500, message: error.message });
    }
  },
};

const downloadKycPDF = {
  handler: async (req, res) => {
    try {
      const { kyc_id } = req.params;

      const doc = await VendorKyc.findById(kyc_id);
      if (!doc) {
        return res.status(404).json({ status: 404, message: "KYC not found" });
      }

      const PDFDocument = require("pdfkit");
      const axios = require("axios");

      const pdfDoc = new PDFDocument({
        margin: 40,
        bufferPages: true,
        autoFirstPage: false,
        size: "A4"
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${doc.ContactDetails?.full_name || "vendor"}_KYC.pdf"`
      );

      pdfDoc.pipe(res);
      pdfDoc.addPage();

      const data = doc.toJSON();
      const contact = data.ContactDetails || {};
      const identity = data.Identity || {};
      const bank = data.Bank || {};

      /* ---------- PAGE BREAK ---------- */

      const checkPageBreak = (height = 0) => {
        if (pdfDoc.y + height > pdfDoc.page.height - 110) {
          pdfDoc.addPage();
          pdfDoc.y = 60;
        }
      };

      /* ---------- HEADER ---------- */

      const addHeader = () => {
        pdfDoc.rect(0, 0, pdfDoc.page.width, 70).fill("#0f172a");

        pdfDoc
          .fillColor("#ffffff")
          .font("Helvetica-Bold")
          .fontSize(20)
          .text("VENDOR KYC VERIFICATION REPORT", 50, 25);

        const statusColor =
          data.status === "approved"
            ? "#10b981"
            : data.status === "rejected"
              ? "#ef4444"
              : "#f59e0b";

        pdfDoc
          .fillColor(statusColor)
          .roundedRect(pdfDoc.page.width - 150, 20, 100, 30, 5)
          .fill();

        pdfDoc
          .fillColor("#ffffff")
          .fontSize(12)
          .text((data.status || "PENDING").toUpperCase(), pdfDoc.page.width - 135, 30);

        pdfDoc.y = 90;
      };

      /* ---------- VENDOR INFO ---------- */

      const addVendorInfo = () => {
        pdfDoc
          .font("Helvetica-Bold")
          .fillColor("#0f172a")
          .fontSize(18)
          .text(contact.full_name || "N/A", 50);

        pdfDoc
          .font("Helvetica")
          .fontSize(11)
          .fillColor("#64748b")
          .text(identity.business_name || "Individual Vendor", 50);

        pdfDoc.moveDown(2);
      };

      /* ---------- SECTION ---------- */

      const addSection = (title) => {
        checkPageBreak(40);

        pdfDoc.rect(40, pdfDoc.y - 5, pdfDoc.page.width - 80, 28).fill("#f1f5f9");

        pdfDoc
          .fillColor("#0f172a")
          .font("Helvetica-Bold")
          .fontSize(13)
          .text(title, 45, pdfDoc.y + 3);

        pdfDoc.moveDown(2);
      };

      /* ---------- ROW ---------- */

      const addRow = (label, value, index = 0) => {
        checkPageBreak(22);
        const y = pdfDoc.y;

        if (index % 2 === 0) {
          pdfDoc.rect(40, y - 3, pdfDoc.page.width - 80, 22).fill("#f8fafc");
        }

        pdfDoc
          .fillColor("#475569")
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(label, 45, y + 2);

        pdfDoc
          .fillColor("#0f172a")
          .font("Helvetica")
          .fontSize(9.5)
          .text(value || "—", 170, y + 2);

        pdfDoc.y = y + 22;
      };

      /* ---------- CONTENT ---------- */

      addHeader();
      addVendorInfo();

      addSection("CONTACT INFORMATION");

      const contactRows = [
        { label: "Email", value: contact.email },
        { label: "Phone", value: contact.mobile },
        { label: "Address", value: contact.address },
        { label: "City", value: contact.city_name },
        { label: "Pincode", value: contact.pincode },
        { label: "State", value: contact.state_name }
      ];

      contactRows.forEach((r, i) => addRow(r.label, r.value, i));

      addSection("IDENTITY DETAILS");

      const identityRows = [
        { label: "PAN Number", value: identity.pancard_number },
        { label: "Aadhaar Number", value: identity.aadharcard_number },
        { label: "Business Name", value: identity.business_name },
        { label: "GST Number", value: identity.gst_number }
      ];

      identityRows.forEach((r, i) => addRow(r.label, r.value, i));

      addSection("BANK DETAILS");

      const bankRows = [
        { label: "Account Holder", value: bank.account_holder_name },
        { label: "Account Number", value: bank.account_number },
        { label: "IFSC Code", value: bank.ifsc_code },
        { label: "Account Type", value: bank.account_type_name }
      ];

      bankRows.forEach((r, i) => addRow(r.label, r.value, i));

      /* ---------- DOCUMENTS ---------- */

      addSection("UPLOADED DOCUMENTS");

      const docsObj = Array.isArray(data.Documents)
        ? data.Documents[0] || {}
        : data.Documents || {};

      const imageKeys = [
        { key: "vendor_image", label: "Profile Photo" },
        { key: "business_logo_image", label: "Business Logo" },
        { key: "pancard_front_image", label: "PAN Card" },
        { key: "aadharcard_front_image", label: "Aadhaar Front" },
        { key: "aadharcard_back_image", label: "Aadhaar Back" },
        { key: "gst_certificate_image", label: "GST Certificate" }
      ];

      let imageX = 55;
      let imageY = pdfDoc.y;

      const imgW = 220;
      const imgH = 155;
      let count = 0;

      for (const item of imageKeys) {
        let url = docsObj[item.key];

        if (!url || !url.startsWith("http")) continue;

        if (imageY + imgH + 80 > pdfDoc.page.height - 60) {
          pdfDoc.addPage();
          imageX = 55;
          imageY = 70;
          count = 0;
        }

        if (url.toLowerCase().endsWith(".pdf")) {

          pdfDoc
            .roundedRect(imageX, imageY, imgW, imgH, 8)
            .fillAndStroke("#eff6ff", "#2563eb");

          pdfDoc
            .fillColor("#1d4ed8")
            .font("Helvetica-Bold")
            .fontSize(36)
            .text("PDF", imageX, imageY + 45, { width: imgW, align: "center" });

          pdfDoc
            .fontSize(11)
            .text("DOCUMENT", imageX, imageY + 90, { width: imgW, align: "center" });

          const btnWidth = 120;
          const btnHeight = 24;

          const btnX = imageX + (imgW - btnWidth) / 2;
          const btnY = imageY + 118;

          // Button
          pdfDoc
            .roundedRect(btnX, btnY, btnWidth, btnHeight, 5)
            .fill("#2563eb");

          // Button text
          pdfDoc
            .fillColor("#ffffff")
            .font("Helvetica-Bold")
            .fontSize(9)
            .text("VIEW PDF", btnX, btnY + 7, {
              width: btnWidth,
              align: "center"
            });

          // Clickable area (external link)
          pdfDoc.link(btnX, btnY, btnWidth, btnHeight, url);

        } else {

          try {
            const img = await axios.get(url, { responseType: "arraybuffer" });

            pdfDoc.image(Buffer.from(img.data), imageX, imageY, {
              fit: [imgW, imgH],
              align: "center"
            });

          } catch {
            pdfDoc.rect(imageX, imageY, imgW, imgH).fill("#f1f5f9");

            pdfDoc
              .fillColor("red")
              .fontSize(10)
              .text("Image load failed", imageX + 60, imageY + 70);
          }
        }

        pdfDoc
          .fillColor("#1e293b")
          .font("Helvetica-Bold")
          .fontSize(10)
          .text(item.label, imageX, imageY + imgH + 25, {
            width: imgW,
            align: "center"
          });

        count++;

        if (count % 2 === 0) {
          imageX = 55;
          imageY += imgH + 60;
        } else {
          imageX += imgW + 35;
        }
      }

      pdfDoc.end();

    } catch (error) {
      console.error("PDF error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          status: 500,
          message: "PDF generation failed"
        });
      }
    }
  }
};

module.exports = {
  saveKyc,
  getSingleKyc,
  listKyc,
  getKycById,
  updateKyc,
  deleteKyc,
  changeStatus,
  downloadKycPDF,
};
