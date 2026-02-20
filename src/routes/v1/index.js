const express = require('express');
const authRoute = require('./auth.route');
const questionRoute = require('./question.route');
const blogsRoute = require('./blogs.route');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/question',
    route: questionRoute,
  },
  {
    path: '/blogs',
    route: blogsRoute,
  },
];


defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});


module.exports = router;
