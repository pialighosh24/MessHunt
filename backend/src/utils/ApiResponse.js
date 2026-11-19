class ApiResponse {
  constructor(statusCode, data = null, message = 'Success') {
    this.success = statusCode < 400;
    this.message = message;
    if (data !== null && data !== undefined) {
      this.data = data;
    }
  }
}

const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null } = {}) => {
  return res.status(statusCode).json(new ApiResponse(statusCode, data, message));
};

module.exports = { ApiResponse, sendSuccess };
