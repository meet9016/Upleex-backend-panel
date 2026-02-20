const express = require('express');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const path = require('path');
const fs = require('fs');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

// Logging middleware
if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// Set security HTTP headers
// Modified helmet to allow images to load
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https:', 'http:'],
      },
    },
  })
);

// Parse json request body
app.use(express.json());

// Parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// Sanitize request data
app.use(xss());
app.use(mongoSanitize());

// Gzip compression
app.use(compression());

// Enable CORS
app.use(cors());
app.options('*', cors());

// JWT authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// ENSURE UPLOADS DIRECTORY EXISTS (from project root, not src)
const uploadsDir = path.join(process.cwd(), 'uploads', 'profile-photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// enable files upload

app.use(express.static(path.resolve("./public")));

app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '1d', // Cache for 1 day
    etag: true,
    lastModified: true,
  })
);

// Serve public folder (for other static assets)
app.use(express.static(path.resolve('./public')));

// Limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// V1 API routes
app.use('/api/v1', routes);

// Send back a 404 error for any unknown API request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// Convert error to ApiError, if needed
app.use(errorConverter);

// Handle error
app.use(errorHandler);

module.exports = app;