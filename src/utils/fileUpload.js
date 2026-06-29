const axios = require('axios');
const FormData = require('form-data');

const PROJECT_NAME = 'upleex';
const BASE_URL = 'https://service.digitalks.co.in';

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
      throw new Error('File size is too large. Please upload a smaller video (max 25MB).');
    }

    if (isImage && file.size > MAX_IMAGE_SIZE) {
      throw new Error('File size is too large. Please upload a smaller image (max 10MB).');
    }

    const formData = new FormData();
    formData.append('project', PROJECT_NAME);
    formData.append('folder_structure', folderName);
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
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
      return response.data.file_url;
    }
    throw new Error(response.data.message || 'Upload failed');
  } catch (error) {
    console.error('External upload error:', {
      message: error.message,
      data: error.response?.data,
      status: error.response?.status,
      fileType: file?.mimetype,
      fileName: file?.originalname,
    });
    if (error.response?.status === 413) {
      throw new Error('File size is too large for the media storage service. Please upload a smaller file (max 25MB for videos, 10MB for images).');
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
    const formData = new FormData();
    formData.append('file_url', oldFileUrl);
    formData.append('new_file', newFile.buffer, {
      filename: newFile.originalname,
      contentType: newFile.mimetype,
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
      return response.data.new_file_url;
    }
    throw new Error(response.data.message || 'Update failed');
  } catch (error) {
    // If the old file is not found on the external service (404 / "detail":"Not Found"),
    // fall back to a fresh upload instead of throwing a 500 error
    const status = error.response?.status;
    const detail = error.response?.data?.detail || error.response?.data?.message || '';
    const isNotFound =
      status === 404 ||
      (typeof detail === 'string' && detail.toLowerCase().includes('not found'));

    if (isNotFound) {
      console.warn('Old file not found on external service, falling back to fresh upload:', oldFileUrl);
      return await uploadToExternalService(newFile, 'categories_image');
    }

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
};