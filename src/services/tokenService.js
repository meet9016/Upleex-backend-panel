const jwt = require('jsonwebtoken');
const { tokenTypes } = require('../config/tokens');
const config = require('../config/config');

const generateAuthTokens = async (user) => {

  const accessToken = jwt.sign(
    { sub: user.id, type: tokenTypes.ACCESS },
    config.jwt.secret,
    { expiresIn: '1d' }
  );
  return { access: accessToken };
};

module.exports = {
  generateAuthTokens,
};