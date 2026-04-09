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
const wishlistRoute = require('./wishlist.route');
const reviewRoute = require('./review.route');
const vendorKycRoute = require('./vendorKyc.route');
const vendorAuthRoute = require('../../routes/vendor/auth.route');
const adminRoute = require('./admin.route');
const validate = require('../../middlewares/validate');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { productsController } = require('../../controllers');
const listingPlanPurchaseRoute = require('./listingPlanPurchase.route');
const listingPlanRoute = require('./listingPlan.route');
const priorityPlanRoute = require('./priorityPlan.route');
const exportRoute = require('./export.route');
const paymentRoute = require('./payment.route');
const vendorOrdersRoute = require('./vendorOrders.route');
const vendorPaymentsRoute = require('./vendorPayments.route');
const servicesRoute = require('./services.route');
const serviceCategoriesRoute = require('./serviceCategories.route');
const walletRoute = require('./wallet.route');
const bannersRoute = require('./banners.route');
const contactsRoute = require('./contacts.route');
const vendorDashboardRoute = require('./vendorDashboard.route');
const rentalBoostPlanRoute = require('./rentalBoostPlan.route');
const adminOrdersRoute = require('./adminOrders.route');
const auth = require('../../middlewares/auth');


const router = express.Router();

router.post(
  '/web-product-suggestion-list',
  upload.none(),
  validate(productsController.webProductSuggestionList.validation),
  catchAsync(productsController.webProductSuggestionList.handler)
);

router.post(
  '/web-search-product-list',
  auth(true),
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
    path: '/wishlist',
    route: wishlistRoute,
  },
  {
    path: '/reviews',
    route: reviewRoute,
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
  {
    path: '/priority-plans',
    route: priorityPlanRoute,
  },
  {
    path: '/export',
    route: exportRoute,
  },
  {
    path: '/payment',
    route: paymentRoute,
  },
  {
    path: '/vendor/orders',
    route: vendorOrdersRoute,
  },
  {
    path: '/vendor/payments',
    route: vendorPaymentsRoute,
  },
  {
    path: '/services',
    route: servicesRoute,
  },
  {
    path: '/service-categories',
    route: serviceCategoriesRoute,
  },
  {
    path: '/wallet',
    route: walletRoute,
  },
  {
    path: '/banners',
    route: bannersRoute,
  },
  {
    path: '/contacts',
    route: contactsRoute,
  },
  {
    path: '/vendor/dashboard',
    route: vendorDashboardRoute,
  },
  {
    path: '/rental-boost-plans',
    route: rentalBoostPlanRoute,
  },
  {
    path: '/admin/orders',
    route: adminOrdersRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
