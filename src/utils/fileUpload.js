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
    const formData = new FormData();
    formData.append('project', PROJECT_NAME);
    formData.append('folder_structure', folderName);
    formData.append('file', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    const response = await axios.post(`${BASE_URL}/upload-file`, formData, {
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
    console.error('External Upload Error:', error.response?.data || error.message);
    throw new Error('Failed to upload file to external service');
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
    console.error('External Update Error:', error.response?.data || error.message);
    throw new Error('Failed to update file on external service');
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
      console.warn('External Delete Warning:', response.data.message);
    }
  } catch (error) {
    console.error('External Delete Error:', error.response?.data || error.message);
    // We don't necessarily want to throw here to avoid breaking the main flow if delete fails
  }
};

module.exports = {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
};
