const multer = require("multer");

// Use memory storage to get file buffer for external service upload
const storage = multer.memoryStorage();

// File filter (accept images, PDFs, and videos)
const fileFilter = (req, file, cb) => {
  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/svg+xml",
    "application/pdf",
    "video/mp4",
    "video/mpeg",
    "video/ogg",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel"
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images (JPEG, PNG, SVG, WEBP), PDF, and videos are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1000 * 1024 * 1024, // 1GB limit (PDFs can be any size)
  }
});

module.exports = upload;
