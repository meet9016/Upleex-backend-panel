const express = require('express');
const authRoute = require('./auth.route');
const blogsRoute = require('./blogs.route');
const categoriesRoute = require('./categories.route');
const subCategoriesRoute = require('./subcategories.route');
const productsRoute = require('./products.route');
const dropdownsRoute = require('./dropdowns.route');
const vendorAuthRoute = require('../../routes/vendor/auth.route');

const router = express.Router();

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
    path: '/vendor/auth',
    route: vendorAuthRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
