const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const { Category, SubCategory, Product } = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');
const mongoose = require('mongoose');

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

const createCategory = {
  validation: {
    body: Joi.object().keys({
      categories_name: Joi.string().trim().required(),
      image: Joi.string().allow(),
      seo_content: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { categories_name } = req.body;

      const categoryExist = await Category.findOne({ categories_name: categories_name.trim() });

      if (categoryExist) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this categories_name already exists' });
      }

      let imageUrl = req.body.image || '';
      if (req.file) {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }

      const seoContent = parseSeoContentInput(req.body.seo_content);

      const category = await Category.create({
        categories_name: categories_name.trim(),
        image: imageUrl,
        seo_content: seoContent,
      });

      return res.status(201).json({
        success: true,
        message: 'Category created successfully!',
        category,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllCategories = {
  handler: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      const skip = (page - 1) * limit;
      
      // Build search query
      let query = {};
      
      // Add search functionality
      if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, 'i');
        query = {
          $or: [
            { categories_name: searchRegex },
            { name: searchRegex }
          ]
        };
      }

      // Add date filters if needed
      if (req.query.date_from || req.query.date_to) {
        query.createdAt = {};
        if (req.query.date_from) {
          query.createdAt.$gte = new Date(req.query.date_from);
        }
        if (req.query.date_to) {
          query.createdAt.$lte = new Date(req.query.date_to);
        }
      }

      const total = await Category.countDocuments(query);
      const categories = await Category.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const transformedData = await Promise.all(
        categories.map(async (cat) => {
          const catId = cat.id || cat._id;

          // Build product count query
          const productQuery = { 
            category_id: String(catId),
            approval_status: 'approved',
            is_visible: true
          };

          // If city is provided, filter by city
          if (req.query.city) {
            const VendorKyc = require('../models').VendorKyc;
            const raw = String(req.query.city).trim();
            const parts = raw.split('-');
            const cityName = parts.length > 1 ? parts[parts.length - 1] : raw;
            const cityNameRegex = new RegExp(String(cityName).trim(), 'i');
            
            const vendors = await VendorKyc.find(
              {
                $or: [
                  { 'ContactDetails.city_id': raw },
                  { 'ContactDetails.city_id': { $regex: cityNameRegex } },
                  { 'ContactDetails.city_name': cityNameRegex },
                ],
              },
              { 'ContactDetails.vendor_id': 1 }
            );
            const vendorIds = vendors.map(v => v.ContactDetails.vendor_id).filter(Boolean);
            
            if (vendorIds.length > 0) {
              productQuery.vendor_id = { $in: vendorIds };
            } else {
              // If no vendors in this city, return 0 count
              const subcategories = await SubCategory.find({ categoryId: catId });
              return {
                categories_id: String(catId),
                categories_name: cat.categories_name || cat.name || '',
                slug: cat.slug || '',
                image: cat.image || '',
                product_count: '0',
                created_at: cat.createdAt,
                updated_at: cat.updatedAt,
                subcategories: subcategories.map((sub) => ({
                  subcategory_id: String(sub.id || sub._id),
                  subcategory_name: sub.name || sub.subcategory_name || '',
                  slug: sub.slug || '',
                  image: sub.image || '',
                  hsnCodes: sub.hsnCodes || [],
                  created_at: sub.createdAt,
                  updated_at: sub.updatedAt,
                  seo_content: formatSeoContentResponse(sub.seo_content),
                })),
                seo_content: formatSeoContentResponse(cat.seo_content),
              };
            }
          }

          // Fetch approved product count for this category
          const productCount = await Product.countDocuments(productQuery);

          // Fetch subcategories for this category
          const subcategories = await SubCategory.find({ categoryId: catId });

          return {
            categories_id: String(catId),
            categories_name: cat.categories_name || cat.name || '',
            slug: cat.slug || '',
            image: cat.image || '',
            product_count: String(productCount),
            created_at: cat.createdAt,
            updated_at: cat.updatedAt,
            subcategories: subcategories.map((sub) => ({
              subcategory_id: String(sub.id || sub._id),
              subcategory_name: sub.name || sub.subcategory_name || '',
              slug: sub.slug || '',
              image: sub.image || '',
              hsnCodes: sub.hsnCodes || [],
              created_at: sub.createdAt,
              updated_at: sub.updatedAt,
              seo_content: formatSeoContentResponse(sub.seo_content),
            })),
            seo_content: formatSeoContentResponse(cat.seo_content),
          };
        })
      );

      res.status(200).json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: transformedData,
      });
    } catch (error) {
      res.status(500).json({ 
        success: false,
        message: error.message 
      });
    }
  },
};
const getCategoryById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      const category = await Category.findById(_id);

      if (!category) {
        return res.status(404).json({ message: 'Category not found' });
      }

      const catId = category.id || category._id;

      // Fetch approved product count for this category
      const productCount = await Product.countDocuments({ 
        category_id: String(catId),
        approval_status: 'approved',
        is_visible: true
      });

      // Fetch subcategories for this category
      const subcategories = await SubCategory.find({ categoryId: catId });

      res.status(200).json({
        categories_id: String(catId),
        categories_name: category.categories_name || category.name || '',
        slug: category.slug || '',
        image: category.image || '',
        product_count: String(productCount),
        created_at: category.createdAt,
        updated_at: category.updatedAt,
        subcategories: subcategories.map((sub) => ({
          subcategory_id: String(sub.id || sub._id),
          subcategory_name: sub.name || sub.subcategory_name || '',
          slug: sub.slug || '',
          image: sub.image || '',
          hsnCodes: sub.hsnCodes || [],
          created_at: sub.createdAt,
          updated_at: sub.updatedAt,
          seo_content: formatSeoContentResponse(sub.seo_content),
        })),
        seo_content: formatSeoContentResponse(category.seo_content),
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateCategory = {
  validation: {
    body: Joi.object()
      .keys({
        categories_name: Joi.string().trim().required(),
        image: Joi.string().allow(),
        seo_content: Joi.alternatives().try(Joi.string(), Joi.object()).optional(),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    const { _id } = req.params;

    const categoryExist = await Category.findById(_id);

    if (!categoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category does not exist');
    }

    if (req.body.categories_name && req.body.categories_name !== categoryExist.categories_name) {
      const samecategories_nameCategory = await Category.findOne({
        categories_name: req.body.categories_name.trim(),
        _id: { $ne: _id },
      });
      if (samecategories_nameCategory) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Category with this categories_name already exists' });
      }
    }

    let imageUrl = req.body.image || categoryExist.image || '';
    if (req.file) {
      if (categoryExist.image) {
        imageUrl = await updateFileOnExternalService(
          categoryExist.image,
          req.file
        );
      } else {
        imageUrl = await uploadToExternalService(req.file, 'categories_image');
      }
    }

    const updateData = {
      categories_name: req.body.categories_name?.trim() || categoryExist.categories_name,
      image: imageUrl,
    };

    if (req.body.seo_content !== undefined) {
      updateData.seo_content = parseSeoContentInput(req.body.seo_content);
    }

    const category = await Category.findByIdAndUpdate(_id, updateData, {
      new: true,
    });

    res.send({
      success: true,
      message: 'Category updated successfully!',
      data: category,
    });
  },
};

const deleteCategory = {
  handler: async (req, res) => {
    const { _id } = req.params;

    const categoryExist = await Category.findById(_id);

    if (!categoryExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category does not exist');
    }

    if (categoryExist.image) {
      await deleteFileFromExternalService(categoryExist.image);
    }

    await Category.findByIdAndDelete(_id);

    res.send({ message: 'Category deleted successfully' });
  },
};

const bulkDeleteCategories = {  
  handler: async (req, res) => {
    const { ids } = req.body;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const categories = await Category.find({ _id: { $in: objectIds } });

    for (const category of categories) {
      if (category.image) {
        await deleteFileFromExternalService(category.image);
      } else {
         await deleteFileFromExternalService(category.image);
       }
    }

    await Category.deleteMany({ _id: { $in: objectIds } });

    res.send({ message: 'Categories deleted successfully' });
  },
};

const migrateSlugs = {
  handler: async (req, res) => {
    try {
      let catCount = 0, subCount = 0, prodCount = 0;

      const categories = await Category.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
      for (const cat of categories) { await cat.save(); catCount++; }

      const subCategories = await SubCategory.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
      for (const sub of subCategories) { await sub.save(); subCount++; }

      const products = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
      for (const prod of products) { await prod.save(); prodCount++; }

      res.status(200).json({ success: true, message: `Migrated ${catCount} categories, ${subCount} subcategories, and ${prodCount} products.` });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = {
  createCategory,
  getAllCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories,
  migrateSlugs
};
