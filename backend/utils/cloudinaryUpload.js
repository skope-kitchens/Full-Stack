import cloudinary from "../config/cloudinary.js";

/**
 * uploadInvoiceBuffer — push an in-memory file buffer (from multer) to
 * Cloudinary under the "invoices/" folder as a RAW resource (PDF/DOC/DOCX are
 * not images). Returns the secure URL + the original filename for display.
 *
 * Reuses the shared config/cloudinary.js client — no duplicate config.
 *
 * @param {Buffer} buffer - file bytes
 * @param {string} originalName - original filename (for display + public_id hint)
 * @returns {Promise<{ attachmentUrl:string, attachmentName:string }>}
 */
export function uploadInvoiceBuffer(buffer, originalName = "attachment") {
  return new Promise((resolve, reject) => {
    if (!buffer || !buffer.length) {
      return reject(new Error("Empty file"));
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "invoices",
        resource_type: "raw",
        use_filename: true,
        unique_filename: true,
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url) return reject(new Error("Cloudinary upload failed"));
        resolve({
          attachmentUrl: result.secure_url,
          attachmentName: originalName,
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * uploadImageBuffer — push an in-memory IMAGE buffer (from multer) to
 * Cloudinary as an `image` resource under the given folder. Used for brand
 * logos (PNG/JPG/JPEG/SVG). Reuses the same shared config/cloudinary.js client
 * and streaming pattern as uploadInvoiceBuffer — no duplicate config.
 *
 * @param {Buffer} buffer - file bytes
 * @param {string} folder - Cloudinary folder (e.g. "client-logos")
 * @param {string} originalName - original filename (display + public_id hint)
 * @returns {Promise<{ secureUrl:string, originalName:string }>}
 */
export function uploadImageBuffer(buffer, folder = "uploads", originalName = "image") {
  return new Promise((resolve, reject) => {
    if (!buffer || !buffer.length) {
      return reject(new Error("Empty file"));
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        use_filename: true,
        unique_filename: true,
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url) return reject(new Error("Cloudinary upload failed"));
        resolve({ secureUrl: result.secure_url, originalName });
      }
    );
    stream.end(buffer);
  });
}

/**
 * isValidCloudinaryUrl — guard used before persisting a client/POC-supplied
 * attachmentUrl, so arbitrary user URLs can never be stored. We only accept
 * https URLs on a res.cloudinary.com host.
 */
export function isValidCloudinaryUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(String(url));
    return u.protocol === "https:" && /(^|\.)cloudinary\.com$/.test(u.hostname);
  } catch {
    return false;
  }
}
