const express = require('express');
const authRoute = require('./auth.route');
const blogsRoute = require('./blogs.route');
const categoriesRoute = require('./categories.route');
const subCategoriesRoute = require('./subcategories.route');
const productsRoute = require('./products.route');
const dropdownsRoute = require('./dropdowns.route');
const faqsRoute = require('./faqs.route');
const getQuoteRoute = require('./getquote.route');
const cartRoute = require('./cart.route');
const vendorKycRoute = require('./vendorKyc.route');
const vendorAuthRoute = require('../../routes/vendor/auth.route');
const adminRoute = require('./admin.route');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { productsController } = require('../../controllers');
const listingPlanPurchaseRoute = require('./listingPlanPurchase.route');
const listingPlanRoute = require('./listingPlan.route');

const router = express.Router();

router.post(
  '/web-product-suggestion-list',
  upload.none(),
  validate(productsController.webProductSuggestionList.validation),
  catchAsync(productsController.webProductSuggestionList.handler)
);

router.post(
  '/web-search-product-list',
  upload.none(),
  validate(productsController.webSearchProductList.validation),
  catchAsync(productsController.webSearchProductList.handler)
);

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/blogs',
    route: blogsRoute,
  },
  {
    path: '/categories',
    route: categoriesRoute,
  },
  {
    path: '/subcategories',
    route: subCategoriesRoute,
  },
  {
    path: '/products',
    route: productsRoute,
  },
  {
    path: '/dropdowns',
    route: dropdownsRoute,
  },
  {
    path: '/faqs',
    route: faqsRoute,
  },
  {
    path: '/',
    route: vendorKycRoute,
  },
  {  
    path: '/vendor/auth',
    route: vendorAuthRoute,
  },
  {  
    path: '/quote',
    route: getQuoteRoute,
  },
  {  
    path: '/cart',
    route: cartRoute,
  },
  {
    path: '/admin',
    route: adminRoute,
  },
  {
    path: '/listing-plans',
    route: listingPlanPurchaseRoute,
  },
  {
    path: '/plans',
    route: listingPlanRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
