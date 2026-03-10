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

  // product_id નથી આવ્યું તો error
  if (!product_id) {
    return res.status(400).json({
      success: false,
      message: "product_id is required"
    });
  }

  // બંનેને ObjectIdમાં convert કરી નાખીએ (safe way)
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
    user_id: user_id,                    // એ ObjectId જ છે
    product_id: productObjectId
  });

  if (!deletedItem) {
    // ડીબગ માટે જોઈ શકો (productionમાં રિમૂવ કરી શકો)
    // const all = await Wishlist.find({ user_id });
    // console.log("User's wishlist:", all);

    return res.status(httpStatus.NOT_FOUND).json({
      success: false,
      message: "Product not found in your wishlist"
    });
  }

  return res.status(httpStatus.OK).json({
    success: true,
    message: "Product removed from wishlist",
    // optionally: data: deletedItem
  });
};

const getWishlist = async (req, res) => {
  const user_id = req.user._id;
  const page = parseInt(req.body.page) || 1;
  const limit = parseInt(req.body.limit) || 100;
  const skip = (page - 1) * limit;

  const wishlistItems = await Wishlist.find({ user_id })
    .populate({
      path: 'product_id',
      select: 'product_name price cancel_price product_main_image category_name sub_category_name vendor_name status product_listing_type_name product_type_name month_arr'
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Wishlist.countDocuments({ user_id });

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