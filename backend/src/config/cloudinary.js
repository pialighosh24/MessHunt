const cloudinary = require('cloudinary').v2;
const ApiError = require('../utils/ApiError');

function getCloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
    folder: process.env.CLOUDINARY_ACCOMMODATION_FOLDER || 'mess-hunt/accommodations',
  };
}

function isCloudinaryConfigured() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  return Boolean(cloudName && apiKey && apiSecret);
}

function ensureCloudinaryConfigured() {
  if (!isCloudinaryConfigured()) {
    throw new ApiError(
      503,
      'Image upload service is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in the backend environment.'
    );
  }
}

let configured = false;
function getCloudinary() {
  ensureCloudinaryConfigured();
  if (!configured) {
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

function getUploadFolder() {
  return getCloudinaryConfig().folder || 'mess-hunt/accommodations';
}

function getMaxUploadSizeMb() {
  const n = Number(process.env.MAX_UPLOAD_SIZE_MB || 5);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function getMaxPhotosPerAccommodation() {
  const n = Number(process.env.MAX_PHOTOS_PER_ACCOMMODATION || 10);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

module.exports = {
  getCloudinary,
  getCloudinaryConfig,
  isCloudinaryConfigured,
  ensureCloudinaryConfigured,
  getUploadFolder,
  getMaxUploadSizeMb,
  getMaxPhotosPerAccommodation,
};
