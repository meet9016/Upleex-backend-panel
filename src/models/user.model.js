const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
    },
    first_name: {
        type: String,
        trim: true,
    },
    last_name: {
        type: String,
        trim: true,
    },
    full_name: {
        type: String,
        trim: true,
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    phone: {
        type: String,
        trim: true,
    },
    mobile: {
        type: String,
        trim: true,
    },
    password: {
        type: String,
        required: true,
    },
    profile_photo: {
        type: String,
        default: null,
    },
    platform: {
        type: String,
        enum: ['web', 'ios', 'android'],
        default: 'web',
    },
    fcmTokens: [{
        type: String,
        trim: true,
    }],
}, {
    timestamps: true, // This automatically adds createdAt and updatedAt
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Compare password
userSchema.methods.isPasswordMatch = async function (password) {
    return bcrypt.compare(password, this.password);
};

// Get full name virtual
userSchema.virtual('fullName').get(function () {
    return `${this.first_name} ${this.last_name}`;
});

// Transform output to remove sensitive data
userSchema.methods.toJSON = function () {
    const user = this.toObject();
    delete user.password;
    return user;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
