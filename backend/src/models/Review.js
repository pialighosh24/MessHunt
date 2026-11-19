const mongoose = require('mongoose');
const { MODERATION_STATUS } = require('../utils/constants');

const reportSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Reporting student is required'],
    },
    reason: {
      type: String,
      required: [true, 'Report reason is required'],
      trim: true,
      minlength: [5, 'Report reason must be at least 5 characters'],
      maxlength: [500, 'Report reason must be at most 500 characters'],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    // Admin report-handling fields (minimal extension; does not replace existing report structure)
    status: {
      type: String,
      enum: ['pending', 'dismissed', 'actioned'],
      default: 'pending',
    },
    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    handledAt: {
      type: Date,
      default: null,
    },
    handlingNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Handling note must be at most 500 characters'],
    },
  },
  { _id: false }
);

const reviewSchema = new mongoose.Schema(
  {
    accommodation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Accommodation',
      required: [true, 'Accommodation reference is required'],
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student reference is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5',
      },
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: [3, 'Comment must be at least 3 characters'],
      maxlength: [1000, 'Comment must be at most 1000 characters'],
    },
    reviewerDisplayName: {
      type: String,
      required: [true, 'Reviewer display name is required'],
      trim: true,
      maxlength: [100, 'Reviewer display name must be at most 100 characters'],
    },
    isReported: {
      type: Boolean,
      default: false,
      index: true,
    },
    reportReason: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Report reason must be at most 500 characters'],
    },
    reports: {
      type: [reportSchema],
      default: [],
    },
    moderationStatus: {
      type: String,
      enum: Object.values(MODERATION_STATUS),
      default: MODERATION_STATUS.NONE,
      index: true,
    },
    moderatedAt: {
      type: Date,
      default: null,
    },
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    moderationNote: {
      type: String,
      trim: true,
      default: '',
      maxlength: [500, 'Moderation note must be at most 500 characters'],
    },
    moderationAction: {
      type: String,
      trim: true,
      default: '',
      maxlength: [50, 'Moderation action must be at most 50 characters'],
    },
    previousModerationStatus: {
      type: String,
      trim: true,
      default: '',
      maxlength: [30, 'Previous moderation status must be at most 30 characters'],
    },
    isDemo: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Enforce one review per student per accommodation.
// Students can edit their existing review document instead of creating duplicates.
// Moderation states (e.g. removed/hidden) are tracked on the same record to avoid duplicate active reviews.
reviewSchema.index({ accommodation: 1, student: 1 }, { unique: true });
reviewSchema.index({ accommodation: 1, createdAt: -1 });

module.exports = mongoose.model('Review', reviewSchema);
