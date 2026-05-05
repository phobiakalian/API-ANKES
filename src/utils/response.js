// src/utils/response.js
/**
 * Helper untuk response yang konsisten
 * Semua endpoint akan mengembalikan format:
 * { success: true/false, message: "...", data: {...} }
 */

exports.sendSuccess = (res, data = null, message = "Success", statusCode = 200) => {
    res.status(statusCode).json({
      success: true,
      message,
      data
    });
  };
  
  exports.sendError = (res, message = "An error occurred", statusCode = 500, details = null) => {
    res.status(statusCode).json({
      success: false,
      error: message,
      details // Hanya tampil details jika ada, bisa di-hide di production jika mau
    });
  };

  