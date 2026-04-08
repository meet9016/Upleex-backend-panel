const express = require('express');
const { reviewController } = require('../../controllers');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const Joi = require('joi');

const router = express.Router();

// Validation schemas
const addReviewValidation = {
  body: Joi.object().keys({
    product_id: Joi.string().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    review: Joi.string().required().max(500),
  }),
};

const updateReviewValidation = {
  body: Joi.object().keys({
    review_id: Joi.string().required(),
    rating: Joi.number().integer().min(1).max(5).required(),
    review: Joi.string().required().max(500),
  }),
};

const deleteReviewValidation = {
  body: Joi.object().keys({
    review_id: Joi.string().required(),
  }),
};

const getProductReviewsValidation = {
  body: Joi.object().keys({
    product_id: Joi.string().required(),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
  }),
};

const checkUserReviewValidation = {
  body: Joi.object().keys({
    product_id: Joi.string().required(),
  }),
};

const getReviewStatsValidation = {
  body: Joi.object().keys({
    product_id: Joi.string().required(),
  }),
};

const getAllReviewsValidation = {
  body: Joi.object().keys({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    product_id: Joi.string().optional(),
    user_id: Joi.string().optional(),
  }),
};

const adminDeleteReviewValidation = {
  body: Joi.object().keys({
    review_id: Joi.string().required(),
  }),
};

// User routes (require authentication)
router.post(
  '/add',
  auth('user'),
  validate(addReviewValidation),
  reviewController.addReview
);

router.post(
  '/update',
  auth('user'),
  validate(updateReviewValidation),
  reviewController.updateReview
);

router.post(
  '/delete',
  auth('user'),
  validate(deleteReviewValidation),
  reviewController.deleteReview
);

router.post(
  '/product-reviews',
  validate(getProductReviewsValidation),
  reviewController.getProductReviews
);

router.post(
  '/check-user-review',
  auth('user'),
  validate(checkUserReviewValidation),
  reviewController.checkUserReview
);

router.post(
  '/stats',
  validate(getReviewStatsValidation),
  reviewController.getReviewStats
);

// Admin routes
router.post(
  '/admin/all-reviews',
  auth('admin'),
  validate(getAllReviewsValidation),
  reviewController.getAllReviews
);

router.post(
  '/admin/delete',
  auth('admin'),
  validate(adminDeleteReviewValidation),
  reviewController.adminDeleteReview
);

module.exports = router;
