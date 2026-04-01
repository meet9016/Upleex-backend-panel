const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const path = require('path');
const {
  Product,
  ProductType,
  ProductListingType,
  ProductMonth,
  Category,
  SubCategory,
  Wallet,
} = require('../models');
const { handlePagination } = require('../utils/helper');
const {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
} = require('../utils/fileUpload');
const moment = require('moment');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const ListingPlan = require('../models/listingPlan.model');
const walletService = require('../services/wallet.service');
const generateSKU = (categoryName, businessName, counter) => {
  const categoryCode = categoryName.replace(/\s+/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const businessCode = businessName.replace(/\s+/g, '').substring(0, 3).toUpperCase().padEnd(3, 'X');
    const counterCode = counter.toString().padStart(3, '0');
  
  return `${categoryCode}-${businessCode}-${counterCode}`;
};

const getNextSKUCounter = async (vendorId) => {
  try {
    const products = await Product.find({ vendor_id: vendorId }, { sku: 1 }).sort({ createdAt: -1 });
    let maxCounter = 0;
    
    products.forEach(product => {
      if (product.sku) {
        const skuParts = product.sku.split('-');
        if (skuParts.length === 3) {
          const counter = parseInt(skuParts[2], 10);
          if (!isNaN(counter) && counter > maxCounter) {
            maxCounter = counter;
          }
        }
      }
    });
    
    return maxCounter + 1;
  } catch (error) {
    console.error('Error getting next SKU counter:', error);
    return 1;
  }
};

const generateProductSKU = async (vendorId, categoryId) => {
  try {
    // Get vendor business name
    const vendorKyc = await VendorKyc.findOne({ vendor_id: vendorId });
    const businessName = vendorKyc?.business_name || vendorKyc?.full_name || 'Vendor';
    
    // Get category name
    const category = await Category.findById(categoryId);
    const categoryName = category?.categories_name || 'Category';
    
    // Get next counter
    const counter = await getNextSKUCounter(vendorId);
    
    // Generate SKU
    const sku = generateSKU(categoryName, businessName, counter);
    
    // Check if SKU already exists (rare case)
    const existingSKU = await Product.findOne({ sku });
    if (existingSKU) {
      // If exists, try with next counter
      const nextCounter = counter + 1;
      return generateSKU(categoryName, businessName, nextCounter);
    }
    
    return sku;
  } catch (error) {
    console.error('Error generating SKU:', error);
    // Fallback SKU
    const timestamp = Date.now().toString().slice(-6);
    return `GEN-VEN-${timestamp}`;
  }
};

const productDetailSchema = Joi.object().keys({
  specification_id: Joi.string().allow(''),
  specification: Joi.string().allow(''),
  detail: Joi.string().allow(''),
});

const productImageSchema = Joi.object().keys({
  product_image_id: Joi.string().allow(''),
  image: Joi.string().allow(''),
});

const monthPriceSchema = Joi.object().keys({
  month_name:Joi.string().allow(''),
  price: Joi.string().allow(''),
  cancel_price: Joi.string().allow(''),
  months_id: Joi.string().allow(''),
  product_months_id: Joi.string().allow(''),
});

const productTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  product_type: Joi.string().trim().required(),
});

const productListingTypeDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  name: Joi.string().trim().required(),
});

const productMonthDropdownSchema = Joi.object().keys({
  id: Joi.string().allow(''),
  month_name: Joi.string().trim().required(),
});

const productTypeIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const productListingTypeIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const productMonthIdSchema = Joi.object().keys({
  id: Joi.string().required(),
});

