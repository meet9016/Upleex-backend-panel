const express = require('express');
const { settingsController } = require('../../controllers');

const router = express.Router();

router.get('/:key', settingsController.getSetting);
router.put('/:key', settingsController.updateSetting);

module.exports = router;
