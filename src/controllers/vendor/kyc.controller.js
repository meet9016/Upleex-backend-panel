const Joi = require('joi');
const httpStatus = require('http-status');
const VendorKyc = require('../../models/vendor/vendorKyc.model');
const { uploadToExternalService } = require('../../utils/fileUpload');

const kycSchema = Joi.object().keys({
  vendor_id: Joi.string().allow(''),
  full_name: Joi.string().allow(''),
  email: Joi.string().allow(''),
  mobile: Joi.string().allow(''),
  address: Joi.string().allow(''),
  pincode: Joi.string().allow(''),
  country_id: Joi.string().allow(''),
  state_id: Joi.string().allow(''),
  city_id: Joi.string().allow(''),
  country_name: Joi.string().allow(''),
  state_name: Joi.string().allow(''),
  city_name: Joi.string().allow(''),
  pancard_number: Joi.string().allow(''),
  aadharcard_number: Joi.string().allow(''),
  business_name: Joi.string().allow(''),
  gst_number: Joi.string().allow(''),
  account_holder_name: Joi.string().allow(''),
  account_number: Joi.string().allow(''),
  ifsc_code: Joi.string().allow(''),
  account_type: Joi.string().allow(''),
  business_logo_image: Joi.string().allow(''),
  vendor_image: Joi.string().allow(''),
  pancard_front_image: Joi.string().allow(''),
  aadharcard_front_image: Joi.string().allow(''),
  aadharcard_back_image: Joi.string().allow(''),
  gst_certificate_image: Joi.string().allow(''),
}).prefs({ convert: true });

const saveKyc = {
  validation: {
    body: kycSchema,
  },
  handler: async (req, res) => {
    try {
      const body = req.body;

      // Attach uploaded images if provided
      if (req.files) {
        const map = [
          'pancard_front_image',
          'aadharcard_front_image',
          'aadharcard_back_image',
          'gst_certificate_image',
          'vendor_image',
          'business_logo_image',
        ];
        for (const key of map) {
          const file = Array.isArray(req.files[key]) ? req.files[key][0] : undefined;
          if (file) {
            const url = await uploadToExternalService(file, `vendor_kyc/${key}`);
            body[key] = url;
          }
        }
      }

      const filter = {
        $or: [
          ...(body.mobile ? [{ mobile: body.mobile }] : []),
          ...(body.email ? [{ email: body.email }] : []),
          ...(body.vendor_id ? [{ vendor_id: body.vendor_id }] : []),
        ],
      };
      let doc = await VendorKyc.findOne(filter);
      if (doc) {
        Object.assign(doc, body);
        await doc.save();
      } else {
        doc = await VendorKyc.create(body);
      }
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: doc,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getSingleKyc = {
  handler: async (req, res) => {
    try {
      const { vendor_id, mobile, email } = { ...req.body, ...req.query };
      let filter = {};
      if (vendor_id || mobile || email) {
        filter = {
          $or: [
            ...(vendor_id ? [{ vendor_id }] : []),
            ...(mobile ? [{ mobile }] : []),
            ...(email ? [{ email }] : []),
          ],
        };
      }
      const doc = await VendorKyc.findOne(filter).sort({ updatedAt: -1 });
      if (!doc) {
        return res.status(200).json({
          status: 200,
          message: 'Successfully',
          data: {},
        });
      }
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: doc.toJSON(),
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports = {
  saveKyc,
  getSingleKyc,
};

const listKyc = {
  handler: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 10;
      const skip = (page - 1) * limit;
      const total = await VendorKyc.countDocuments({});
      const docs = await VendorKyc.find({})
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit);
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: docs.map((d) => d.toJSON()),
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
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
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateKyc = {
  validation: {
    body: kycSchema,
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const body = req.body;
      const existing = await VendorKyc.findById(_id);
      if (!existing) {
        return res.status(404).json({ status: 404, message: 'Not found' });
      }
      Object.assign(existing, body);
      await existing.save();
      return res.status(200).json({
        status: 200,
        message: 'Successfully',
        data: existing.toJSON(),
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteKyc = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const existing = await VendorKyc.findById(_id);
      if (!existing) {
        return res.status(404).json({ status: 404, message: 'Not found' });
      }
      await VendorKyc.findByIdAndDelete(_id);
      return res.status(200).json({ status: 200, message: 'Deleted successfully' });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports.listKyc = listKyc;
module.exports.getKycById = getKycById;
module.exports.updateKyc = updateKyc;
module.exports.deleteKyc = deleteKyc;