const createProduct = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().allow(''),
      category_id: Joi.string().required(),
      sub_category_id: Joi.string().required(),
      product_type_id: Joi.string().required(),
      product_listing_type_id: Joi.string().allow(''),
      product_name: Joi.string().trim().required(),
      sku: Joi.string().trim().allow(''),
      price: Joi.string().allow(''),
      cancel_price: Joi.string().allow(''),
      description: Joi.string().allow(''),
      product_main_image: Joi.string().allow(''),
      category_name: Joi.string().allow(''),
      sub_category_name: Joi.string().allow(''),
      no: Joi.string().allow(''),
      product_type_name: Joi.string().allow(''),
      product_listing_type_name: Joi.string().allow(''),
      // vendor_id: Joi.string().allow(''),
      // vendor_name: Joi.string().allow(''),
      // vendor_image: Joi.string().allow(''),
      month_arr: Joi.array().items(monthPriceSchema).default([]),
      images: Joi.array().items(productImageSchema).default([]),
      product_details: Joi.array().items(productDetailSchema).default([]),
      specification: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      detail: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      months_id: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      month_price: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      month_cancel_price: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      product_months_id: Joi.alternatives().try(
        Joi.array().items(Joi.string().allow('')),
        Joi.string().allow('')
      ).default([]),
      is_new: Joi.boolean().default(false),
      deposit_amount: Joi.string().allow('').default('0'),
      available_quantity: Joi.number().integer().min(0).default(1),
      pricing_type: Joi.string().valid('free', 'paid').default('paid'),
      is_visible: Joi.boolean().default(true),
    }).prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const data = req.body;

      // Automatically add vendor info from the authenticated user token
      if (req.user) {
        data.vendor_id = req.user.id || req.user._id || '';
        data.vendor_name = req.user.name || '';
        // If you have a vendor model to fetch image, you could do it here, 
        // but for now we'll just use what's in the token or leave it empty.
        console.log('Vendor info attached to product:', { id: data.vendor_id, name: data.vendor_name });
      }

      if (!data.vendor_id) {
        return res.status(401).json({ message: 'Vendor authentication required' });
      }

      // Generate SKU if not provided
      if (!data.sku || !data.sku.trim()) {
        data.sku = await generateProductSKU(data.vendor_id, data.category_id);
      } else {
        // Check if provided SKU already exists
        const existingSKU = await Product.findOne({ sku: data.sku.trim() });
        if (existingSKU) {
          return res.status(httpStatus.BAD_REQUEST).json({ 
            message: 'SKU already exists. Please use a different SKU.' 
          });
        }
        data.sku = data.sku.trim();
      }

      // ───────────────────────────────────────────────
      //          pricing_type handling + validation
      // ───────────────────────────────────────────────
      const pricingType = (data.pricing_type || 'paid').toLowerCase();

      if (!['free', 'paid'].includes(pricingType)) {
        return res.status(400).json({ message: 'Invalid pricing_type. Use "free" or "paid"' });
      }

      data.pricing_type = pricingType;  // normalized value store કરીએ

      // ───────────────────────────────────────────────
      //     Remove wallet deduction from product creation
      //     Money will be deducted only after admin approval
      // ───────────────────────────────────────────────
      // Wallet deduction logic removed - will be handled in approval process

      // ───────────────────────────────────────────────
      //     Free limit check → ફક્ત free products માટે
      // ───────────────────────────────────────────────
      if (pricingType === 'free') {
        let limit = 1;
        const kyc = await VendorKyc.findOne({ vendor_id: String(data.vendor_id) });
        const hasGST = !!(kyc && String(kyc.gst_number || '').trim());
        limit = hasGST ? 3 : 1;

        const startOfMonth = moment().startOf('month').toDate();
        const endOfMonth = moment().endOf('month').toDate();

        const activeFreeCount = await Product.countDocuments({
          vendor_id: data.vendor_id,
          status: 'active',
          pricing_type: 'free',           // ← મહત્વની લાઈન
          createdAt: { $gte: startOfMonth, $lte: endOfMonth },
        });

        if (activeFreeCount >= limit) {
          return res.status(httpStatus.BAD_REQUEST).json({
            message: `Free listing limit reached (${activeFreeCount}/${limit}) for this month. Upgrade to paid plan for Base listings.`
          });
        }
      }

      const extractIndexedArray = (body, baseKey) => {
        const regex = new RegExp(`^${baseKey}\\[(\\d+)\\]$`);
        const result = [];
        Object.keys(body).forEach((k) => {
          const m = k.match(regex);
          if (m) {
            const idx = parseInt(m[1], 10);
            result[idx] = body[k];
          }
        });
        if (!result.length && body[baseKey]) {
          return Array.isArray(body[baseKey]) ? body[baseKey] : [body[baseKey]];
        }
        return result.filter((v) => v !== undefined);
      };

      if (!data.month_arr || !Array.isArray(data.month_arr) || !data.month_arr.length) {
        const monthsIds = extractIndexedArray(data, 'months_id');
        const monthPrices = extractIndexedArray(data, 'month_price');
        const monthCancelPrices = extractIndexedArray(data, 'month_cancel_price');
        const productMonthsIds = extractIndexedArray(data, 'product_months_id');

        if (monthsIds.length || monthPrices.length || monthCancelPrices.length) {
          data.month_arr = (monthsIds.length ? monthsIds : new Array(Math.max(monthPrices.length, monthCancelPrices.length)).fill(''))
            .map((mid, i) => ({
              months_id: String(mid || ''),
              price: String(monthPrices[i] || ''),
              cancel_price: String(monthCancelPrices[i] || ''),
              product_months_id: String(productMonthsIds[i] || ''),
            }))
            .filter((m) => m.months_id || (m.price && m.cancel_price));
        }
      }

      if (!data.product_details || !Array.isArray(data.product_details) || !data.product_details.length) {
        const specs = extractIndexedArray(data, 'specification');
        const details = extractIndexedArray(data, 'detail');
        const specIds = extractIndexedArray(data, 'specification_id');
        if (specs.length || details.length) {
          data.product_details = (specs.length ? specs : new Array(details.length).fill(''))
            .map((spec, i) => ({
              specification_id: String(specIds[i] || ''),
              specification: String(spec || ''),
              detail: String(details[i] || ''),
            }))
            .filter((d) => d.specification || d.detail);
        }
      }
      const files = req.files || {};
      const mainFile = files['product_main_image'] && files['product_main_image'][0];
      if (mainFile) {
        data.product_main_image = await uploadToExternalService(mainFile, 'product_main_images');
      }
      const subFiles = files['image'] || [];
      if (subFiles.length) {
        const newImages = [];
        for (const f of subFiles) {
          const url = await uploadToExternalService(f, 'product_images');
          newImages.push({
            product_image_id: String(Date.now() + Math.floor(Math.random() * 1000)),
            image: url,
          });
        }
        data.images = Array.isArray(data.images) ? [...data.images, ...newImages] : newImages;
      }
      if (data.month_arr && data.month_arr.length) {

        const monthIds = data.month_arr.map(m => m.months_id);

        const monthDocs = await ProductMonth.find({
          _id: { $in: monthIds }
        });

        const monthMap = {};
        monthDocs.forEach(m => {
          monthMap[m._id.toString()] = m.month_name;
        });

        data.month_arr = data.month_arr.map(m => ({
          month_name: monthMap[m.months_id] || '',
          price: m.price,
          cancel_price: m.cancel_price,
          months_id: m.months_id,
          product_months_id: m.months_id
        }));
      }

      if (data.product_type_id) {
        const typeDoc = await ProductType.findById(data.product_type_id);
        if (typeDoc) {
          data.product_type_name = typeDoc.product_type;
        }
      }

      // Convert empty string to null for ObjectId field
      if (!data.product_listing_type_id || data.product_listing_type_id === '') {
        data.product_listing_type_id = null;
      } else {
        const listingDoc = await ProductListingType.findById(
          data.product_listing_type_id
        );
        if (listingDoc) {
          data.product_listing_type_name = listingDoc.name;
        }
      }
      if (data.category_id) {
        const catDoc = await Category.findById(data.category_id);
        if (catDoc) {
          data.category_name = catDoc.categories_name;
        }
      }
      if (data.sub_category_id) {
        const subDoc = await SubCategory.findById(data.sub_category_id);
        if (subDoc) {
          data.sub_category_name = subDoc.name;
        }
      }

      const isRent = data.product_type_name === 'Rent';
      const tenure = (data.product_listing_type_name || '').toLowerCase();
      const hasMonthlyRows =
        Array.isArray(data.month_arr) &&
        data.month_arr.some(
          (m) => (m.months_id && (m.price || m.cancel_price))
        );
      const isMonthly = tenure === 'monthly' || hasMonthlyRows;
      if (isRent) {
        if (isMonthly) {
          if (!data.month_arr || !data.month_arr.length) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: 'Provide monthly prices (month_arr) for Monthly rent' });
          }
        } else {
          if (!data.price || !String(data.price).trim()) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: 'Price is required for Day/Hourly rent' });
          }
        }
      } else {
        if (!data.price || !String(data.price).trim()) {
          return res.status(httpStatus.BAD_REQUEST).json({ message: 'Price is required for Sell' });
        }
      }
      const existing = await Product.findOne({
        product_name: data.product_name,
        category_id: data.category_id,
        sub_category_id: data.sub_category_id,
      });

      if (existing) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Product with this name already exists' });
      }

      // Set expiry date to 1 month from creation date
      const expiryDate = new Date();
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      data.expires_at = expiryDate;
      data.status = 'active';
      data.approval_status = 'pending'; // Set to pending for admin approval
      
      // Set initial stock status
      if (data.product_type_name === 'Sell' && data.available_quantity) {
        data.is_out_of_stock = Number(data.available_quantity) <= 0;
      }

      const product = await Product.create(data);

      if (!product.product_id) {
        product.product_id = product.id;
        await product.save();
      }

      const msg = product.status === 'draft'
        ? 'Free listing limit reached: listing saved as Draft'
        : 'Product created successfully and submitted for admin approval';
      return res.status(200).json({
        status: 200,
        message: msg,
        data: product,
      });
    } catch (error) {
      console.error('Create product error:', error);
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllProducts = {
  handler: async (req, res) => {
    const {
      category_id,
      sub_category_id,
      filter_rent_sell,
      filter_tenure,
      search,
      vendor_id: queryVendorId,
      status: queryStatus,
      approval_status,
      product_type,
      listing_type,
      price_min,
      price_max,
      city,
      sort_by,
      sort_order
    } = req.query;

    const bodyVendorId = req.body.vendor_id;
    const vendor_id = queryVendorId || bodyVendorId;
    const bodyStatus = req.body.status;
    const statusFilter = queryStatus || bodyStatus;

    const query = {};

    // 1. If explicit vendor_id is passed in query or body, use it
    if (vendor_id) {
      query.vendor_id = vendor_id;
    } 
    // 2. If user is logged in AND it's a vendor, only show their products
    else if (req.user && req.user.userType === 'vendor') {
      query.vendor_id = req.user.id || req.user._id;
    }
    // 3. If no vendor_id and not a vendor, show only approved and visible products (for user panel)
    else {
      query.approval_status = 'approved';
      query.is_visible = true;
    }

    // Only show approved and visible products for public/user queries
    if (!req.user || req.user.userType !== 'vendor') {
      query.approval_status = 'approved';
      query.is_visible = true;
    }

    // Multiple filter support
    const searchConditions = [];
    
    // Add search functionality
    if (search && search.trim() !== '') {
      const searchRegex = new RegExp(search.trim(), 'i');
      searchConditions.push({
        $or: [
          { product_name: searchRegex },
          { description: searchRegex },
          { product_type_name: searchRegex },
          { category_name: searchRegex },
          { sub_category_name: searchRegex },
          { brand: searchRegex },
          { model: searchRegex },
          { sku: searchRegex },
          { tags: { $in: [searchRegex] } }
        ]
      });
    }

    // Category filter
    if (category_id) {
      const categoryIds = Array.isArray(category_id) ? category_id : category_id.split(',');
      query.category_id = { $in: categoryIds };
    }

    // Sub-category filter
    if (sub_category_id && sub_category_id !== 'all') {
      const subCategoryIds = Array.isArray(sub_category_id) ? sub_category_id : sub_category_id.split(',');
      query.sub_category_id = { $in: subCategoryIds };
    }

    // Status filter
    if (statusFilter) {
      const statusValues = Array.isArray(statusFilter) ? statusFilter : statusFilter.split(',');
      const validStatuses = statusValues.filter(s => ['active', 'draft', 'inactive'].includes(String(s)));
      if (validStatuses.length > 0) {
        query.status = validStatuses.length === 1 ? validStatuses[0] : { $in: validStatuses };
      }
    }

    // Approval status filter
    if (approval_status) {
      const approvalValues = Array.isArray(approval_status) ? approval_status : approval_status.split(',');
      query.approval_status = approvalValues.length === 1 ? approvalValues[0] : { $in: approvalValues };
    }

    // Product type filter (Rent/Sell)
    if (filter_rent_sell || product_type) {
      const typeFilter = filter_rent_sell || product_type;
      const typeValues = Array.isArray(typeFilter) ? typeFilter : typeFilter.split(',');
      const types = typeValues.map(t => t === '1' ? 'Rent' : t === '2' ? 'Sell' : t);
      query.product_type_name = types.length === 1 ? types[0] : { $in: types };
    }

    // Listing type filter (tenure)
    if (filter_tenure || listing_type) {
      const tenureFilter = filter_tenure || listing_type;
      const tenureValues = Array.isArray(tenureFilter) ? tenureFilter : tenureFilter.split(',');
      const tenureMap = { '1': 'Daily', '2': 'Monthly', '3': 'Hourly' };
      
      const tenureNames = tenureValues.map(t => tenureMap[t] || t).filter(Boolean);
      if (tenureNames.length > 0) {
        query.$or = query.$or || [];
        query.$or.push(
          { product_listing_type_name: tenureNames.length === 1 ? tenureNames[0] : { $in: tenureNames } },
          { product_listing_type_id: tenureValues.length === 1 ? tenureValues[0] : { $in: tenureValues } }
        );
      }
    }

    // Price range filter
    if (price_min || price_max) {
      query.price = {};
      if (price_min) query.price.$gte = Number(price_min);
      if (price_max) query.price.$lte = Number(price_max);
    }

    // City filter
    if (city) {
      searchConditions.push({ vendor_city_name: new RegExp(city, 'i') });
    }

    // Combine search conditions with AND logic
    if (searchConditions.length > 0) {
      query.$and = (query.$and || []).concat(searchConditions);
    }

    try {
      const pageNum = Math.max(parseInt(req.query.page || req.body.page) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(req.query.limit || req.body.limit) || 20, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      console.log("Product query:", JSON.stringify(query, null, 2));

      // Sorting
      let sortOptions = { createdAt: -1 }; // default sort
      if (sort_by) {
        const sortOrder = sort_order === 'asc' ? 1 : -1;
        switch (sort_by) {
          case 'price':
            sortOptions = { price: sortOrder };
            break;
          case 'name':
            sortOptions = { product_name: sortOrder };
            break;
          case 'date':
            sortOptions = { createdAt: sortOrder };
            break;
          case 'popularity':
            sortOptions = { views: sortOrder };
            break;
          default:
            sortOptions = { createdAt: -1 };
        }
      }

      const total = await Product.countDocuments(query);
      let dataQuery = Product.find(query).sort(sortOptions);

      if (limitNum) {
        dataQuery = dataQuery.skip(skip).limit(limitNum);
      }
      
      const data = await dataQuery;
      
      const catIds = [
        ...new Set(
          data.map((p) => p.category_id).filter((id) => !!id)
        ),
      ];
      const subIds = [
        ...new Set(
          data.map((p) => p.sub_category_id).filter((id) => !!id)
        ),
      ];
      
      const [cats, subs] = await Promise.all([
        catIds.length ? Category.find({ _id: { $in: catIds } }) : [],
        subIds.length ? SubCategory.find({ _id: { $in: subIds } }) : [],
      ]);
      
      const catMap = {};
      cats.forEach((c) => {
        catMap[c._id.toString()] = c.categories_name;
      });
      
      const subMap = {};
      subs.forEach((s) => {
        subMap[s._id.toString()] = s.name;
      });
      
      // Enrich with vendor KYC details: city_id and city_name
      const vendorIds = [...new Set(data.map((p) => p.vendor_id).filter((id) => !!id))];
      let vendorMap = {};
      if (vendorIds.length) {
        const kycs = await VendorKyc.find({ vendor_id: { $in: vendorIds } }, { vendor_id: 1, city_id: 1, city_name: 1, full_name: 1, business_name: 1 });
        kycs.forEach((k) => {
          vendorMap[String(k.vendor_id)] = {
            city_id: k.city_id || '',
            city_name: k.city_name || '',
            vendor_name: (k.business_name || k.full_name || ''),
          };
        });
      }
      // Auto-draft expired listings
      const now = new Date();
      for (const p of data) {
        if (p.expires_at && now > new Date(p.expires_at) && p.status !== 'draft') {
          p.status = 'draft';
          await p.save();
        }
      }
      const normalized = data.map((p) => {
        const v = vendorMap[String(p.vendor_id)] || {};
        return {
          ...p.toObject(),
          category_name: p.category_name || catMap[p.category_id] || '',
          sub_category_name: p.sub_category_name || subMap[p.sub_category_id] || '',
          vendor_name: p.vendor_name || v.vendor_name || '',
          vendor_city_id: v.city_id || '',
          vendor_city_name: v.city_name || '',
        };
      });
      
      res.status(200).json({
        success: true,
        total,
        page: limitNum ? pageNum : 1,
        limit: limitNum || total,
        totalPages: limitNum ? Math.ceil(total / limitNum) : 1,
        data: normalized,
      });
    } catch (error) {
      console.error("Error in getAllProducts:", error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  },
};
const getVendorProducts = {
  validation: {
    body: Joi.object().keys({
      vendor_id: Joi.string().required(),
      category_id: Joi.string().allow(''),
      sub_category_id: Joi.string().allow(''),
      filter_rent_sell: Joi.string().valid('1', '2').allow(''),
      filter_tenure: Joi.string().allow(''),
      search: Joi.string().allow(''),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(100),
    }),
  },
  handler: async (req, res) => {
    const {
      vendor_id,
      category_id,
      sub_category_id,
      filter_rent_sell,
      filter_tenure,
      search,
    } = req.body;

    const query = { vendor_id };

    // Only show approved and visible products for public vendor listings
    if (!req.user || req.user.userType !== 'vendor' || req.user.id !== vendor_id) {
      query.approval_status = 'approved';
      query.is_visible = true;
    }

    if (search && String(search).trim() !== '') {
      const searchRegex = new RegExp(String(search).trim(), 'i');
      query.$or = [
        { product_name: searchRegex },
        { description: searchRegex },
        { product_type_name: searchRegex },
        { category_name: searchRegex },
        { sub_category_name: searchRegex },
      ];
    }

    if (category_id) {
      query.category_id = category_id;
    }
    if (sub_category_id && sub_category_id !== 'all') {
      query.sub_category_id = sub_category_id;
    }
    if (filter_rent_sell === '1') {
      query.product_type_name = 'Rent';
    } else if (filter_rent_sell === '2') {
      query.product_type_name = 'Sell';
    }
    if (filter_tenure && filter_tenure !== '0') {
      const tenureMap = { '1': 'Daily', '2': 'Monthly', '3': 'Hourly' };
      const tenureName = tenureMap[filter_tenure];
      if (tenureName) {
        const orArr = query.$or ? [...query.$or] : [];
        orArr.push({ product_listing_type_id: filter_tenure });
        orArr.push({ product_listing_type_name: tenureName });
        query.$or = orArr;
      } else {
        query.product_listing_type_id = filter_tenure;
      }
    }

    try {
      const page = parseInt(req.body.page) || 1;
      const limit = req.body.limit ? parseInt(req.body.limit) : 10;
      const skip = (page - 1) * limit;

      const total = await Product.countDocuments(query);
      let dataQuery = Product.find(query).sort({ createdAt: -1 });
      if (limit) {
        dataQuery = dataQuery.skip(skip).limit(limit);
      }
      const data = await dataQuery;

      const catIds = [
        ...new Set(data.map((p) => p.category_id).filter((id) => !!id)),
      ];
      const subIds = [
        ...new Set(data.map((p) => p.sub_category_id).filter((id) => !!id)),
      ];
      const [cats, subs] = await Promise.all([
        catIds.length ? Category.find({ _id: { $in: catIds } }) : [],
        subIds.length ? SubCategory.find({ _id: { $in: subIds } }) : [],
      ]);
      const catMap = {};
      cats.forEach((c) => {
        catMap[c._id.toString()] = c.categories_name;
      });
      const subMap = {};
      subs.forEach((s) => {
        subMap[s._id.toString()] = s.name;
      });
      // Enrich with vendor KYC details: city_id and city_name
      const vendorIds = [...new Set(data.map((p) => p.vendor_id).filter((id) => !!id))];
      let vendorMap = {};
      if (vendorIds.length) {
        const kycs = await VendorKyc.find({ vendor_id: { $in: vendorIds } }, { vendor_id: 1, city_id: 1, city_name: 1, full_name: 1, business_name: 1 });
        kycs.forEach((k) => {
          vendorMap[String(k.vendor_id)] = {
            city_id: k.city_id || '',
            city_name: k.city_name || '',
            vendor_name: (k.business_name || k.full_name || ''),
          };
        });
      }
      // Auto-draft expired listings
      const now = new Date();
      for (const p of data) {
        if (p.expires_at && now > new Date(p.expires_at) && p.status !== 'draft') {
          p.status = 'draft';
          await p.save();
        }
      }
      const normalized = data.map((p) => {
        const v = vendorMap[String(p.vendor_id)] || {};
        return {
          ...p.toObject(),
          category_name: p.category_name || catMap[p.category_id] || '',
          sub_category_name: p.sub_category_name || subMap[p.sub_category_id] || '',
          vendor_name: p.vendor_name || v.vendor_name || '',
          vendor_city_id: v.city_id || '',
          vendor_city_name: v.city_name || '',
        };
      });

      res.status(200).json({
        success: true,
        total,
        page: limit ? page : 1,
        limit: limit || total,
        totalPages: limit ? Math.ceil(total / limit) : 1,
        data: normalized,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  },
};
const getProductById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      let product;

      if (mongoose.Types.ObjectId.isValid(_id)) {
        product = await Product.findById(_id);
      } else {
        product = await Product.findOne({ product_id: _id });
      }

      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }

      res.status(200).json({ status: 200, data: product });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateProduct = {
  validation: {
    body: Joi.object()
      .keys({
        product_id: Joi.string().allow(''),
        category_id: Joi.string().required(),
        sub_category_id: Joi.string().required(),
        product_type_id: Joi.string().required(),
        product_listing_type_id: Joi.string().allow(''),
        product_name: Joi.string().trim().required(),
        sku: Joi.string().trim().allow(''),
        price: Joi.string().allow(''),
        cancel_price: Joi.string().allow(''),
        description: Joi.string().allow(''),
        product_main_image: Joi.string().allow(''),
        category_name: Joi.string().allow(''),
        sub_category_name: Joi.string().allow(''),
        no: Joi.string().allow(''),
        product_type_name: Joi.string().allow(''),
        product_listing_type_name: Joi.string().allow(''),
        // vendor_id: Joi.string().allow(''),
        // vendor_name: Joi.string().allow(''),
        // vendor_image: Joi.string().allow(''),
        month_arr: Joi.array().items(monthPriceSchema).default([]),
        images: Joi.array().items(productImageSchema).default([]),
        product_details: Joi.array().items(productDetailSchema).default([]),
        specification: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
        detail: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
        months_id: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
        month_price: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
        month_cancel_price: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
        product_months_id: Joi.alternatives().try(
          Joi.array().items(Joi.string().allow('')),
          Joi.string().allow('')
        ).default([]),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid product id' });
      }

      const existing = await Product.findById(_id);

      if (!existing) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Authorization check: Only the vendor who created the product can update it
      if (req.user && existing.vendor_id && existing.vendor_id !== req.user.id) {
        return res.status(httpStatus.FORBIDDEN).json({ message: 'You do not have permission to update this product' });
      }

      const body = req.body;

      // Prevent changing vendor info via update
      delete body.vendor_id;
      delete body.vendor_name;

      // Handle SKU update
      if (body.sku && body.sku.trim()) {
        const trimmedSKU = body.sku.trim();
        // Check if SKU is being changed and if new SKU already exists
        if (trimmedSKU !== existing.sku) {
          const existingSKU = await Product.findOne({ 
            sku: trimmedSKU, 
            _id: { $ne: _id } 
          });
          if (existingSKU) {
            return res.status(httpStatus.BAD_REQUEST).json({ 
              message: 'SKU already exists. Please use a different SKU.' 
            });
          }
        }
        body.sku = trimmedSKU;
      }

      const extractIndexedArray = (body, baseKey) => {
        const regex = new RegExp(`^${baseKey}\\[(\\d+)\\]$`);
        const result = [];
        Object.keys(body).forEach((k) => {
          const m = k.match(regex);
          if (m) {
            const idx = parseInt(m[1], 10);
            result[idx] = body[k];
          }
        });
        if (!result.length && body[baseKey]) {
          return Array.isArray(body[baseKey]) ? body[baseKey] : [body[baseKey]];
        }
        return result.filter((v) => v !== undefined);
      };

      if (!body.month_arr || !Array.isArray(body.month_arr) || !body.month_arr.length) {
        const monthsIds = extractIndexedArray(body, 'months_id');
        const monthPrices = extractIndexedArray(body, 'month_price');
        const monthCancelPrices = extractIndexedArray(body, 'month_cancel_price');
        const productMonthsIds = extractIndexedArray(body, 'product_months_id');

        if (monthsIds.length || monthPrices.length || monthCancelPrices.length) {
          body.month_arr = (monthsIds.length ? monthsIds : new Array(Math.max(monthPrices.length, monthCancelPrices.length)).fill(''))
            .map((mid, i) => ({
              months_id: String(mid || ''),
              price: String(monthPrices[i] || ''),
              cancel_price: String(monthCancelPrices[i] || ''),
              product_months_id: String(productMonthsIds[i] || ''),
            }))
            .filter((m) => m.months_id || (m.price && m.cancel_price));
        }
      }

      if (!body.product_details || !Array.isArray(body.product_details) || !body.product_details.length) {
        const specs = extractIndexedArray(body, 'specification');
        const details = extractIndexedArray(body, 'detail');
        const specIds = extractIndexedArray(body, 'specification_id');
        if (specs.length || details.length) {
          body.product_details = (specs.length ? specs : new Array(details.length).fill(''))
            .map((spec, i) => ({
              specification_id: String(specIds[i] || ''),
              specification: String(spec || ''),
              detail: String(details[i] || ''),
            }))
            .filter((d) => d.specification || d.detail);
        }
      }
      const files = req.files || {};
      const mainFile = files['product_main_image'] && files['product_main_image'][0];
      if (mainFile) {
        if (existing.product_main_image) {
          body.product_main_image = await updateFileOnExternalService(existing.product_main_image, mainFile);
        } else {
          body.product_main_image = await uploadToExternalService(mainFile, 'product_main_images');
        }
      }
      const subFiles = files['image'] || [];
      if (subFiles.length) {
        const newImages = [];
        for (const f of subFiles) {
          const url = await uploadToExternalService(f, 'product_images');
          newImages.push({
            product_image_id: String(Date.now()),
            image: url,
          });
        }
        body.images = Array.isArray(body.images) ? [...body.images, ...newImages] : newImages;
      }

      if (body.month_arr && body.month_arr.length) {
        const monthIds = body.month_arr.map((m) => m.months_id);

        const monthDocs = await ProductMonth.find({
          _id: { $in: monthIds },
        });

        const monthMap = {};
        monthDocs.forEach((m) => {
          monthMap[m._id.toString()] = m.month_name;
        });

        body.month_arr = body.month_arr.map((m) => ({
          month_name: monthMap[m.months_id] || '',
          price: m.price,
          cancel_price: m.cancel_price,
          months_id: m.months_id,
          product_months_id: m.months_id,
        }));
      }

      if (body.product_type_id) {
        const typeDoc = await ProductType.findById(body.product_type_id);
        if (typeDoc) {
          body.product_type_name = typeDoc.product_type;
        }
      }

      // Convert empty string to null for ObjectId field
      if (!body.product_listing_type_id || body.product_listing_type_id === '') {
        body.product_listing_type_id = null;
      } else {
        const listingDoc = await ProductListingType.findById(
          body.product_listing_type_id
        );
        if (listingDoc) {
          body.product_listing_type_name = listingDoc.name;
        }
      }
      if (body.category_id) {
        const catDoc = await Category.findById(body.category_id);
        if (catDoc) {
          body.category_name = catDoc.categories_name;
        }
      }
      if (body.sub_category_id) {
        const subDoc = await SubCategory.findById(body.sub_category_id);
        if (subDoc) {
          body.sub_category_name = subDoc.name;
        }
      }

      const isRent = body.product_type_name === 'Rent';
      const tenure = (body.product_listing_type_name || '').toLowerCase();
      const hasMonthlyRows =
        Array.isArray(body.month_arr) &&
        body.month_arr.some(
          (m) => (m.months_id && (m.price || m.cancel_price))
        );
      const isMonthly = tenure === 'monthly' || hasMonthlyRows;
      if (isRent) {
        if (isMonthly) {
          if (!body.month_arr || !body.month_arr.length) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: 'Provide monthly prices (month_arr) for Monthly rent' });
          }
        } else {
          if (!body.price || !String(body.price).trim()) {
            return res.status(httpStatus.BAD_REQUEST).json({ message: 'Price is required for Day/Hourly rent' });
          }
        }
      } else {
        if (!body.price || !String(body.price).trim()) {
          return res.status(httpStatus.BAD_REQUEST).json({ message: 'Price is required for Sell' });
        }
      }

      const duplicate = await Product.findOne({
        _id: { $ne: _id },
        product_name: body.product_name,
        category_id: body.category_id,
        sub_category_id: body.sub_category_id,
      });

      if (duplicate) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'Product with this name already exists',
        });
      }

      const updateData = {
        ...body,
      };

      const product = await Product.findByIdAndUpdate(_id, updateData, {
        new: true,
      });

      return res.status(200).json({
        status: 200,
        message: 'Product updated successfully',
        data: product,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteProduct = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid product id' });
      }

      const existing = await Product.findById(_id);

      if (!existing) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Authorization check: Only the vendor who created the product can delete it
      if (req.user && existing.vendor_id && existing.vendor_id !== req.user.id) {
        return res.status(httpStatus.FORBIDDEN).json({ message: 'You do not have permission to delete this product' });
      }

      if (existing.product_main_image) {
        await deleteFileFromExternalService(existing.product_main_image);
      }
      if (existing.images && existing.images.length) {
        for (const img of existing.images) {
          if (img.image) {
            await deleteFileFromExternalService(img.image);
          }
        }
      }

      await Product.findByIdAndDelete(_id);

      res.send({ message: 'Product deleted successfully' });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const buildDropdownResponse = async () => {
  const [types, listingTypes, months] = await Promise.all([
    ProductType.find().sort({ createdAt: 1 }),
    ProductListingType.find().sort({ createdAt: 1 }),
    ProductMonth.find().sort({ createdAt: 1 }),
  ]);

  return {
    products_type: types.map((t) => ({
      id: t.id,
      product_type: t.product_type,
    })),
    products_listing_type: listingTypes.map((lt) => ({
      id: lt.id,
      name: lt.name,
    })),
    products_months: months.map((m) => ({
      id: m.id,
      month_name: m.month_name,
    })),
  };
};

const getProductDropdowns = {
  handler: async (req, res) => {
    try {
      const data = await buildDropdownResponse();
      res.status(200).json(data);
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const createProductDropdowns = {
  validation: {
    body: Joi.object().keys({
      products_type: Joi.array()
        .items(productTypeDropdownSchema)
        .default([]),
      products_listing_type: Joi.array()
        .items(productListingTypeDropdownSchema)
        .default([]),
      products_months: Joi.array()
        .items(productMonthDropdownSchema)
        .default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        const docs = productsType.map((t) => ({
          product_type: t.product_type.trim(),
        }));
        await ProductType.insertMany(docs);
      }

      if (productsListingType && productsListingType.length) {
        const docs = productsListingType.map((lt) => ({
          name: lt.name.trim(),
        }));
        await ProductListingType.insertMany(docs);
      }

      if (productsMonths && productsMonths.length) {
        const docs = productsMonths.map((m) => ({
          month_name: m.month_name.trim(),
        }));
        await ProductMonth.insertMany(docs);
      }

      const data = await buildDropdownResponse();

      return res.status(201).json({
        success: true,
        message: 'Product dropdowns created successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateProductDropdowns = {
  validation: {
    body: Joi.object()
      .keys({
        products_type: Joi.array()
          .items(productTypeDropdownSchema)
          .default([]),
        products_listing_type: Joi.array()
          .items(productListingTypeDropdownSchema)
          .default([]),
        products_months: Joi.array()
          .items(productMonthDropdownSchema)
          .default([]),
      })
      .prefs({ convert: true }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        for (const t of productsType) {
          if (t.id) {
            await ProductType.findByIdAndUpdate(
              t.id,
              { product_type: t.product_type.trim() },
              { new: true }
            );
          } else {
            await ProductType.create({
              product_type: t.product_type.trim(),
            });
          }
        }
      }

      if (productsListingType && productsListingType.length) {
        for (const lt of productsListingType) {
          if (lt.id) {
            await ProductListingType.findByIdAndUpdate(
              lt.id,
              { name: lt.name.trim() },
              { new: true }
            );
          } else {
            await ProductListingType.create({
              name: lt.name.trim(),
            });
          }
        }
      }

      if (productsMonths && productsMonths.length) {
        for (const m of productsMonths) {
          if (m.id) {
            await ProductMonth.findByIdAndUpdate(
              m.id,
              { month_name: m.month_name.trim() },
              { new: true }
            );
          } else {
            await ProductMonth.create({
              month_name: m.month_name.trim(),
            });
          }
        }
      }

      const data = await buildDropdownResponse();

      return res.send({
        success: true,
        message: 'Product dropdowns updated successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteProductDropdowns = {
  validation: {
    body: Joi.object().keys({
      products_type: Joi.array().items(productTypeIdSchema).default([]),
      products_listing_type: Joi.array()
        .items(productListingTypeIdSchema)
        .default([]),
      products_months: Joi.array().items(productMonthIdSchema).default([]),
    }),
  },
  handler: async (req, res) => {
    try {
      const {
        products_type: productsType,
        products_listing_type: productsListingType,
        products_months: productsMonths,
      } = req.body;

      if (productsType && productsType.length) {
        const ids = productsType.map((t) => t.id);
        await ProductType.deleteMany({ _id: { $in: ids } });
      }

      if (productsListingType && productsListingType.length) {
        const ids = productsListingType.map((lt) => lt.id);
        await ProductListingType.deleteMany({ _id: { $in: ids } });
      }

      if (productsMonths && productsMonths.length) {
        const ids = productsMonths.map((m) => m.id);
        await ProductMonth.deleteMany({ _id: { $in: ids } });
      }

      const data = await buildDropdownResponse();

      return res.send({
        success: true,
        message: 'Product dropdowns deleted successfully',
        ...data,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};


const webProductSuggestionList = {
  validation: {
    body: Joi.object().keys({
      search: Joi.string().trim().required(),
      city: Joi.string().allow(''),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(100),
    }),
  },
  handler: async (req, res) => {
    const { search, city } = req.body;
    const page = parseInt(req.body.page) || 1;
    const limit = req.body.limit ? parseInt(req.body.limit) : 10;
    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(String(search).trim(), 'i');
    let vendorFilterIds = null;
    if (city && String(city).trim() !== '') {
      const raw = String(city).trim();
      const parts = raw.split('-');
      const cityName = parts.length > 1 ? parts[parts.length - 1] : raw;
      const cityNameRegex = new RegExp(String(cityName).trim(), 'i');
      const vendors = await VendorKyc.find(
        {
          $or: [
            { city_id: raw },
            { city_id: { $regex: cityNameRegex } },
            { city_name: { $regex: cityNameRegex } },
          ],
        },
        { vendor_id: 1 }
      );
      vendorFilterIds = vendors.map(v => v.vendor_id).filter(Boolean);
      if (vendorFilterIds.length === 0) {
        return res.status(200).json({ status: 200, data: [] });
      }
    }
    const query = vendorFilterIds && vendorFilterIds.length ? { 
      vendor_id: { $in: vendorFilterIds }, 
      product_name: searchRegex,
      approval_status: 'approved',
      is_visible: true
    } : { 
      product_name: searchRegex,
      approval_status: 'approved',
      is_visible: true
    };
    const products = await Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const suggestions = products.map(p => ({ id: p._id.toString(), product_name: p.product_name })).filter((s, idx, arr) => arr.findIndex(x => x.product_name === s.product_name) === idx);
    return res.status(200).json({ status: 200, data: suggestions });
  },
};

const webSearchProductList = {
  validation: {
    body: Joi.object().keys({
      search: Joi.string().trim().required(),
      city: Joi.string().allow(''),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(100),
    }),
  },
  handler: async (req, res) => {
    const { search, city } = req.body;
    const page = parseInt(req.body.page) || 1;
    const limit = req.body.limit ? parseInt(req.body.limit) : 12;
    const skip = (page - 1) * limit;
    const searchRegex = new RegExp(String(search).trim(), 'i');
    let vendorFilterIds = null;
    if (city && String(city).trim() !== '') {
      const raw = String(city).trim();
      const parts = raw.split('-');
      const cityName = parts.length > 1 ? parts[parts.length - 1] : raw;
      const cityNameRegex = new RegExp(String(cityName).trim(), 'i');
      const vendors = await VendorKyc.find(
        {
          $or: [
            { city_id: raw },
            { city_id: { $regex: cityNameRegex } },
            { city_name: { $regex: cityNameRegex } },
          ],
        },
        { vendor_id: 1 }
      );
      vendorFilterIds = vendors.map(v => v.vendor_id).filter(Boolean);
      if (vendorFilterIds.length === 0) {
        return res.status(200).json({
          success: true,
          total: 0,
          page,
          limit,
          totalPages: 1,
          data: [],
        });
      }
    }
    const query = {};
    query.$or = [
      { product_name: searchRegex },
      { description: searchRegex },
      { product_type_name: searchRegex },
      { category_name: searchRegex },
      { sub_category_name: searchRegex },
    ];
    
    // Only show approved and visible products for search
    query.approval_status = 'approved';
    query.is_visible = true;
    
    if (vendorFilterIds && vendorFilterIds.length) {
      query.vendor_id = { $in: vendorFilterIds };
    }
    const total = await Product.countDocuments(query);
    let dataQuery = Product.find(query).sort({ createdAt: -1 });
    dataQuery = dataQuery.skip(skip).limit(limit);
    const data = await dataQuery;
    const catIds = [...new Set(data.map((p) => p.category_id).filter((id) => !!id))];
    const subIds = [...new Set(data.map((p) => p.sub_category_id).filter((id) => !!id))];
    const [cats, subs] = await Promise.all([
      catIds.length ? Category.find({ _id: { $in: catIds } }) : [],
      subIds.length ? SubCategory.find({ _id: { $in: subIds } }) : [],
    ]);
    const catMap = {};
    cats.forEach((c) => {
      catMap[c._id.toString()] = c.categories_name;
    });
    const subMap = {};
    subs.forEach((s) => {
      subMap[s._id.toString()] = s.name;
    });
      // Auto-draft expired listings
      const now = new Date();
      for (const p of data) {
        if (p.expires_at && now > new Date(p.expires_at) && p.status !== 'draft') {
          p.status = 'draft';
          await p.save();
        }
      }
    const normalized = data.map((p) => ({
    

      ...p.toObject(),
      category_name: p.category_name || catMap[p.category_id] || '',
      sub_category_name: p.sub_category_name || subMap[p.sub_category_id] || '',
    }));
    
    return res.status(200).json({
      success: true,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      data: normalized,
    });
  },
};

const bulkDeactivateProducts = {
  validation: {
    body: Joi.object().keys({
      product_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    const { product_ids } = req.body;
    await Product.updateMany({ _id: { $in: product_ids } }, { $set: { status: 'inactive' } });
    return res.status(200).json({ status: 200, message: 'Products deactivated', data: product_ids });
  },
};

const bulkDeleteProducts = {
  validation: {
    body: Joi.object().keys({
      product_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    const { product_ids } = req.body;
    await Product.deleteMany({ _id: { $in: product_ids } });
    return res.status(200).json({ status: 200, message: 'Products deleted', data: product_ids });
  },
};

const purchaseListingPlan = {
  validation: {
    body: Joi.object().keys({
      vendor_id: Joi.string().allow(''),
      plan_type: Joi.string().trim().required(),
      months: Joi.number().integer().min(1),
      max_products: Joi.number().integer().min(1),
      amount: Joi.number().min(0),
      product_ids: Joi.array().items(Joi.string().required()).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    let { vendor_id } = req.body;
    if (!vendor_id && req.user) {
      vendor_id = req.user.id || req.user._id;
    }
    let { plan_type, product_ids } = req.body;
    plan_type = String(plan_type || '').trim().toLowerCase();
    let { months, max_products, amount } = req.body;
    if (plan_type !== 'custom') {
      let def = null;
      try {
        def = await ListingPlan.findOne({ plan_type, status: 'active' });
      } catch (e) { }
      if (!def) {
        const fallback = [
          { plan_type: 'basic', months: 2, max_products: 1, amount: 39 },
          { plan_type: 'standard', months: 5, max_products: 3, amount: 59 },
          { plan_type: 'premium', months: 12, max_products: 7, amount: 109 },
        ].find((p) => p.plan_type === plan_type);
        if (fallback) def = fallback;
      }
      if (!def) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid plan_type' });
      }
      months = def.months;
      max_products = def.max_products;
      amount = def.amount;
    }
    
    // Check wallet balance before deducting
    const hasBalance = await walletService.hasSufficientBalance(vendor_id, amount);
    if (!hasBalance) {
      return res.status(httpStatus.BAD_REQUEST).json({
        message: `Insufficient wallet balance. Plan costs ₹${amount}. Please add money to your wallet.`
      });
    }
    
    // Deduct amount from wallet
    try {
      await walletService.deductMoneyFromWallet(
        vendor_id,
        amount,
        `${plan_type.charAt(0).toUpperCase() + plan_type.slice(1)} plan purchase - ${months} months, ${max_products} products`,
        {
          purpose: 'plan_purchase',
          plan_type: plan_type,
          months: months,
          max_products: max_products,
        }
      );
      console.log(`💰 Deducted ₹${amount} from vendor ${vendor_id} wallet for ${plan_type} plan`);
    } catch (walletError) {
      console.error('Wallet deduction failed:', walletError);
      return res.status(httpStatus.BAD_REQUEST).json({
        message: 'Failed to process wallet payment. Please try again.'
      });
    }
    
    const assignIds = product_ids.slice(0, max_products || product_ids.length);
    const start = new Date();
    const expire = new Date(start);
    expire.setMonth(expire.getMonth() + months);
    const purchase = await ListingPlanPurchase.create({
      vendor_id,
      plan_type,
      months,
      max_products,
      amount,
      product_ids: assignIds,
      start_at: start,
      expire_at: expire,
    });
    await Product.updateMany(
      { _id: { $in: assignIds }, vendor_id },
      { $set: { status: 'active', expires_at: expire } }
    );
    return res.status(200).json({ 
      status: 200, 
      message: `Plan applied successfully. ₹${amount} deducted from wallet.`, 
      data: purchase 
    });
  },
};


const updateProductStock = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().required(),
      quantity_purchased: Joi.number().integer().min(1).required(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { product_id, quantity_purchased } = req.body;
      
      const product = await Product.findById(product_id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      if (product.product_type_name !== 'Sell') {
        return res.status(400).json({ message: 'Stock management only applies to sell products' });
      }
      
      const newAvailableQuantity = Math.max(0, product.available_quantity - quantity_purchased);
      const isOutOfStock = newAvailableQuantity <= 0;
      
      await Product.findByIdAndUpdate(product_id, {
        available_quantity: newAvailableQuantity,
        is_out_of_stock: isOutOfStock
      });
      
      res.status(200).json({
        success: true,
        message: 'Stock updated successfully',
        data: {
          available_quantity: newAvailableQuantity,
          is_out_of_stock: isOutOfStock
        }
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const getProductsByType = {
  validation: {
    body: Joi.object().keys({
      product_type: Joi.string().valid('Rent', 'Sell').required(),
      vendor_id: Joi.string().allow(''),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    }),
  },
  handler: async (req, res) => {
    try {
      const { product_type, vendor_id, page, limit } = req.body;
      const skip = (page - 1) * limit;
      
      const query = { product_type_name: product_type };
      
      // If vendor_id is provided, filter by vendor
      if (vendor_id) {
        query.vendor_id = vendor_id;
      }
      // If user is logged in as vendor, show only their products
      else if (req.user && req.user.userType === 'vendor') {
        query.vendor_id = req.user.id || req.user._id;
      }
      // For public access, only show approved and visible products
      else {
        query.approval_status = 'approved';
        query.is_visible = true;
      }
      
      const total = await Product.countDocuments(query);
      const products = await Product.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
      
      res.status(200).json({
        success: true,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: products,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

// Vendor: Toggle product visibility
const toggleProductVisibility = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().required(),
      is_visible: Joi.boolean().required(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { product_id, is_visible } = req.body;
      
      const product = await Product.findById(product_id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // Authorization check: Only the vendor who created the product can toggle visibility
      if (req.user && product.vendor_id && product.vendor_id !== req.user.id) {
        return res.status(httpStatus.FORBIDDEN).json({ 
          message: 'You do not have permission to modify this product' 
        });
      }
      
      product.is_visible = is_visible;
      await product.save();
      
      const message = is_visible 
        ? 'Product is now visible to users'
        : 'Product is now hidden from users';
      
      res.status(200).json({
        success: true,
        message: message,
        data: {
          product_id: product._id,
          is_visible: product.is_visible,
        },
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  getProductDropdowns,
  createProductDropdowns,
  updateProductDropdowns,
  deleteProductDropdowns,
  getVendorProducts,
  webProductSuggestionList,
  webSearchProductList,
  bulkDeactivateProducts,
  bulkDeleteProducts,
  purchaseListingPlan,
  updateProductStock,
  getProductsByType,
  toggleProductVisibility,
};
