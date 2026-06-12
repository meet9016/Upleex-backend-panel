const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Category, SubCategory } = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');

const parseLegacyBulletLine = (line) => {
  let content = String(line || '').trim().replace(/^[●•\-*]\s+/, '');
  const boldMatch = content.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/s);
  if (boldMatch) {
    return {
      label: boldMatch[1].trim(),
      text: boldMatch[2].trim(),
    };
  }
  const colonIndex = content.indexOf(':');
  if (colonIndex > 0) {
    return {
      label: content.slice(0, colonIndex).replace(/\*\*/g, '').trim(),
      text: content.slice(colonIndex + 1).trim(),
    };
  }
  return { label: '', text: content };
};

const normalizeSeoSection = (section) => {
  const heading = String(section?.heading || section?.h2 || '').trim();
  const heading_level = section?.heading_level === 'h3' ? 'h3' : 'h2';

  let bullets = [];
  if (Array.isArray(section?.bullets)) {
    bullets = section.bullets
      .map((bullet) => {
        const label = String(bullet?.label || '').trim();
        const text = String(bullet?.text || '').trim();
        const plain = Boolean(bullet?.plain) || (!label && Boolean(text));
        return {
          label: plain ? '' : label,
          text,
          plain,
        };
      })
      .filter((bullet) => bullet.label || bullet.text);
  }

  if (!bullets.length && Array.isArray(section?.paragraphs)) {
    bullets = section.paragraphs
      .map((paragraph) => {
        const parsed = parseLegacyBulletLine(paragraph);
        const plain = !parsed.label && Boolean(parsed.text);
        return { ...parsed, plain };
      })
      .filter((bullet) => bullet.label || bullet.text);
  }

  return { heading, heading_level, bullets };
};

const normalizeIntroParagraphs = (parsed) => {
  if (Array.isArray(parsed?.intro_paragraphs) && parsed.intro_paragraphs.length > 0) {
    return parsed.intro_paragraphs.map((p) => String(p || '').trim()).filter(Boolean);
  }
  const legacyIntro = String(parsed?.intro_text || '').trim();
  return legacyIntro ? [legacyIntro] : [];
};

const normalizeSeoFaqs = (parsed) => {
  if (!Array.isArray(parsed?.faqs)) return [];
  return parsed.faqs
    .map((faq) => ({
      question: String(faq?.question || '').trim(),
      answer: String(faq?.answer || '').trim(),
    }))
    .filter((faq) => faq.question || faq.answer);
};

const parseSeoContentInput = (raw) => {
  if (!raw) {
    return {
      meta_title: '',
      meta_description: '',
      core_keyword: '',
      secondary_keywords: '',
      image_alt: '',
      image_title: '',
      anchor_tags: [],
      faqs: [],
      hero_title: '',
      hero_text: '',
      intro_heading: '',
      intro_paragraphs: [],
      sections: [],
      main_text: '',
      sub_text: '',
    };
  }

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      parsed = {};
    }
  }

  const sections = Array.isArray(parsed.sections)
    ? parsed.sections.map((section) => normalizeSeoSection(section))
    : [];

  return {
    meta_title: String(parsed.meta_title || '').trim(),
    meta_description: String(parsed.meta_description || '').trim(),
    core_keyword: String(parsed.core_keyword || '').trim(),
    secondary_keywords: String(parsed.secondary_keywords || '').trim(),
    image_alt: String(parsed.image_alt || '').trim(),
    image_title: String(parsed.image_title || '').trim(),
    anchor_tags: Array.isArray(parsed.anchor_tags)
      ? parsed.anchor_tags.map((tag) => String(tag || '').trim()).filter(Boolean)
      : [],
    faqs: normalizeSeoFaqs(parsed),
    hero_title: String(parsed.hero_title || '').trim(),
    hero_text: String(parsed.hero_text || '').trim(),
    intro_heading: String(parsed.intro_heading || '').trim(),
    intro_paragraphs: normalizeIntroParagraphs(parsed),
    sections,
    main_text: String(parsed.main_text || '').trim(),
    sub_text: String(parsed.sub_text || '').trim(),
  };
};

