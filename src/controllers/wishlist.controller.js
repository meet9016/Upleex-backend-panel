const { Wishlist, Product } = require('../models');
const httpStatus = require('http-status');
const mongoose = require('mongoose');

const addToWishlist = async (req, res) => {
  const { product_id } = req.body;
  const user_id = req.user._id;

  const existingItem = await Wishlist.findOne({ user_id, product_id });
  if (existingItem) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Product already in wishlist'
    });
  }

  const wishlistItem = await Wishlist.create({ user_id, product_id });

  res.status(httpStatus.CREATED).json({
    success: true,
    message: 'Product added to wishlist',
    data: wishlistItem
  });
};

const removeFromWishlist = async (req, res) => {
  const { product_id } = req.body;
  const user_id = req.user._id;

  if (!product_id) {
    return res.status(400).json({
      success: false,
      message: "product_id is required"
    });
  }

  let productObjectId;
  try {
    productObjectId = new mongoose.Types.ObjectId(product_id);
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: "Invalid product_id format"
    });
  }

  const deletedItem = await Wishlist.findOneAndDelete({
    user_id: user_id,                
    product_id: productObjectId
  });

  if (!deletedItem) {
    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Product not found in your wishlist"
    });
  }

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Product removed from wishlist",
  });
};

const getWishlist = async (req, res) => {
  const user_id = req.user._id;
  const page = parseInt(req.body.page) || 1;
  const limit = parseInt(req.body.limit) || 100;
  const skip = (page - 1) * limit;

  // Use aggregation to filter out items where product's is_visible is false
  const pipeline = [
    { $match: { user_id: new mongoose.Types.ObjectId(user_id) } },
    {
      $lookup: {
        from: 'products', // The collection name for Product model
        localField: 'product_id',
        foreignField: '_id',
        as: 'product_info'
      }
    },
    { $unwind: '$product_info' },
    { $match: { 'product_info.is_visible': { $ne: false } } },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              _id: 1,
              user_id: 1,
              createdAt: 1,
              product_id: {
                product_name: '$product_info.product_name',
                price: '$product_info.price',
                cancel_price: '$product_info.cancel_price',
                product_main_image: '$product_info.product_main_image',
                category_name: '$product_info.category_name',
                sub_category_name: '$product_info.sub_category_name',
                vendor_name: '$product_info.vendor_name',
                status: '$product_info.status',
                product_listing_type_name: '$product_info.product_listing_type_name',
                product_type_name: '$product_info.product_type_name',
                month_arr: '$product_info.month_arr',
                id: '$product_info._id'
              },
              id: '$_id'
            }
          }
        ]
      }
    }
  ];

  const results = await Wishlist.aggregate(pipeline);
  const total = results[0].metadata[0]?.total || 0;
  const wishlistItems = results[0].data || [];

  res.status(httpStatus.OK).json({
    success: true,
    data: {
      items: wishlistItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
};

const toggleWishlist = async (req, res) => {
  const { product_id } = req.body;
  const user_id = req.user._id;

  const existingItem = await Wishlist.findOne({ user_id, product_id });

  if (existingItem) {
    await Wishlist.findOneAndDelete({ user_id, product_id });
    res.status(httpStatus.OK).json({
      success: true,
      message: 'Product removed from wishlist',
      inWishlist: false
    });
  } else {
    await Wishlist.create({ user_id, product_id });
    res.status(httpStatus.CREATED).json({
      success: true,
      message: 'Product added to wishlist',
      inWishlist: true
    });
  }
};

const checkWishlistStatus = async (req, res) => {
  const { product_id } = req.body;
  const user_id = req.user._id;

  const existingItem = await Wishlist.findOne({ user_id, product_id });

  res.status(httpStatus.OK).json({
    success: true,
    inWishlist: !!existingItem
  });
};

module.exports = {
  addToWishlist,
  removeFromWishlist,
  getWishlist,
  toggleWishlist,
  checkWishlistStatus
};