const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

const password = (value, helpers) => {
  if (value.length < 9) {
    return helpers.message('Password must be at least 9 characters');
  }
  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/) || !value.match(/[!@#$%^&*()_+{}\[\]:;<>,.?~\\/-]/) || !value.match(/[A-Z]/)) {
    return helpers.message('Password must meet the criteria: 9 digits, a special character, a number, and an uppercase letter');
  }
  return value;
};


module.exports = {
  objectId,
  password,
};
