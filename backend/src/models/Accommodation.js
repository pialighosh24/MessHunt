const mongoose = require('mongoose');
const {
  ACCOMMODATION_STATUS,
  ACCOMMODATION_TYPES,
  GENDER_TYPES,
  ROOM_TYPES,
  BATHROOM_TYPES,
  AVAILABILITY_STATUS,
} = require('../utils/constants');
const { isValidUrl } = require('../utils/validators');

const photoSchema = new mongoose.Schema(
  {
    // Cloudinary-managed photo metadata (Step 9). Legacy/non-Cloudinary records may only have url/filename.
    url: { type: String, trim: true, default: '' }, // compatibility field (usually same as secureUrl)
    secureUrl: { type: String, trim: true, default: '' },
    publicId: { type: String, trim: true, default: '' },
    format: { type: String, trim: true, default: '' },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    filename: { type: String, trim: true, default: '' },
    uploadedAt: { type: Date, default: Date.now },
    // Step 9.1: recoverable two-stage deletion state (Cloudinary/DB consistency).
    // Legacy records without this field are treated as active.
    deletionStatus: { type: String, enum: ['active', 'pending_deletion'], default: 'active' },
    deletionRequestedAt: { type: Date, default: null },
    deletionError: { type: String, trim: true, default: '' },
  },
  { _id: true }
);

const accommodationSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Owner',
      required: [true, 'Owner reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Accommodation name is required'],
      trim: true,
      minlength: [2, 'Accommodation name must be at least 2 characters'],
      maxlength: [150, 'Accommodation name must be at most 150 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [3000, 'Description must be at most 3000 characters'],
    },
    accommodationType: {
      type: String,
      enum: {
        values: ACCOMMODATION_TYPES,
        message: 'Accommodation type must be Mess, PG, or Hostel',
      },
      required: [true, 'Accommodation type is required'],
    },
    genderType: {
      type: String,
      enum: {
        values: GENDER_TYPES,
        message: 'Gender type must be Boys, Girls, or Co-ed',
      },
      required: [true, 'Gender type is required'],
    },
    suitableFor: {
      type: String,
      trim: true,
      default: '',
      maxlength: [200, 'Suitable occupants information is too long'],
    },

    // Location
    location: {
      state: { type: String, required: [true, 'State is required'], trim: true },
      district: { type: String, required: [true, 'District is required'], trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true, index: true },
      locality: { type: String, required: [true, 'Locality is required'], trim: true, index: true },
      fullAddress: { type: String, required: [true, 'Full address is required'], trim: true, maxlength: 500 },
      landmark: { type: String, trim: true, default: '', maxlength: 200 },
      googleMapsLink: {
        type: String,
        required: [true, 'Google Maps link is required'],
        trim: true,
        validate: {
          validator: isValidUrl,
          message: 'Please provide a valid Google Maps URL',
        },
      },
    },

    // Pricing (all non-negative; charges may be 0 when included/not applicable)
    pricing: {
      monthlyRent: {
        type: Number,
        required: [true, 'Monthly rent is required'],
        min: [0, 'Monthly rent cannot be negative'],
      },
      securityDeposit: { type: Number, default: 0, min: [0, 'Security deposit cannot be negative'] },
      electricityCharges: { type: Number, default: 0, min: [0, 'Electricity charges cannot be negative'] },
      waterCharges: { type: Number, default: 0, min: [0, 'Water charges cannot be negative'] },
      foodCharges: { type: Number, default: 0, min: [0, 'Food charges cannot be negative'] },
      otherCharges: { type: Number, default: 0, min: [0, 'Other charges cannot be negative'] },
      includedChargesInfo: { type: String, trim: true, default: '', maxlength: 500 },
      extraChargesInfo: { type: String, trim: true, default: '', maxlength: 500 },
    },

    // Room details
    roomDetails: {
      roomType: {
        type: String,
        enum: {
          values: ROOM_TYPES,
          message: 'Room type must be Single, Double, or Shared',
        },
        required: [true, 'Room type is required'],
      },
      totalRooms: { type: Number, default: 0, min: [0, 'Total rooms cannot be negative'] },
      availableRoomsOrBeds: { type: Number, default: 0, min: [0, 'Available rooms/beds cannot be negative'] },
      bathroomType: {
        type: String,
        enum: {
          values: BATHROOM_TYPES,
          message: 'Bathroom type must be Attached or Shared',
        },
        required: [true, 'Bathroom type is required'],
      },
      furnishing: { type: String, trim: true, default: '', maxlength: 500 },
    },

    // Food information
    foodInfo: {
      foodProvided: { type: Boolean, default: false },
      selfCookingAllowed: { type: Boolean, default: false },
      homeFoodDeliveryAllowed: { type: Boolean, default: false },
    },

    // Facilities and rules
    facilities: {
      type: [String],
      default: [],
    },
    rules: {
      entryTiming: { type: String, trim: true, default: '', maxlength: 200 },
      visitorRules: { type: String, trim: true, default: '', maxlength: 500 },
      additionalRules: { type: String, trim: true, default: '', maxlength: 1000 },
    },

    // Availability and contact
    availability: {
      status: {
        type: String,
        enum: {
          values: AVAILABILITY_STATUS,
          message: 'Availability status must be Available or Full',
        },
        default: AVAILABILITY_STATUS.AVAILABLE,
      },
      availableBeds: { type: Number, default: 0, min: [0, 'Available beds cannot be negative'] },
      availableFrom: { type: Date, default: null },
    },
    contact: {
      ownerDisplayName: { type: String, required: [true, 'Owner display name is required'], trim: true, maxlength: 100 },
      contactNumber: {
        type: String,
        required: [true, 'Contact number is required'],
        trim: true,
        minlength: [7, 'Contact number is too short'],
        maxlength: [20, 'Contact number is too long'],
      },
    },

    // Media
    photos: {
      type: [photoSchema],
      default: [],
      validate: {
        validator: function validatePhotos(arr) {
          return Array.isArray(arr);
        },
        message: 'Photos must be an array',
      },
    },

    // Approval workflow
    status: {
      type: String,
      enum: {
        values: Object.values(ACCOMMODATION_STATUS),
        message: 'Invalid accommodation status',
      },
      default: ACCOMMODATION_STATUS.PENDING,
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'Rejection reason must be at most 1000 characters'],
    },
    // Minimal admin decision audit fields (latest decision)
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
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

accommodationSchema.index({ owner: 1, createdAt: -1 });
accommodationSchema.index({ status: 1, createdAt: -1 });
accommodationSchema.index({ 'location.city': 1, 'location.locality': 1, status: 1 });

module.exports = mongoose.model('Accommodation', accommodationSchema);
