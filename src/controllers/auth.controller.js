const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { authService, tokenService, emailService } = require('../services');
const Joi = require('joi');
const ApiError = require('../utils/ApiError');
const { User, Cart, Payment } = require('../models');
const { sendWelcomeEmail } = require('../services/email.service');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Use absolute path from project root, not from src
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', 'profile-photos');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'profile-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed!'));
  }
}).single('profile_photo');

const register = {
  validation: {
    body: Joi.object().keys({
      first_name: Joi.string().required(),
      last_name: Joi.string().required(),
      email: Joi.string().required().email(),
      phone: Joi.string().pattern(/^[0-9]{10,15}$/).required().messages({
        'string.pattern.base': 'Phone number must be between 10 and 15 digits'
      }),
      password: Joi.string().required().min(6),
    }),
  },

  handler: async (req, res) => {
    try {
      // 1️⃣ Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: req.body.email },
          { phone: req.body.phone }
        ]
      });

      if (existingUser) {
        if (existingUser.email === req.body.email) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Email already registered');
        }
        if (existingUser.phone === req.body.phone) {
          throw new ApiError(httpStatus.BAD_REQUEST, 'Phone number already registered');
        }
      }

      // 2️⃣ Create new user
      const newUser = await new User(req.body).save();

      // 3️⃣ Generate auth token
      const token = await tokenService.generateAuthTokens(newUser);

      // 4️⃣ Send welcome email
      // await sendWelcomeEmail(newUser.email, newUser.first_name);

      // 5️⃣ Send success response
      return res.status(httpStatus.CREATED).send({
        success: true,
        message: 'User registered successfully',
        user: {
          _id: newUser._id,
          first_name: newUser.first_name,
          last_name: newUser.last_name,
          email: newUser.email,
          phone: newUser.phone,
          profile_photo: newUser.profile_photo,
        },
        token,
      });

    } catch (error) {
      console.error("Registration Error:", error.message, error.stack);

      return res
        .status(error.statusCode || httpStatus.INTERNAL_SERVER_ERROR)
        .send({
          success: false,
          message: error.message || 'Registration failed',
        });
    }
  },
};

const login = {
  validation: {
    body: Joi.object().keys({
      email: Joi.string().required().email(),
      password: Joi.string().required(),
    }),
  },
  handler: async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await user.isPasswordMatch(password))) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Incorrect email or password');
    }

    const token = await tokenService.generateAuthTokens(user);
    return res.status(httpStatus.OK).send({
      token,
      user: {
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone: user.phone,
        profile_photo: user.profile_photo,
      }
    });
  }
};

const getUserProfile = {
  handler: async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId).select('-password');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User Not Found"
        });
      }

      // Cart items all
      const cartItems = await Cart.find({ user_id: userId })
        .populate("product_id")
        .populate("exam_category_id")
        .populate("hyperspecialist_id")
        .populate("livecourse_id");

      // bucket_type = true (Cart items)
      const addToCartItem = cartItems.filter(item => item.bucket_type === true);

      // bucket_type = false (Purchased items) - Ensure unique items
      const payBill = [];
      const seenItems = new Set();

      cartItems.filter(item => item.bucket_type === false).forEach(item => {
        let identifier = "";
        if (item.cart_type === 'prerecord') identifier = `prerecord_${item.product_id?._id || item.product_id}`;
        else if (item.cart_type === 'exam_plan') identifier = `exam_${item.exam_category_id?._id || item.exam_category_id}_${item.plan_id}`;
        else if (item.cart_type === 'hyperspecialist') identifier = `hyper_${item.hyperspecialist_id?._id || item.hyperspecialist_id}`;
        else if (item.cart_type === 'livecourses') identifier = `live_${item.livecourse_id?._id || item.livecourse_id}_${item.livecourse_module_id}`;
        else if (item.cart_type === 'rapid_tool') identifier = `rapid_${item.exam_category_id?._id || item.exam_category_id}_${item.tool_id}`;
        
        // Use createdAt as a secondary identifier to distinguish between multiple purchases of the same item if they happened at different times
        // But the user wants to see only one if they purchased only one. 
        // If there are duplicates with the same identifier, we only take the first one.
        if (identifier && !seenItems.has(identifier)) {
          seenItems.add(identifier);
          payBill.push(item);
        } else if (!identifier) {
          // Fallback for any unknown types
          payBill.push(item);
        }
      });

      // Sort payBill by createdAt descending to show newest first
      payBill.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Payment items
      const paymentItems = await Payment.find({ user_id: userId }).sort({ createdAt: -1 });

      return res.status(200).send({
        success: true,
        message: "Profile fetched successfully",
        user: user,
        cart: {
          addToCartItem: addToCartItem,
          payBill: payBill
        },
        payment: paymentItems,
        totalSpent: paymentItems.reduce((total, payment) => total + payment.amount, 0),
      });

    } catch (error) {
      console.error("Profile fetch error:", error);
      res.status(500).json({
        success: false,
        message: "Server Error",
        error: error.message
      });
    }
  }
};

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const refreshTokens = catchAsync(async (req, res) => {
  const tokens = await authService.refreshAuth(req.body.refreshToken);
  res.send({ ...tokens });
});

const forgotPassword = catchAsync(async (req, res) => {
  const resetPasswordToken = await tokenService.generateResetPasswordToken(req.body.email);
  await emailService.sendResetPasswordEmail(req.body.email, resetPasswordToken);
  res.status(httpStatus.OK).send({ message: 'Reset password email sent' });
});

const resetPassword = catchAsync(async (req, res) => {
  await authService.resetPassword(req.query.token, req.body.password);
  res.status(httpStatus.OK).send({ message: 'Password reset successfully' });
});

const sendVerificationEmail = catchAsync(async (req, res) => {
  const verifyEmailToken = await tokenService.generateVerifyEmailToken(req.user);
  await emailService.sendVerificationEmail(req.user.email, verifyEmailToken);
  res.status(httpStatus.NO_CONTENT).send();
});

const verifyEmail = catchAsync(async (req, res) => {
  await authService.verifyEmail(req.query.token);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  register,
  login,
  logout,
  refreshTokens,
  forgotPassword,
  resetPassword,
  sendVerificationEmail,
  verifyEmail,
  getUserProfile,
};