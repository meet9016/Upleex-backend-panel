const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Setting, VendorKyc } = require('../models');

const getSetting = catchAsync(async (req, res) => {
  const setting = await Setting.findOne({ key: req.params.key });
  if (!setting) {
    return res.status(httpStatus.OK).json({ success: true, data: { value: null } });
  }
  res.status(httpStatus.OK).json({ success: true, data: setting });
});

const updateSetting = catchAsync(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (key === 'demoNumbers' && Array.isArray(value)) {
    const existingSetting = await Setting.findOne({ key });
    const existingNumbers = existingSetting ? (existingSetting.value || []) : [];
    
    // Find newly added numbers
    const newNumbers = value.filter(num => !existingNumbers.includes(num));
    
    if (newNumbers.length > 0) {
      for (const number of newNumbers) {
        const kyc = await VendorKyc.findOne({
          'ContactDetails.mobile': number,
          status: 'approved'
        });
        
        if (!kyc) {
          return res.status(httpStatus.BAD_REQUEST).json({
            success: false,
            message: `Number ${number} does not have an approved KYC. Only numbers with completed KYC can be added as demo numbers.`
          });
        }
      }
    }
  }

  const setting = await Setting.findOneAndUpdate(
    { key },
    { value },
    { new: true, upsert: true }
  );
  res.status(httpStatus.OK).json({ success: true, data: setting, message: 'Setting updated successfully' });
});

module.exports = {
  getSetting,
  updateSetting,
};
