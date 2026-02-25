const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const {
  GetQuote,
  Product,
} = require('../models');
const { handlePagination } = require('../utils/helper');

const createGetQuote = {
  validation: {
    body: Joi.object().keys({
      product_id: Joi.string().required(),
      delivery_date: Joi.date().optional(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'reject', 'complete')
        .optional(),
    }),
  },

  handler: async (req, res) => {
    try {
      const data = req.body;

      const quote = await GetQuote.create({
        ...data,
        status: data.status || 'pending',
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
        page = 1,
        limit = 10
      } = req.query;

      console.log("🚀 ~ Received filters:", { status, search, product_type, listing_type, month, delivery_start_date, delivery_end_date });

      // Build base query for GetQuote
      const query = {};

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

      // Search by note or status
      if (search && search.trim() !== '') {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { note: searchRegex },
          { status: searchRegex },
        ];
      }

      console.log("🚀 ~ Base query:", JSON.stringify(query));

      // Calculate pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // If we have product-related filters, we need to handle differently
      if (product_type || listing_type) {
        // Get all quotes matching basic criteria with populated product
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
              m => m.months_id === quote.months_id.toString()
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
                  m => m.months_id === populated.months_id.toString()
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
        await handlePagination(GetQuote, req, res, query, { createdAt: -1 });
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
      delivery_date: Joi.date().optional(),
      number_of_days: Joi.number().min(0).optional(),
      months_id: Joi.string().optional(),
      qty: Joi.number().optional(),
      note: Joi.string().allow('').optional(),
      status: Joi.string()
        .valid('pending', 'approval', 'reject', 'complete')
        .optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res.status(httpStatus.BAD_REQUEST).json({ message: 'Invalid quote id' });
      }

      // Update the quote and get the populated result
      const quote = await GetQuote.findByIdAndUpdate(
        _id, 
        req.body, 
        { new: true } // Return the updated document
      )
        .populate('product_id') // Populate product details
        .lean(); // Convert to plain JavaScript object

      if (!quote) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Quote not found' });
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

module.exports = {
  createGetQuote,
  getAllQuotes,
  getQuoteById,
  updateQuote,
  deleteQuote,
};
