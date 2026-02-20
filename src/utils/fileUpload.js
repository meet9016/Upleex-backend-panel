const axios = require('axios');
const FormData = require('form-data');

const uploadToExternalService = async (file, folderName = 'general') => {
    const formData = new FormData();
    formData.append('project', 'mendel-academy');
    formData.append('folder_structure', folderName);
    formData.append('file', file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype
    });

    const response = await axios.post(`${process.env.PDF_SERVICE_URL}/upload-file`, formData, {
        headers: formData.getHeaders()
    });

    return response.data.file_url;
};

const updateFileOnExternalService = async (oldFileUrl, newFile) => {
    const formData = new FormData();
    formData.append('file_url', oldFileUrl);
    formData.append('new_file', newFile.buffer, {
        filename: newFile.originalname,
        contentType: newFile.mimetype
    });

    const response = await axios.put(`${process.env.PDF_SERVICE_URL}/update-file-by-url`, formData, {
        headers: formData.getHeaders()
    });

    return response.data.new_file_url;
};

const deleteFileFromExternalService = async (fileUrl) => {
    await axios.delete(`${process.env.PDF_SERVICE_URL}/delete-file-by-url`, {
        headers: { 'Content-Type': 'application/json' },
        data: { file_url: fileUrl }
    });
};

module.exports = { uploadToExternalService, updateFileOnExternalService, deleteFileFromExternalService };
