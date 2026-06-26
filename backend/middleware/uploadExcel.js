import multer from "multer";

/**
 * uploadExcel — multer middleware for the Recipe Import .xlsx upload.
 *
 * Accepts ONLY .xlsx (Office Open XML spreadsheet), max 5MB, in memory (the
 * buffer is streamed straight to the parser — no disk write). Single field
 * name: "file". Wrapped so multer errors (wrong type / oversized) return a
 * clean 400 JSON instead of bubbling to the global error handler.
 */
const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/octet-stream", // some browsers send this for .xlsx — extension is checked below
]);

const fileFilter = (req, file, cb) => {
  const isXlsx = /\.xlsx$/i.test(file.originalname || "");
  if (ALLOWED_MIME.has(file.mimetype) && isXlsx) {
    cb(null, true);
  } else {
    cb(new Error("Only .xlsx spreadsheet files are allowed"), false);
  }
};

const runUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single("file");

export const uploadExcel = (req, res, next) => {
  runUpload(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Excel file is too large (max 5MB)"
          : err.message || "Excel upload failed";
      return res.status(400).json({ message: msg });
    }
    next();
  });
};
