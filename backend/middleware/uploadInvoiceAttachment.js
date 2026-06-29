import multer from "multer";

/**
 * uploadInvoiceAttachment — multer middleware for invoice attachments.
 *
 * Separate from the Excel/CSV-only `uploadAttachment.js`. Accepts ONLY
 * PDF / DOC / DOCX, max 10MB, in memory (the buffer is streamed straight to
 * Cloudinary by utils/cloudinaryUpload.js). Single field name: "file".
 */
const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword", // .doc
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, DOC or DOCX files are allowed"), false);
  }
};

export const uploadInvoiceAttachment = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
}).single("file");
