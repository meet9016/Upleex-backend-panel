const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const {
  GetQuote,
  Product,
  GetQuoteStatus,
  Order,
} = require('../models');
const { handlePagination } = require('../utils/helper');
const { uploadToExternalService } = require('../utils/fileUpload');
const Razorpay = require('razorpay');
const config = require('../config/config');

// Initialize Razorpay
let razorpay;
try {
  razorpay = new Razorpay({
    key_id: config.razorpay.keyId || process.env.RAZORPAY_KEY_ID,
    key_secret: config.razorpay.keySecret || process.env.RAZORPAY_KEY_SECRET,
  });
} catch (error) {
  console.error('Failed to initialize Razorpay in getquote controller:', error);
}

const createGetQuote = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().required(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().allow('').optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'approved', 'active', 'reject', 'complete', 'completed', 'delivery', 'successful')
        .optional(),
      start_date: Joi.date().optional(),
      end_date: Joi.date().optional(),
      start_time: Joi.string().allow('').optional(),
      end_time: Joi.string().allow('').optional(),
    }),
  },

  handler: async (req, res) => {
    try {
      const data = req.body;
      const user_id = req.user._id;

      console.log('Create quote request data:', data);
      console.log('User ID:', user_id);

      // Get product details to calculate price
      const product = await Product.findById(data.product_id);
      if (!product) {
        return res.status(httpStatus.BAD_REQUEST).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Calculate price based on product type
      let calculatedPrice = 0;
      let priceDetails = {};

      if (data.months_id && product.month_arr && product.month_arr.length > 0) {
        // Monthly product - find price from month_arr
        const selectedMonth = product.month_arr.find(m =>
          m.months_id === data.months_id || m.product_months_id === data.months_id
        );
        if (selectedMonth) {
          calculatedPrice = Number(selectedMonth.price || 0) * Number(data.qty || 1);
          priceDetails = {
            month_name: selectedMonth.month_name,
            unit_price: selectedMonth.price,
            total_price: calculatedPrice
          };
        }
      } else {
        // Daily/Hourly product - use base price
        const unitPrice = Number(product.price || 0);
        const days = Number(data.number_of_days || 1);
        const qty = Number(data.qty || 1);
        calculatedPrice = unitPrice * days * qty;
        priceDetails = {
          unit_price: product.price,
          days: days,
          total_price: calculatedPrice
        };
      }

      // Extract time from ISO datetime strings if provided
      let startTime = data.start_time || '';
      let endTime = data.end_time || '';

      // If start_date is ISO string with time, extract it
      if (data.start_date && typeof data.start_date === 'string' && data.start_date.includes('T')) {
        const startDateTime = new Date(data.start_date);
        const hours = String(startDateTime.getHours()).padStart(2, '0');
        const minutes = String(startDateTime.getMinutes()).padStart(2, '0');
        startTime = `${hours}:${minutes}`;
      }

      // If end_date is ISO string with time, extract it
      if (data.end_date && typeof data.end_date === 'string' && data.end_date.includes('T')) {
        const endDateTime = new Date(data.end_date);
        const hours = String(endDateTime.getHours()).padStart(2, '0');
        const minutes = String(endDateTime.getMinutes()).padStart(2, '0');
        endTime = `${hours}:${minutes}`;
      }

      const quote = await GetQuote.create({
        ...data,
        user_id,
        calculated_price: calculatedPrice,
        price_details: priceDetails,
        status: data.status || 'pending',
        start_time: startTime,
        end_time: endTime,
      });

      // Fetch the created quote with populated product details
      const populatedQuote = await GetQuote.findById(quote._id)
        .populate('product_id') // This will populate all product fields
        .lean(); // Convert to plain JavaScript object

      return res.status(httpStatus.CREATED).json({
        success: true,
        message: 'Get Quote created successfully',
        data: populatedQuote,
      });
    } catch (error) {
      return res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllQuotes = {
  handler: async (req, res) => {
    try {
      const {
        status,
        search,
        product_type,
        listing_type,
        month,
        delivery_start_date,
        delivery_end_date,
        vendor_id,
        user_id,
        price_min,
        price_max,
        sort_by,
        sort_order,
        page = 1,
        limit = 10
      } = req.query;

      const user = req.user;

      // Build base query for GetQuote
      const query = {};
      console.log("🚀 ~ query:", query)

      // Filter by user type
      if (user.userType === 'vendor') {
        // For vendors, show quotes for their products only
        const vendorProducts = await Product.find({ vendor_id: user._id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      } else {
        // For regular users, show only their quotes
        query.user_id = user._id;
      }

      // Multiple status filter support
      if (status) {
        const statusValues = Array.isArray(status) ? status : status.split(',');
        query.status = statusValues.length === 1 ? statusValues[0] : { $in: statusValues };
      }

      // Multiple month filter support
      if (month) {
        const monthValues = Array.isArray(month) ? month : month.split(',');
        query.months_id = monthValues.length === 1 ? monthValues[0] : { $in: monthValues };
      }

      // Vendor filter (for admin)
      if (vendor_id && user.userType === 'admin') {
        const vendorProducts = await Product.find({ vendor_id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      }

      // User filter (for admin)
      if (user_id && user.userType === 'admin') {
        query.user_id = user_id;
      }

      // Price range filter
      if (price_min || price_max) {
        query.calculated_price = {};
        if (price_min) query.calculated_price.$gte = Number(price_min);
        if (price_max) query.calculated_price.$lte = Number(price_max);
      }

      // Filter by delivery date range
      if (delivery_start_date || delivery_end_date) {
        query.delivery_date = {};
        if (delivery_start_date) {
          query.delivery_date.$gte = new Date(delivery_start_date);
        }
        if (delivery_end_date) {
          query.delivery_date.$lte = new Date(delivery_end_date);
        }
      }

      // Search by note, status, or product name
      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');

        // Find matching products within current user scope
        const productSearchQuery = { product_name: searchRegex };
        if (user.userType === 'vendor') {
          productSearchQuery.vendor_id = user._id;
        }
        const matchingProducts = await Product.find(productSearchQuery).select('_id');
        const productIds = matchingProducts.map(p => p._id);

        query.$or = [
          { note: searchRegex },
          { status: searchRegex },
          { product_id: { $in: productIds } }
        ];
      }

      console.log("🚀 ~ Base query:", JSON.stringify(query));

      // Calculate pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Sorting
      let sortOptions = { createdAt: -1 }; // default sort
      if (sort_by) {
        const sortOrderValue = sort_order === 'asc' ? 1 : -1;
        switch (sort_by) {
          case 'price':
            sortOptions = { calculated_price: sortOrderValue };
            break;
          case 'date':
            sortOptions = { createdAt: sortOrderValue };
            break;
          case 'status':
            sortOptions = { status: sortOrderValue };
            break;
          case 'delivery_date':
            sortOptions = { delivery_date: sortOrderValue };
            break;
          default:
            sortOptions = { createdAt: -1 };
        }
      }

      // If we have product-related filters, we need to handle differently
      if (product_type || listing_type) {
        console.log('🔍 Product-based filtering:', { product_type, listing_type });

        // Get all quotes matching basic criteria with populated product
        let quotesQuery = GetQuote.find(query)
          .populate({
            path: 'product_id',
          })
          .sort(sortOptions)
          .lean();

        const allQuotes = await quotesQuery;
        console.log('📊 All quotes before product filtering:', allQuotes.length);

        // Apply product-based filters
        const filteredQuotes = allQuotes.filter(quote => {
          const product = quote.product_id;
          if (!product) {
            console.log('❌ Quote without product:', quote._id);
            return false;
          }

          // Multiple product type filter
          if (product_type) {
            const productTypes = Array.isArray(product_type) ? product_type : product_type.split(',');
            console.log('🔍 Checking product type:', {
              productTypes,
              productTypeId: product.product_type_id,
              productTypeName: product.product_type_name
            });

            const matchesType = productTypes.includes(product.product_type_id) ||
              productTypes.includes(product.product_type_name) ||
              productTypes.includes(String(product.product_type_id));

            if (!matchesType) {
              console.log('❌ Product type mismatch for quote:', quote._id);
              return false;
            }
          }

          // Multiple listing type filter
          if (listing_type) {
            const listingTypes = Array.isArray(listing_type) ? listing_type : listing_type.split(',');
            console.log('🔍 Checking listing type:', {
              listingTypes,
              productListingTypeId: product.product_listing_type_id,
              productListingTypeName: product.product_listing_type_name
            });

            const matchesListing = listingTypes.includes(product.product_listing_type_id) ||
              listingTypes.includes(product.product_listing_type_name) ||
              listingTypes.includes(String(product.product_listing_type_id));

            if (!matchesListing) {
              console.log('❌ Listing type mismatch for quote:', quote._id);
              return false;
            }
          }

          return true;
        });

        console.log('✅ Filtered quotes count:', filteredQuotes.length);

        // Apply pagination manually
        const total = filteredQuotes.length;
        const paginatedQuotes = filteredQuotes.slice(skip, skip + limitNum);

        // Add month_name to each quote
        const enrichedQuotes = paginatedQuotes.map(quote => {
          if (quote.months_id && quote.product_id?.month_arr) {
            const month = quote.product_id.month_arr.find(
              m => m.months_id === quote.months_id || m.product_months_id === quote.months_id
            );
            if (month) {
              quote.month_name = month.month_name;
            }
          }
          return quote;
        });

        console.log("🚀 ~ Sending response with:", {
          total,
          page: pageNum,
          limit: limitNum,
          dataCount: enrichedQuotes.length
        });

        // Send response
        return res.status(httpStatus.OK).json({
          success: true,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          data: enrichedQuotes
        });
      }

      // No product filters, use handlePagination
      else {
        // Override the json method to populate product details
        const originalJson = res.json.bind(res);
        res.json = async (payload) => {
          if (payload && payload.success && Array.isArray(payload.data)) {

            // Get quote IDs
            const quoteIds = payload.data.map(q => q._id);

            // Fetch populated quotes
            const populatedQuotes = await GetQuote.find({ _id: { $in: quoteIds } })
              .populate('product_id')
              .lean();

            // Create a map for quick lookup
            const quoteMap = {};
            populatedQuotes.forEach(quote => {
              quoteMap[quote._id.toString()] = quote;
            });

            // Add month_name to each quote
            payload.data = payload.data.map(quote => {
              const populated = quoteMap[quote._id.toString()] || quote;

              if (populated.months_id && populated.product_id?.month_arr) {
                const month = populated.product_id.month_arr.find(
                  m => m.months_id === populated.months_id || m.product_months_id === populated.months_id
                );
                if (month) {
                  populated.month_name = month.month_name;
                }
              }

              return populated;
            });
          }
          return originalJson(payload);
        };

        // Use handlePagination
        await handlePagination(GetQuote, req, res, query, sortOptions);
      }

    } catch (error) {
      console.error('Error in getAllQuotes:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  },
};
const getAllQuotesForAdmin = {
  handler: async (req, res) => {
    try {
      const {
        status,
        search,
        product_type,
        listing_type,
        month,
        delivery_start_date,
        delivery_end_date,
        page = 1,
        limit = 10
      } = req.query;

      const user = req.user;

      // Build base query for GetQuote (Exclude pending quotes by default for Admin)
      const query = { status: { $ne: 'pending' } };
      console.log("🚀 ~ query:", query)

      // Filter by status
      if (status) {
        query.status = status;
      }

      // Filter by month (direct field in GetQuote)
      if (month) {
        query.months_id = month;
      }

      // Filter by delivery date range
      if (delivery_start_date || delivery_end_date) {
        query.delivery_date = {};
        if (delivery_start_date) {
          query.delivery_date.$gte = new Date(delivery_start_date);
        }
        if (delivery_end_date) {
          query.delivery_date.$lte = new Date(delivery_end_date);
        }
      }

      // Search by note, status, or product name
      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');

        // Find matching products
        const matchingProducts = await Product.find({ product_name: searchRegex }).select('_id');
        const productIds = matchingProducts.map(p => p._id);

        query.$or = [
          { note: searchRegex },
          { status: searchRegex },
          { product_id: { $in: productIds } }
        ];
      }

      console.log("🚀 ~ Base query:", JSON.stringify(query));

      // Calculate pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // If we have product-related filters, we need to handle differently
      if (product_type || listing_type) {
        // Get all quotes matching basic criteria with populated product only
        let quotesQuery = GetQuote.find(query)
          .populate({
            path: 'product_id',
          })
          .lean();

        const allQuotes = await quotesQuery;

        // Apply product-based filters
        const filteredQuotes = allQuotes.filter(quote => {
          const product = quote.product_id;
          if (!product) return false;

          // Filter by product type
          if (product_type && product.product_type_id !== product_type) {
            return false;
          }

          // Filter by listing type
          if (listing_type && product.product_listing_type_id !== listing_type) {
            return false;
          }

          return true;
        });

        // Apply pagination manually
        const total = filteredQuotes.length;
        const paginatedQuotes = filteredQuotes.slice(skip, skip + limitNum);

        // Add month_name to each quote
        const enrichedQuotes = paginatedQuotes.map(quote => {
          if (quote.months_id && quote.product_id?.month_arr) {
            const month = quote.product_id.month_arr.find(
              m => m.months_id === quote.months_id || m.product_months_id === quote.months_id
            );
            if (month) {
              quote.month_name = month.month_name;
            }
          }
          return quote;
        });

        console.log("🚀 ~ Sending flat response with:", {
          total,
          page: pageNum,
          limit: limitNum,
          dataCount: enrichedQuotes.length
        });

        // Send flat response
        return res.status(httpStatus.OK).json({
          success: true,
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          data: enrichedQuotes
        });
      }

      // No product filters, use handlePagination
      else {
        // Use handlePagination directly without overriding res.json
        await handlePagination(GetQuote, req, res, query, { createdAt: -1 }, 'product_id');
      }

    } catch (error) {
      console.error('Error in getAllQuotes:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message
      });
    }
  },
};
const getQuoteById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      // Use populate to get all product details
      const quote = await GetQuote.findById(_id)
        .populate('product_id') // This populates all product fields
        .lean(); // Convert to plain JavaScript object

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      res.status(httpStatus.OK).json({
        success: true,
        data: quote,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const updateQuote = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().optional(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'approved', 'active', 'reject', 'complete', 'completed', 'successful', 'delivery')
        .optional(),
      start_date: Joi.date().optional(),
      end_date: Joi.date().optional(),
      start_time: Joi.string().allow('').optional(),
      end_time: Joi.string().allow('').optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      const updateData = { ...req.body };

      // Handle optional file uploads
      if (req.files) {
        const f = req.files;
        if (f.image && f.image[0]) {
          updateData.upload_image = await uploadToExternalService(f.image[0], 'quotes/uploads');
        }
        if (f.video && f.video[0]) {
          updateData.upload_video = await uploadToExternalService(f.video[0], 'quotes/uploads');
        }
        if (f.return_image && f.return_image[0]) {
          updateData.return_image = await uploadToExternalService(f.return_image[0], 'quotes/returns');
        }
        if (f.return_video && f.return_video[0]) {
          updateData.return_video = await uploadToExternalService(f.return_video[0], 'quotes/returns');
        }
      }

      // Get the existing quote to check current status
      const existingQuote = await GetQuote.findById(_id).lean();
      if (!existingQuote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      // Update the quote and get the populated result
      const quote = await GetQuote.findByIdAndUpdate(
        _id,
        updateData,
        { new: true } // Return the updated document
      )
        .populate('product_id') // Populate product details
        .lean();

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      // Handle stock management if status changed
      if (updateData.status && updateData.status !== existingQuote.status) {
        const product = quote.product_id;
        if (product) {
          const qty = quote.qty || 1;

          // If status becomes 'approval' (Approved), reduce stock
          if (updateData.status === 'approval' && existingQuote.status === 'pending') {
            if (product.available_quantity >= qty) {
              await Product.findByIdAndUpdate(product._id, {
                $inc: { available_quantity: -qty }
              });
              console.log(`Reduced stock for product ${product._id} by ${qty}`);
            }
          }
          // If status becomes 'successful' or 'complete', return stock
          else if (['successful', 'complete'].includes(updateData.status)) {
            // Only return if it was previously approved/active/delivery (when stock was actually reduced)
            if (['approval', 'active', 'delivery'].includes(existingQuote.status)) {
              await Product.findByIdAndUpdate(product._id, {
                $inc: { available_quantity: qty }
              });
              console.log(`Returned stock for product ${product._id} by ${qty}`);
            }
          }
        }
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Quote updated successfully',
        data: quote,
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const statusDropdown = {
  handler: async (req, res) => {
    try {
      const rows = await GetQuoteStatus.find().sort({ createdAt: 1 }).lean();
      const data = rows.map((r) => ({ id: r._id.toString(), name: r.status_name }));
      res.status(httpStatus.OK).json({ status: 200, data });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ status: 500, message: error.message });
    }
  },
};

const changeStatus = {
  validation: {
    body: Joi.object().keys({
      quote_id: Joi.string().required(),
      status: Joi.string().required(), // status id or name
    }),
  },
  handler: async (req, res) => {
    try {
      const { quote_id, status } = req.body;

      if (!mongoose.Types.ObjectId.isValid(quote_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ status: 400, message: 'Invalid quote id' });
      }

      // Resolve provided status to internal enum
      let statusName = status;
      if (mongoose.Types.ObjectId.isValid(status)) {
        const row = await GetQuoteStatus.findById(status).lean();
        if (row) statusName = row.status_name;
      }
      const s = (statusName || '').toLowerCase();
      let internal = 'pending';
      if (s.includes('active')) internal = 'active';
      else if (s.includes('approve')) internal = 'approval';
      else if (s.includes('reject')) internal = 'reject';
      else if (s.includes('complete')) internal = 'complete';
      else if (s.includes('deliver')) internal = 'delivery';

      const existingQuote = await GetQuote.findById(quote_id).lean();
      if (!existingQuote) {
        return res.status(httpStatus.NOT_FOUND).json({ status: 404, message: 'Quote not found' });
      }

      const updated = await GetQuote.findByIdAndUpdate(
        quote_id,
        { status: internal },
        { new: true }
      )
        .populate('user_id')
        .populate('product_id')
        .lean();

      if (!updated) {
        return res.status(httpStatus.NOT_FOUND).json({ status: 404, message: 'Quote not found' });
      }

      // Stock Management + Payment Link Generation
      if (internal !== existingQuote.status) {
        const product = updated.product_id;
        const qty = updated.qty || 1;

        if (product) {
          // If status becomes 'approval' (Approved), reduce stock and generate payment link
          if (internal === 'approval' && existingQuote.status === 'pending') {
            if (product.available_quantity >= qty) {
              await Product.findByIdAndUpdate(product._id, {
                $inc: { available_quantity: -qty }
              });
              console.log(`Reduced quantity for product ${product._id} by ${qty}`);
            }

            // Generate Razorpay Payment Link
            if (razorpay && updated.calculated_price > 0) {
              try {
                const amount = Math.round(updated.calculated_price * 100); // in paise
                const paymentLink = await razorpay.paymentLink.create({
                  amount,
                  currency: 'INR',
                  accept_partial: false,
                  description: `Payment for ${product.product_name} - Quote #${updated._id}`,
                  customer: {
                    name: updated.user_id?.first_name || 'Customer',
                    email: updated.user_id?.email || '',
                    contact: updated.user_id?.mobile || '',
                  },
                  notify: {
                    sms: true,
                    email: true,
                  },
                  reminder_enable: true,
                  notes: {
                    quote_id: updated._id.toString(),
                  },
                  callback_url: `${process.env.FRONTEND_URL || 'http://localhost:3002'}/orders`,
                  callback_method: 'get',
                });

                if (paymentLink && paymentLink.short_url) {
                  await GetQuote.findByIdAndUpdate(quote_id, {
                    razorpay_payment_link: paymentLink.short_url
                  });
                  updated.razorpay_payment_link = paymentLink.short_url;
                  console.log('Payment link generated:', paymentLink.short_url);
                }
              } catch (rlError) {
                console.error('Razorpay link generation error:', rlError);
              }
            }
          }
          // If status becomes 'successful' or 'complete', return stock
          else if (['successful', 'complete'].includes(internal)) {
            // Only return if it was previously approved/active/delivery (when stock was actually reduced)
            if (['approval', 'active', 'delivery'].includes(existingQuote.status)) {
              await Product.findByIdAndUpdate(product._id, {
                $inc: { available_quantity: qty }
              });
              console.log(`Returned stock for product ${product._id} by ${qty}`);
            }
          }
        }
      }

      // Send email to user based on status
      try {
        const emailService = require('../services/email.service');
        const user = updated.user_id;
        const product = updated.product_id;

        if (user && user.email) {
          const userName = user.first_name || user.firstName || 'User';
          const productName = product?.product_name || 'Your Product';
          const startDate = updated.start_date ? new Date(updated.start_date).toLocaleDateString('en-GB') : 'N/A';
          const endDate = updated.end_date ? new Date(updated.end_date).toLocaleDateString('en-GB') : 'N/A';
          const paymentLink = updated.razorpay_payment_link;

          if (internal === 'approval') {
            // Send approval email
            const subject = `Quote Approved! 🎉 - ${productName}`;
            const html = `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <tr>
      <td style="background:#059669; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:0; font-size:28px; font-weight:bold;">Quote Approved! 🎉</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Hi ${userName}, 👋</h2>
        <p>Great news! Your quote for <strong>${productName}</strong> has been <strong style="color:#059669;">APPROVED</strong> by the vendor.</p>
        
        <div style="margin:30px 0; padding:20px; background:#f0fdf4; border-left:5px solid #059669; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#059669;">📋 Quote Details</h3>
          <table width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;">
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Product:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Start Date:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${startDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>End Date:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${endDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Amount to Pay:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333; font-weight:bold;">₹${updated.calculated_price.toLocaleString('en-IN')}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Status:</strong></td>
              <td style="padding:8px 0; text-align:right;"><span style="background:#059669; color:white; padding:4px 12px; border-radius:4px; font-size:12px; font-weight:bold;">APPROVED</span></td>
            </tr>
          </table>
        </div>

        ${paymentLink ? `
        <div style="text-align:center; margin:35px 0;">
          <p style="margin-bottom:15px; color:#666;">To confirm your rental, please complete the payment using the link below:</p>
          <a href="${paymentLink}" style="background:#059669; color:white; padding:14px 30px; border-radius:8px; text-decoration:none; font-weight:bold; font-size:16px; display:inline-block; box-shadow:0 4px 6px rgba(5,150,105,0.2);">Complete Payment Now</a>
          <p style="margin-top:12px; font-size:12px; color:#999;">If the button doesn't work, copy this link: ${paymentLink}</p>
        </div>
        ` : ''}
        
        <p style="margin:25px 0;">You can also check your dashboard for more details and to manage your rentals.</p>
        <p style="margin-top:35px;">Best regards,<br><strong>The Upleex Team</strong></p>
      </td>
    </tr>
    <tr>
      <td style="background:#059669; padding:20px; text-align:center; color:#fff; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
            `;
            emailService.sendEmail(user.email, subject, '').catch(err => console.log('Text email error:', err));
            // Send HTML email
            const transporter = emailService.transport;
            transporter.sendMail({
              from: process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
              to: user.email,
              subject,
              html
            }).catch(err => console.log('HTML email error:', err));
          } else if (internal === 'reject') {
            // Send rejection email
            const subject = `Quote Rejected - ${productName}`;
            const html = `
<div style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table width="100%" cellspacing="0" cellpadding="0" style="max-width:620px; margin:20px auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
    <tr>
      <td style="background:#dc2626; text-align:center; padding:35px 20px;">
        <h1 style="color:#fff; margin:0; font-size:28px; font-weight:bold;">Quote Rejected</h1>
      </td>
    </tr>
    <tr>
      <td style="padding:35px 30px; color:#333; font-size:15px; line-height:1.7;">
        <h2 style="margin:0 0 20px; color:#232323;">Hi ${userName}, 👋</h2>
        <p>We regret to inform you that your quote for <strong>${productName}</strong> has been <strong style="color:#dc2626;">REJECTED</strong> by the vendor.</p>
        
        <div style="margin:30px 0; padding:20px; background:#fef2f2; border-left:5px solid #dc2626; border-radius:8px;">
          <h3 style="margin:0 0 15px; color:#dc2626;">📋 Quote Details</h3>
          <table width="100%" cellspacing="0" cellpadding="0" style="font-size:14px;">
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Product:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${productName}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Start Date:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${startDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>End Date:</strong></td>
              <td style="padding:8px 0; text-align:right; color:#333;">${endDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Status:</strong></td>
              <td style="padding:8px 0; text-align:right;"><span style="background:#dc2626; color:white; padding:4px 12px; border-radius:4px; font-size:12px; font-weight:bold;">REJECTED</span></td>
            </tr>
          </table>
        </div>
        
        <p style="margin:25px 0;">You can try requesting a new quote or contact the vendor for more information.</p>
        <p style="margin-top:35px;">Best regards,<br><strong>The Upleex Team</strong></p>
      </td>
    </tr>
    <tr>
      <td style="background:#dc2626; padding:20px; text-align:center; color:#fff; font-size:13px;">
        © ${new Date().getFullYear()} Upleex. All rights reserved.
      </td>
    </tr>
  </table>
</div>
            `;
            const transporter = emailService.transport;
            transporter.sendMail({
              from: process.env.EMAIL_FROM || process.env.SMTP_USERNAME,
              to: user.email,
              subject,
              html
            }).catch(err => console.log('HTML email error:', err));
          }
        }
      } catch (emailError) {
        console.log('Email sending error:', emailError);
        // Don't fail the request if email fails
      }

      res.status(httpStatus.OK).json({ status: 200, message: 'Status updated', data: updated });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ status: 500, message: error.message });
    }
  },
};

const deleteQuote = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      const quote = await GetQuote.findByIdAndDelete(_id);

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Quote deleted successfully',
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  },
};

const verifyQuotePayment = {
  handler: async (req, res) => {
    try {
      const { razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_reference_id, razorpay_payment_link_status, razorpay_signature, quote_id } = req.body;

      // In real scenario we match signatures or use razorpay API to get payment details
      if (razorpay_payment_link_status === 'paid' || razorpay_payment_id) {

        let existingQuote;
        if (quote_id) {
          existingQuote = await GetQuote.findById(quote_id);
        } else if (razorpay_payment_link_id) {
          // We saved the quote_id in the notes of the razorpay payment link! Let's fetch it via razorpay SDK.
          try {
            if (razorpay) {
              const paymentLink = await razorpay.paymentLink.fetch(razorpay_payment_link_id);
              if (paymentLink && paymentLink.notes && paymentLink.notes.quote_id) {
                existingQuote = await GetQuote.findById(paymentLink.notes.quote_id);
              }
            }
          } catch (rzpErr) {
            console.error('Error fetching razorpay payment link:', rzpErr);
          }
        }

        if (!existingQuote && razorpay_payment_link_reference_id) {
          existingQuote = await GetQuote.findOne({ razorpay_payment_link: { $regex: razorpay_payment_link_reference_id } });
        }

        if (existingQuote) {
          existingQuote.payment_status = 'paid';
          existingQuote.razorpay_payment_id = razorpay_payment_id;

          await existingQuote.save();
          return res.status(httpStatus.OK).json({ success: true, message: 'Payment verified and status updated', data: existingQuote });
        } else {
          // We might not easily find the quote if we don't have its id. As a fallback, try to find any pending quote the user has, but mostly we need quote_id.
          return res.status(httpStatus.NOT_FOUND).json({ success: false, message: 'Quote not found for this payment' });
        }
      }

      res.status(httpStatus.BAD_REQUEST).json({ success: false, message: 'Payment failed or invalid status' });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
    }
  }
};

const getUserDashboardData = {
  handler: async (req, res) => {
    try {
      const user_id = req.user._id;
      const now = new Date();
      // Normalize now date to midnight for accurate day comparison
      const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

      // Fetch all quotes for this user
      const quotes = await GetQuote.find({ user_id })
        .populate('product_id')
        .sort({ createdAt: -1 })
        .lean();

      // Fetch all orders for this user
      const orders = await Order.find({ user_id })
        .sort({ createdAt: -1 })
        .lean();

      const currentRentals = [];
      const pastRentals = [];
      const purchases = [];
      const cancellations = [];

      // Categorize Quotes (Rentals)
      quotes.forEach(rental => {
        const status = (rental.status || '').toLowerCase();
        const paymentStatus = (rental.payment_status || '').toLowerCase();
        const productType = (rental.product_id?.product_type_name || '').toLowerCase();

        let startDateVal = 0;
        let endDateVal = 0;

        if (rental.start_date) {
          const d = new Date(rental.start_date);
          startDateVal = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        }
        if (rental.end_date) {
          const d = new Date(rental.end_date);
          endDateVal = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        }

        const isRent = productType === 'rent';

        // 1. Current Rental
        const isCurrent = isRent && (
          (paymentStatus === 'paid' && status === 'delivery' && startDateVal && endDateVal && nowDate >= startDateVal && nowDate <= endDateVal) ||
          (status === 'approval' || status === 'approve' || status === 'pending')
        );

        if (isCurrent) {
          currentRentals.push(rental);
        }
        // 2. Past Rental
        else if (isRent && paymentStatus === 'paid' && (status === 'complete' || status === 'successful') && endDateVal && nowDate > endDateVal) {
          pastRentals.push(rental);
        }
        // 3. Cancellations (Rent)
        else if (status === 'rejected' || status === 'reject' || status === 'cancelled') {
          cancellations.push(rental);
        }
      });

      // Categorize Orders (Purchases/Sell)
      orders.forEach(order => {
        const status = (order.order_status || '').toLowerCase();
        const vendorStatus = (order.vendor_status || '').toLowerCase();
        const paymentStatus = (order.payment_status || '').toLowerCase();

        (order.items || []).forEach((item, idx) => {
          const normalizedItem = {
            _id: `${order._id}-${item.product_id || idx}`,
            order_id: order.order_id,
            product_id: {
              _id: item.product_id,
              product_name: item.product_name,
              product_main_image: item.product_image,
              price: item.price,
              product_type_name: 'Sell'
            },
            qty: item.quantity,
            calculated_price: item.final_amount,
            status: order.order_status,
            vendor_status: order.vendor_status,
            payment_status: order.payment_status,
            createdAt: order.createdAt,
            razorpay_payment_id: order.razorpay_payment_id
          };

          // 3. Cancellations (Sell)
          if (status === 'cancelled' || vendorStatus === 'cancelled') {
            cancellations.push(normalizedItem);
          }
          // 4. Purchases
          else if (paymentStatus === 'paid') {
            purchases.push(normalizedItem);
          }
        });
      });

      res.status(httpStatus.OK).json({
        success: true,
        data: {
          currentRentals,
          pastRentals,
          purchases,
          cancellations
        }
      });
    } catch (error) {
      console.error('User Dashboard Error:', error);
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to fetch dashboard data',
        error: error.message
      });
    }
  }
};

module.exports = {
  createGetQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
  statusDropdown,
  changeStatus,
  getAllQuotesForAdmin,
  verifyQuotePayment,
  getUserDashboardData
};
