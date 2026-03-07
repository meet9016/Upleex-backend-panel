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
        } catch (e) {}
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
        } catch (e) {}
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

module.exports = {
  saveKyc,
  getSingleKyc,
  listKyc,
  getKycById,
  updateKyc,
  deleteKyc,
  changeStatus,
};
