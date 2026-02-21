const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const buildPublicUrl = (relativePath) => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (config.backendUrl) {
    return `${config.backendUrl.replace(/\/+$/, '')}/${normalized}`;
  }
  return `/${normalized}`;
};

const extractUploadsRelativePath = (fileUrl) => {
  if (!fileUrl) return null;

  const uploadsIndex = fileUrl.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return fileUrl.substring(uploadsIndex + 1); // remove leading '/'
  }

  if (fileUrl.startsWith('uploads/')) {
    return fileUrl;
  }

  if (fileUrl.startsWith('/')) {
    return `uploads${fileUrl}`;
  }

  return `uploads/${fileUrl}`;
};

const uploadToExternalService = async (file, folderName = 'general') => {
  const uploadsRoot = path.join(process.cwd(), 'uploads');
  const targetDir = path.join(uploadsRoot, folderName);
  ensureDir(targetDir);

  const ext = path.extname(file.originalname) || '.png';
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = path.join(targetDir, uniqueName);

  await fs.promises.writeFile(filePath, file.buffer);

  const relativePath = path.join('uploads', folderName, uniqueName);
  return buildPublicUrl(relativePath);
};

const deleteFileFromExternalService = async (fileUrl) => {
  const relativePath = extractUploadsRelativePath(fileUrl);
  if (!relativePath) return;

  const fullPath = path.join(process.cwd(), relativePath);

  try {
    await fs.promises.unlink(fullPath);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
};

const updateFileOnExternalService = async (oldFileUrl, newFile) => {
  let folderName = 'general';

  const relativePath = extractUploadsRelativePath(oldFileUrl);
  if (relativePath) {
    const parts = relativePath.split('/');
    if (parts.length > 1) {
      folderName = parts[1];
    }
  }

  const newFileUrl = await uploadToExternalService(newFile, folderName);
  await deleteFileFromExternalService(oldFileUrl);

  return newFileUrl;
};

module.exports = {
  uploadToExternalService,
  updateFileOnExternalService,
  deleteFileFromExternalService,
};
