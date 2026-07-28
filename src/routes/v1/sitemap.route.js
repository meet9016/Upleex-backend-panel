const express = require('express');
const { sitemapController } = require('../../controllers');

const router = express.Router();

router.get('/dynamic-urls', sitemapController.getDynamicSitemapUrls);

module.exports = router;
