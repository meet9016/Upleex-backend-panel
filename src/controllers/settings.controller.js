const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { Setting } = require('../models');

const getSetting = catchAsync(async (req, res) => {
  const setting = await Setting.findOne({ key: req.params.key });
  if (!setting) {
    return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Setting not found', data: { value: null } });
  }
  res.status(httpStatus.OK).json({ success: true, data: setting });
});

const updateSetting = catchAsync(async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;
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
