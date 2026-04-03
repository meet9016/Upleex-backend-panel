const jwt = require('jsonwebtoken');
const httpStatus = require('http-status');
const config = require('../config/config');

const auth = (isOptional = false) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      if (isOptional) return next();
      return res.status(httpStatus.UNAUTHORIZED).json({ 
        message: 'Authentication required' 
      });
    }

    // Verify and decode the token
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Attach user info to request objectweb-login-register
    req.user = {
      id: decoded.sub,
      _id: decoded.sub,
      name: decoded.name || '',
      userType: decoded.userType || 'user'
    };
    
    next();
  } catch (error) {
    if (isOptional) return next();
    console.error('Auth error:', error.message);
    return res.status(httpStatus.UNAUTHORIZED).json({ 
      message: 'Invalid or expired token' 
    });
  }
};

module.exports = auth;
