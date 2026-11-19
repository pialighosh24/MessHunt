const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');
const { hashPassword, comparePassword } = require('../utils/password');
const { isValidEmail } = require('../utils/validators');

const studentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: isValidEmail,
        message: 'Please provide a valid email address',
      },
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      enum: [ROLES.STUDENT],
      default: ROLES.STUDENT,
      immutable: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    favourites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Accommodation',
      },
    ],
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
    toObject: {
      transform(doc, ret) {
        delete ret.password;
        return ret;
      },
    },
  }
);

studentSchema.pre('save', async function hashPasswordHook(next) {
  if (!this.isModified('password')) return next();
  try {
    this.password = await hashPassword(this.password);
    return next();
  } catch (err) {
    return next(err);
  }
});

studentSchema.methods.comparePassword = async function comparePasswordMethod(candidatePassword) {
  return comparePassword(candidatePassword, this.password);
};

studentSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('Student', studentSchema);
