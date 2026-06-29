import multer from "multer";

/**
 * uploadLogo — multer middleware for client brand-logo uploads.
 *
 * Accepts ONLY image logos (PNG / JPG / JPEG / SVG), max 2MB, in memory (the
 * buffer is streamed straight to Cloudinary by utils/cloudinaryUpload.js
 * `uploadImageBuffer`). Single field name: "file".
 *
 * Wrapped so multer errors (wrong type / oversized) return a clean 400 JSON
 * instead of bubbling to the global error handler.
 */
const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg", // covers .jpg and .jpeg
  "image/svg+xml",
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PNG, JPG, JPEG or SVG image files are allowed"), false);
  }
};

const runUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("file");

export const uploadLogo = (req, res, next) => {
  runUpload(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Logo file is too large (max 2MB)"
          : err.message || "Logo upload failed";
      return res.status(400).json({ message: msg });
    }
    next();
  });
};
