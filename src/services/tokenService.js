const jwt = require('jsonwebtoken');
const { tokenTypes } = require('../config/tokens');
const config = require('../config/config');

const generateAuthTokens = async (user, userType = 'user') => {
  const accessToken = jwt.sign(
    { 
      sub: user.id || user._id, 
      type: tokenTypes.ACCESS,
      name: user.name || user.full_name || '',
      userType: userType
    },
    config.jwt.secret,
    { expiresIn: '1d' }
  );
  return { access: accessToken };
};

module.exports = {
  generateAuthTokens,
};