const formatSeoContentResponse = (seo) => {
  if (!seo) {
    return {
      meta_title: '',
      meta_description: '',
      core_keyword: '',
      secondary_keywords: '',
      image_alt: '',
      image_title: '',
      anchor_tags: [],
      faqs: [],
      hero_title: '',
      hero_text: '',
      intro_heading: '',
      intro_paragraphs: [],
      sections: [],
      main_text: '',
      sub_text: '',
    };
  }

  const source = seo.toObject ? seo.toObject() : seo;

  return {
    meta_title: source.meta_title || '',
    meta_description: source.meta_description || '',
    core_keyword: source.core_keyword || '',
    secondary_keywords: source.secondary_keywords || '',
    image_alt: source.image_alt || '',
    image_title: source.image_title || '',
    anchor_tags: Array.isArray(source.anchor_tags) ? source.anchor_tags : [],
    faqs: normalizeSeoFaqs(source),
    hero_title: source.hero_title || '',
    hero_text: source.hero_text || '',
    intro_heading: source.intro_heading || '',
    intro_paragraphs: normalizeIntroParagraphs(source),
    sections: Array.isArray(source.sections)
      ? source.sections.map((section) => normalizeSeoSection(section))
      : [],
    main_text: source.main_text || '',
    sub_text: source.sub_text || '',
  };
};

