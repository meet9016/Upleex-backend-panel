const config = require("../config/config");
const moment = require('moment');
const fs = require('fs');



const saveFile = (files) => {
    let fileUploadPath = config.fileUploadPath + '/images/';
    const fileName = moment().unix() + Math.floor(1000 + Math.random() * 9000) + '.' + files.name.split('.').pop();;
    return new Promise(async (resolve, reject) => {
        fileUploadPath = fileUploadPath + fileName;
        files.mv(fileUploadPath, async (err) => {
            if (err) {
                reject(err);
            } else {
                resolve({
                    upload_path: '/images/' + fileName,
                    file_name: fileName
                });
            }
        });
    })
}


const removeFile = (file_name) => {
    let fileUploadPath = config.fileUploadPath;
    return new Promise(async (resolve, reject) => {
        fileUploadPath = fileUploadPath + file_name;
        fs.unlink(fileUploadPath, async (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(true);
            }
        });
    })
}

const handlePagination = async (Model, req, res, query = {}, sort = { createdAt: -1 }) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = req.query.limit ? parseInt(req.query.limit) : null;
        const skip = limit ? (page - 1) * limit : 0;

        const total = await Model.countDocuments(query);

        let dataQuery = Model.find(query).sort(sort);

        if (limit) {
            dataQuery = dataQuery.skip(skip).limit(limit);
        }

        const data = await dataQuery;

        res.status(200).json({
            success: true,
            total,
            page: limit ? page : 1,
            limit: limit || total,
            totalPages: limit ? Math.ceil(total / limit) : 1,
            data,
        });
    } catch (error) {
        console.error("Pagination error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// Common function to format date → DD-MM-YYYY
const formatDate = (date) => {
    return new Date(date)
        .toLocaleDateString("en-GB") // DD/MM/YYYY
        .replace(/\//g, "-");        // DD-MM-YYYY
};

// Common function to format array + sort by date
const sortAndFormat = (data, field = "date") => {
    return data
        .sort((a, b) => new Date(b[field]) - new Date(a[field])) // DESC (latest first)
        .map(item => ({
            ...item._doc,
            [field]: formatDate(item[field])
        }));
};

module.exports = {
    saveFile,
    removeFile,
    handlePagination,
    sortAndFormat
}