const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { toJSON } = require('./plugins');

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

adminSchema.methods.isPasswordMatch = async function (password) {
  return bcrypt.compare(password, this.password);
};

adminSchema.plugin(toJSON);

const Admin = mongoose.model('Admin', adminSchema);
module.exports = Admin;

