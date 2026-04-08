const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Review, Product, User, Order } = require('../models');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

/**
 * Add a new review
 */
const addReview = catchAsync(async (req, res) => {
  const { product_id, rating, review } = req.body;
  const userId = req.user.id;

  // Check if user has purchased this product
  const hasPurchased = await Order.findOne({
    user_id: userId,
    'items.product_id': product_id,
    order_status: { $in: ['delivered', 'completed'] },
  });

  if (!hasPurchased) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You can only review products you have purchased');
  }

  // Check if user already reviewed this product
  const existingReview = await Review.findOne({
    product_id,
    user_id: userId,
  });

  if (existingReview) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'You have already reviewed this product');
  }

  // Create new review
  const newReview = await Review.create({
    product_id,
    user_id: userId,
    rating,
    review,
  });

  // Populate user and product details
  const populatedReview = await Review.findById(newReview._id)
    .populate('user_id', 'name email')
    .populate('product_id', 'product_name product_main_image');

  res.status(httpStatus.CREATED).send({
    success: true,
    message: 'Review added successfully',
    data: populatedReview,
  });
});

/**
 * Update existing review
 */
const updateReview = catchAsync(async (req, res) => {
  const { review_id, rating, review } = req.body;
  const userId = req.user.id;

  const existingReview = await Review.findOne({
    _id: review_id,
    user_id: userId,
  });

  if (!existingReview) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Review not found');
  }

  existingReview.rating = rating;
  existingReview.review = review;
  await existingReview.save();

  const populatedReview = await Review.findById(existingReview._id)
    .populate('user_id', 'name email')
    .populate('product_id', 'product_name product_main_image');

  res.send({
    success: true,
    message: 'Review updated successfully',
    data: populatedReview,
  });
});

/**
 * Delete a review
 */
const deleteReview = catchAsync(async (req, res) => {
  const { review_id } = req.body;
  const userId = req.user.id;

  const review = await Review.findOneAndDelete({
    _id: review_id,
    user_id: userId,
  });

  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Review not found');
  }

  res.send({
    success: true,
    message: 'Review deleted successfully',
  });
});

/**
 * Get all reviews for a product
 */
const getProductReviews = catchAsync(async (req, res) => {
  const { product_id, page = 1, limit = 10, includeStats = true } = req.body;

  const reviews = await Review.paginate(
    { product_id, isActive: true },
    {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { createdAt: -1 },
    }
  );

  // Populate after pagination - include _id for user comparison
  await Review.populate(reviews.docs, [
    { path: 'user_id', select: '_id name email' },
    { path: 'product_id', select: '_id product_name product_main_image' },
  ]);

  const response = {
    success: true,
    data: {
      reviews: reviews.docs,
      pagination: {
        total: reviews.totalDocs,
        pages: reviews.totalPages,
        page: reviews.page,
        limit: reviews.limit,
      },
    },
  };

  // Include stats if requested (reduces API calls)
  if (includeStats) {
    const stats = await Review.aggregate([
      {
        $match: {
          product_id: new mongoose.Types.ObjectId(product_id),
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalReviews: { $sum: 1 },
          ratingBreakdown: { $push: '$rating' },
        },
      },
    ]);

    const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (stats.length > 0) {
      stats[0].ratingBreakdown.forEach((rating) => {
        ratingBreakdown[rating] = (ratingBreakdown[rating] || 0) + 1;
      });
    }

    response.data.stats = {
      averageRating: stats.length > 0 ? parseFloat(stats[0].averageRating.toFixed(1)) : 0,
      totalReviews: stats.length > 0 ? stats[0].totalReviews : 0,
      ratingBreakdown,
    };
  }

  res.send(response);
});

/**
 * Check if user has reviewed a product
 */
const checkUserReview = catchAsync(async (req, res) => {
  const { product_id } = req.body;
  const userId = req.user.id;

  const review = await Review.findOne({
    product_id,
    user_id: userId,
  }).populate('user_id', 'name email');

  res.send({
    success: true,
    data: {
      hasReviewed: !!review,
      review: review || null,
    },
  });
});

/**
 * Get review statistics for a product
 */
const getReviewStats = catchAsync(async (req, res) => {
  const { product_id } = req.body;

  const stats = await Review.aggregate([
    {
      $match: {
        product_id: new mongoose.Types.ObjectId(product_id),
        isActive: true,
      },
    },
    {
      $group: {
        _id: null,
        averageRating: { $avg: '$rating' },
        totalReviews: { $sum: 1 },
        ratingBreakdown: {
          $push: '$rating',
        },
      },
    },
  ]);

  // Calculate rating breakdown
  const ratingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  
  if (stats.length > 0) {
    const ratings = stats[0].ratingBreakdown;
    ratings.forEach((rating) => {
      ratingBreakdown[rating] = (ratingBreakdown[rating] || 0) + 1;
    });
  }

  res.send({
    success: true,
    data: {
      averageRating: stats.length > 0 ? parseFloat(stats[0].averageRating.toFixed(1)) : 0,
      totalReviews: stats.length > 0 ? stats[0].totalReviews : 0,
      ratingBreakdown,
    },
  });
});

/**
 * Get all reviews (Admin)
 */
const getAllReviews = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, product_id, user_id } = req.body;

  const filter = { isActive: true };
  if (product_id) filter.product_id = product_id;
  if (user_id) filter.user_id = user_id;

  const reviews = await Review.paginate(filter, {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 },
  });

  // Populate after pagination
  await Review.populate(reviews.docs, [
    { path: 'user_id', select: 'name email' },
    { path: 'product_id', select: 'product_name product_main_image' },
  ]);

  res.send({
    success: true,
    data: {
      reviews: reviews.docs,
      pagination: {
        total: reviews.totalDocs,
        pages: reviews.totalPages,
        page: reviews.page,
        limit: reviews.limit,
      },
    },
  });
});

/**
 * Delete review (Admin)
 */
const adminDeleteReview = catchAsync(async (req, res) => {
  const { review_id } = req.body;

  const review = await Review.findByIdAndUpdate(review_id, {
    isActive: false,
  });

  if (!review) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Review not found');
  }

  res.send({
    success: true,
    message: 'Review deleted successfully',
  });
});

module.exports = {
  addReview,
  updateReview,
  deleteReview,
  getProductReviews,
  checkUserReview,
  getReviewStats,
  getAllReviews,
  adminDeleteReview,
};
