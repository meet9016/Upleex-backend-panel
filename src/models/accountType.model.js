const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const accountTypeSchema = mongoose.Schema(
  {
    type_name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

accountTypeSchema.plugin(toJSON);

const AccountType = mongoose.model('AccountType', accountTypeSchema);

module.exports = AccountType;