const createSubCategory = {
  validation: {
    body: Joi.object().keys({
      id: Joi.string().required(),
      name: Joi.string().trim().required(),
      image: Joi.string().allow(),
      seo_content: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { id, name } = req.body;

      const category = await Category.findById(id);

      if (!category) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category not found for this id' });
      }

      const subCategoryExist = await SubCategory.findOne({
        categoryId: id,
        name: name.trim(),
      });

      if (subCategoryExist) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Subcategory with this name already exists for this category',
        });
      }

      let imageUrl = req.body.image || '';
      if (req.file) {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }

      const seoContent = parseSeoContentInput(req.body.seo_content);

      const subCategory = await SubCategory.create({
        categoryId: id,
        name: req.body.name,
        image: imageUrl,
        seo_content: seoContent,
      });

      try {
        const { logActivity } = require('../utils/activityLogger');
        if (req.user && req.user.userType === 'admin') {
          await logActivity(req, req.user._id, 'CREATE', 'Categories', `Admin created subcategory: ${subCategory.name}`, { subcategory_id: subCategory._id }, 'admin');
        }
      } catch (e) {}

      return res.status(201).json({
        success: true,
        message: 'Subcategory created successfully!',
        subCategory: {
          id: subCategory.id,
          categoryId: subCategory.categoryId,
          name: subCategory.name,
          image: subCategory.image,
          created_at: subCategory.createdAt,
          updated_at: subCategory.updatedAt,
          seo_content: formatSeoContentResponse(subCategory.seo_content),
        },
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllSubCategories = {
  handler: async (req, res) => {
    const { categoryId } = req.query;
    const query = {};

    if (categoryId) {
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        query.categoryId = categoryId;
      } else {
        const cat = await Category.findOne({ slug: categoryId });
        if (cat) {
          query.categoryId = cat._id;
        } else {
          query.categoryId = new mongoose.Types.ObjectId(); // dummy id to return empty
        }
      }
    }

    const originalJson = res.json.bind(res);

    res.json = (payload) => {
      if (payload && Array.isArray(payload.data)) {
        payload.data = payload.data.map((item) => ({
          id: item.id || item._id,
          categoryId: item.categoryId,
          name: item.name,
          image: item.image,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
          seo_content: formatSeoContentResponse(item.seo_content),
        }));
      }
      return originalJson(payload);
    };

    await handlePagination(SubCategory, req, res, query);
  },
};

const getSubCategoryById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid subcategory id' });
      }

      const subCategory = await SubCategory.findById(_id);
      if (!subCategory) {
        return res.status(404).json({ message: 'Subcategory not found' });
      }

      res.status(200).json({
        id: subCategory.id,
        categoryId: subCategory.categoryId,
        name: subCategory.name,
        image: subCategory.image,
        created_at: subCategory.createdAt,
        updated_at: subCategory.updatedAt,
        seo_content: formatSeoContentResponse(subCategory.seo_content),
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateSubCategory = {
  validation: {
    body: Joi.object()
      .keys({
        id: Joi.string().required(),
        name: Joi.string().trim().required(),
        image: Joi.string().allow(),
        seo_content: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;
      const { id, name } = req.body;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid subcategory id' });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid category id' });
      }

      const subCategoryExist = await SubCategory.findById(_id);

      if (!subCategoryExist) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Subcategory does not exist' });
      }

      const category = await Category.findById(id);

      if (!category) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category not found for this id' });
      }

      const duplicate = await SubCategory.findOne({
        _id: { $ne: _id },
        categoryId: id,
        name: name.trim(),
      });

      if (duplicate) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Subcategory with this name already exists for this category',
        });
      }

      let imageUrl = req.body.image || subCategoryExist.image || '';
      if (req.file) {
        if (subCategoryExist.image) {
          imageUrl = await updateFileOnExternalService(
            subCategoryExist.image,
            req.file
          );
        } else {
          imageUrl = await uploadToExternalService(req.file, 'categories_image');
        }
      }

      const updateData = {
        categoryId: id,
        name: req.body.name,
        image: imageUrl,
      };

      if (req.body.seo_content !== undefined) {
        updateData.seo_content = parseSeoContentInput(req.body.seo_content);
      }

      const subCategory = await SubCategory.findByIdAndUpdate(
        _id,
        updateData,
        {
          new: true,
        }
      );

      try {
        const { logActivity } = require('../utils/activityLogger');
        if (req.user && req.user.userType === 'admin' && subCategory) {
          await logActivity(req, req.user._id, 'UPDATE', 'Categories', `Admin updated subcategory: ${subCategory.name}`, { subcategory_id: subCategory._id }, 'admin');
        }
      } catch (e) {}

      if (!subCategory) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Subcategory does not exist' });
      }

      res.send({
        success: true,
        message: 'Subcategory updated successfully!',
        data: {
          id: subCategory.id,
          categoryId: subCategory.categoryId,
          name: subCategory.name,
          image: subCategory.image,
          created_at: subCategory.createdAt,
          updated_at: subCategory.updatedAt,
          seo_content: formatSeoContentResponse(subCategory.seo_content),
        },
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};


const deleteSubCategory = {
  handler: async (req, res) => {
    const { _id } = req.params;

    const subCategoryExist = await SubCategory.findById(_id);

    if (!subCategoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Subcategory does not exist');
    }

    if (subCategoryExist.image) {
      await deleteFileFromExternalService(subCategoryExist.image);
    }

    await SubCategory.findByIdAndDelete(_id);

    try {
      const { logActivity } = require('../utils/activityLogger');
      if (req.user && req.user.userType === 'admin' && subCategoryExist) {
        await logActivity(req, req.user._id, 'DELETE', 'Categories', `Admin deleted subcategory: ${subCategoryExist.name}`, { subcategory_id: subCategoryExist._id }, 'admin');
      }
    } catch (e) {}

    res.send({ message: 'Subcategory deleted successfully' });
  },
};
const bulkDeleteSubCategories = {
  validation: {
    body: Joi.object().keys({
      ids: Joi.array().items(Joi.string()).required(),
    }),
  },
  handler: async (req, res) => {
    const { ids } = req.body;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const subCategories = await SubCategory.find({ _id: { $in: objectIds } });

    if (subCategories.length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No subcategories found to delete');
    }

    for (const subCategory of subCategories) {
      if (subCategory.image) {
        await deleteFileFromExternalService(subCategory.image);
      }
    }

    await SubCategory.deleteMany({ _id: { $in: objectIds } });

    res.send({ message: 'Subcategories deleted successfully' });
  },
};

module.exports = {
  createSubCategory,
  getAllSubCategories,
  getSubCategoryById,
  updateSubCategory,
  deleteSubCategory,
  bulkDeleteSubCategories,
};
