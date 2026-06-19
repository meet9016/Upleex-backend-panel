const jwt = require('jsonwebtoken');
const { tokenTypes } = require('../config/tokens');
const config = require('../config/config');

const generateAuthTokens = async (user, userType = 'user', rememberMe = false) => {
  let expiresIn;
  if (userType === 'vendor') {
    // Vendor: fixed 48 hours
    expiresIn = '48h';
  } else if (rememberMe) {
    // User with remember me: 15 days
    expiresIn = '15d';
  } else {
    // Default: 1 day
    expiresIn = '1d';
  }

  const accessToken = jwt.sign(
    { 
      sub: user.id || user._id, 
      type: tokenTypes.ACCESS,
      name: user.name || user.full_name || '',
      userType: userType
    },
    config.jwt.secret,
    { expiresIn }
  );
  return { access: accessToken };
};

module.exports = {
  generateAuthTokens,
};