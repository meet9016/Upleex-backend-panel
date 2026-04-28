const AppVersion = require('../models/appVersion.model');

const getAppVersion = async (req, res) => {
  try {
    let version = await AppVersion.findOne().sort({ createdAt: -1 }).lean();

    if (!version) {
      version = await AppVersion.create({});
    }

    res.status(200).json({
      status: 1,
      message: 'Success',
      data: {
        android_version_code: version.android_version_code,
        ios_version_code: version.ios_version_code,
        android_version_type: version.android_version_type,
        ios_version_type: version.ios_version_type,
        play_store_link: version.play_store_link,
        app_store_link: version.app_store_link,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 0, message: error.message });
  }
};

const updateAppVersion = async (req, res) => {
  try {
    const {
      android_version_code,
      ios_version_code,
      android_version_type,
      ios_version_type,
      play_store_link,
      app_store_link,
    } = req.body;

    const data = {
      ...(android_version_code !== undefined && { android_version_code }),
      ...(ios_version_code !== undefined && { ios_version_code }),
      ...(android_version_type !== undefined && { android_version_type }),
      ...(ios_version_type !== undefined && { ios_version_type }),
      ...(play_store_link !== undefined && { play_store_link }),
      ...(app_store_link !== undefined && { app_store_link }),
    };

    const existing = await AppVersion.findOne().sort({ createdAt: -1 });

    const version = existing
      ? await AppVersion.findByIdAndUpdate(existing._id, data, { new: true })
      : await AppVersion.create(data);

    res.status(200).json({
      status: 1,
      message: 'App version updated successfully',
      data: {
        android_version_code: version.android_version_code,
        ios_version_code: version.ios_version_code,
        android_version_type: version.android_version_type,
        ios_version_type: version.ios_version_type,
        play_store_link: version.play_store_link,
        app_store_link: version.app_store_link,
      },
    });
  } catch (error) {
    res.status(500).json({ status: 0, message: error.message });
  }
};

module.exports = { getAppVersion, updateAppVersion };
