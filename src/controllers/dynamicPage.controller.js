const httpStatus = require('http-status');
const Joi = require('joi');
const DynamicPage = require('../models/dynamicPage.model');

const upsertDynamicPage = {
  validation: {
    body: Joi.object().keys({
      slug: Joi.string().required(),
      title: Joi.string().required(),
      content: Joi.string().required(),
    }),
  },
  handler: async (req, res) => {
    const { slug, title, content } = req.body;

    const page = await DynamicPage.findOneAndUpdate(
      { slug },
      { title, content },
      { new: true, upsert: true }
    );

    res.status(httpStatus.OK).json({
      success: true,
      message: 'Page content saved successfully',
      data: page,
    });
  },
};

const getDynamicPageBySlug = {
  handler: async (req, res) => {
    const { slug } = req.params;

    const page = await DynamicPage.findOne({ slug });
    if (!page) {
      return res.status(httpStatus.NOT_FOUND).json({
        success: false,
        message: 'Page not found',
      });
    }

    res.status(httpStatus.OK).json({
      success: true,
      data: page,
    });
  },
};

const getAllDynamicPages = {
  handler: async (req, res) => {
    const pages = await DynamicPage.find().select('slug title updatedAt');
    res.status(httpStatus.OK).json({
      success: true,
      data: pages,
    });
  },
};

module.exports = {
  upsertDynamicPage,
  getDynamicPageBySlug,
  getAllDynamicPages,
};
