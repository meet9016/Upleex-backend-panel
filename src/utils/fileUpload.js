const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');

const PROJECT_NAME = 'upleex';
const BASE_URL = 'https://service.digitalks.co.in';

/**
 * Convert a byte value into a human-readable string (KB or MB)
 * - Anything under 1MB is shown in KB
 * - Anything 1MB or above is shown in MB
 * @param {number} bytes
 * @returns {string} e.g. "245.32 KB" or "3.45 MB"
 */
const formatFileSize = (bytes) => {
  if (!bytes || bytes <= 0) return '0 KB';

  const KB = 1024;
  return `${(bytes / KB).toFixed(2)} KB`;
};

/**
 * Compresses an image file buffer using sharp.
 * If the image is not compressable (like SVG) or compression fails, it returns the original file details.
 * @param {Object} file - The file object containing buffer, mimetype, and originalname
 * @returns {Promise<{buffer: Buffer, mimetype: string, originalname: string, size: number}>}
 */
const compressImage = async (file) => {
  const isImage = file.mimetype.startsWith('image/');
  const isSvg = file.mimetype === 'image/svg+xml';

  if (!isImage || isSvg || !file.buffer) {
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size || (file.buffer ? file.buffer.length : 0),
    };
  }

  try {
    let sharpInstance = sharp(file.buffer);
    const metadata = await sharpInstance.metadata();

    // Resize if too large (e.g. width or height > 1600px)
    if (metadata.width > 1600 || metadata.height > 1600) {
      sharpInstance = sharpInstance.resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    let compressedBuffer;
    let mimetype = file.mimetype;
    let originalname = file.originalname;

    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/jpg') {
      compressedBuffer = await sharpInstance.jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    } else if (file.mimetype === 'image/png') {
      compressedBuffer = await sharpInstance.png({ quality: 80, compressionLevel: 8 }).toBuffer();
    } else if (file.mimetype === 'image/webp') {
      compressedBuffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
    } else {
      // Default: convert to webp for other image formats (gif, tiff, etc.)
      compressedBuffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
      mimetype = 'image/webp';
      const extIndex = file.originalname.lastIndexOf('.');
      originalname = extIndex !== -1 
        ? file.originalname.substring(0, extIndex) + '.webp' 
        : file.originalname + '.webp';
    }

    console.log(`Image compressed: ${file.originalname} (${formatFileSize(file.size)}) -> (${formatFileSize(compressedBuffer.length)})`);

    return {
      buffer: compressedBuffer,
      mimetype,
      originalname,
      size: compressedBuffer.length,
    };
  } catch (error) {
    console.error(`Error compressing image ${file.originalname}:`, error);
    return {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      size: file.size || (file.buffer ? file.buffer.length : 0),
    };
  }
};

/**
 * Upload a file to the external Digitalks service
 * @param {Object} file - The file object from multer (req.file)
 * @param {string} folderName - The folder structure name
 * @returns {Promise<string>} - The uploaded file URL
 */
const uploadToExternalService = async (file, folderName = 'sample') => {
  try {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_VIDEO_SIZE = 25 * 1024 * 1024; // 25MB

    const isVideo = file.mimetype.startsWith('video/');
    const isImage = file.mimetype.startsWith('image/');

    if (isVideo && file.size > MAX_VIDEO_SIZE) {
      throw new Error(
        `File size is too large (${formatFileSize(file.size)}). Please upload a smaller video (max ${formatFileSize(MAX_VIDEO_SIZE)}).`
      );
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      throw new Error(
        `File size is too large (${formatFileSize(file.size)}). Please upload a smaller image (max ${formatFileSize(MAX_IMAGE_SIZE)}).`
      );
    }

    // Compress the image before uploading
    const compressed = await compressImage(file);

    const formData = new FormData();
    formData.append('project', PROJECT_NAME);
    formData.append('folder_structure', folderName);
    formData.append('file', compressed.buffer, {
      filename: compressed.originalname,
      contentType: compressed.mimetype,
    });

    const response = await axios.post(`${BASE_URL}/upload-file`, formData, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000, // 5 minutes
      headers: {
        ...formData.getHeaders(),
        accept: 'application/json',
      },
    });

    if (response.data && response.data.status === 'success') {
      const sizeFormatted = formatFileSize(compressed.size);
      console.log(`Uploaded: ${compressed.originalname} - Size: ${sizeFormatted}`);
      
      const fileUrl = response.data.file_url;
      const resultObj = new String(fileUrl);
      resultObj.file_url = fileUrl;
      resultObj.file_size = sizeFormatted;
      
      return resultObj;
    }
    throw new Error(response.data.message || 'Upload failed');
  } catch (error) {
    console.error('External upload error:', {
      message: error.message,
      data: error.response?.data,
      status: error.response?.status,
      fileType: file?.mimetype,
      fileName: file?.originalname,
      fileSize: file ? formatFileSize(file.size) : undefined,
    });
    if (error.response?.status === 413) {
      throw new Error(
        `File size is too large for the media storage service${file ? ` (${formatFileSize(file.size)})` : ''}. Please upload a smaller file (max 25MB for videos, 10MB for images).`
      );
    }
    throw new Error(error.response?.data?.message || error.message || 'Failed to upload file to external service');
  }
};

/**
 * Update an existing file on the external Digitalks service
 * @param {string} oldFileUrl - The URL of the file to be replaced
 * @param {Object} newFile - The new file object from multer
 * @returns {Promise<string>} - The new uploaded file URL
 */
const updateFileOnExternalService = async (oldFileUrl, newFile) => {
  try {
    const compressed = await compressImage(newFile);

    const formData = new FormData();
    formData.append('file_url', oldFileUrl);
    formData.append('new_file', compressed.buffer, {
      filename: compressed.originalname,
      contentType: compressed.mimetype,
    });

    const response = await axios.put(`${BASE_URL}/update-file-by-url`, formData, {
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300000, // 5 minutes
      headers: {
        ...formData.getHeaders(),
        accept: 'application/json',
      },
    });

    if (response.data && response.data.status === 'success') {
      const sizeFormatted = formatFileSize(compressed.size);
      const url = response.data.new_file_url;
      const resultObj = new String(url);
      resultObj.file_url = url;
      resultObj.file_size = sizeFormatted;
      
      return resultObj;
    }
    throw new Error(response.data.message || 'Update failed');
  } catch (error) {
    console.error('External update error:', {
      message: error.message,
      data: error.response?.data,
      status: error.response?.status
    });
    throw new Error(error.response?.data?.message || error.message || 'Failed to update file on external service');
  }
};

/**
 * Delete a file from the external Digitalks service
 * @param {string} fileUrl - The URL of the file to be deleted
 * @returns {Promise<void>}
 */
const deleteFileFromExternalService = async (fileUrl) => {
  try {
    if (!fileUrl) return;

    const response = await axios.delete(`${BASE_URL}/delete-file-by-url`, {
      data: { file_url: fileUrl },
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (response.data && response.data.status !== 'success') {
    }
  } catch (error) {
    // We don't necessarily want to throw here to avoid breaking the main flow if delete fails
  }
};

module.exports = {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
  formatFileSize,
};