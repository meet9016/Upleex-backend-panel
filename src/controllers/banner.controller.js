const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Banner } = require('../models');
const { handlePagination } = require('../utils/helper');
const { uploadToExternalService, updateFileOnExternalService, deleteFileFromExternalService } = require('../utils/fileUpload');

const createBanner = {
    validation: {
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            subtitle: Joi.string().trim().allow(''),
            description: Joi.string().trim().allow(''),
            color: Joi.string().trim().allow(''),
            link: Joi.string().trim().allow(''),
            status: Joi.string().valid('active', 'inactive').default('active'),
            image: Joi.string().allow(''),
        }),
    },
    handler: async (req, res) => {
        try {
            let imageUrl = req.body.image || '';
            if (req.file) {
                imageUrl = await uploadToExternalService(req.file, 'banners');
            }

            if (!imageUrl && !req.body.image) {
                return res.status(httpStatus.BAD_REQUEST).json({ message: 'Image is required' });
            }

            const banner = await Banner.create({
                ...req.body,
                image: imageUrl,
            });

            return res.status(httpStatus.CREATED).json({
                success: true,
                message: "Banner created successfully!",
                banner
            });
        } catch (error) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }
}

const getAllBanners = {
    handler: async (req, res) => {
        const { status, search } = req.query;
        const query = {};

        if (status) query.status = status;
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: "i" } },
                { subtitle: { $regex: search, $options: "i" } }
            ];
        }

        await handlePagination(Banner, req, res, query, { createdAt: -1 });
    },
};

const getBannerById = {
    handler: async (req, res) => {
        try {
            const { _id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(_id)) {
                return res.status(httpStatus.BAD_REQUEST).json({ message: "Invalid banner id" });
            }

            const banner = await Banner.findById(_id);

            if (!banner) {
                return res.status(httpStatus.NOT_FOUND).json({ message: "Banner not found" });
            }

            res.status(httpStatus.OK).json({
                success: true,
                data: banner,
            });
        } catch (error) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: "Internal Server Error" });
        }
    }
};

const updateBanner = {
    validation: {
        body: Joi.object().keys({
            title: Joi.string().trim(),
            subtitle: Joi.string().trim().allow(''),
            description: Joi.string().trim().allow(''),
            color: Joi.string().trim().allow(''),
            link: Joi.string().trim().allow(''),
            status: Joi.string().valid('active', 'inactive'),
            image: Joi.string().allow(''),
        }).prefs({ convert: true }),
    },
    handler: async (req, res) => {
        const { _id } = req.params;

        const bannerExist = await Banner.findById(_id);

        if (!bannerExist) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Banner not found');
        }

        let imageUrl = req.body.image || bannerExist.image || '';

        if (req.file) {
            if (bannerExist.image) {
                imageUrl = await updateFileOnExternalService(bannerExist.image, req.file);
            } else {
                imageUrl = await uploadToExternalService(req.file, 'banners');
            }
        }

        const updateData = {
            ...req.body,
            image: imageUrl,
        };

        const banner = await Banner.findByIdAndUpdate(_id, updateData, { new: true });

        res.status(httpStatus.OK).json({
            success: true,
            message: "Banner updated successfully!",
            data: banner,
        });
    }
}

const deleteBanner = {
    handler: async (req, res) => {
        const { _id } = req.params;

        const bannerExist = await Banner.findById(_id);

        if (!bannerExist) {
            throw new ApiError(httpStatus.NOT_FOUND, 'Banner not found');
        }

        if (bannerExist.image) {
            await deleteFileFromExternalService(bannerExist.image);
        }

        await Banner.findByIdAndDelete(_id);

        res.status(httpStatus.OK).json({ success: true, message: 'Banner deleted successfully' });
    }
}

const bulkDeleteBanners = {
    validation: {
        body: Joi.object().keys({
            ids: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
        }),
    },
    handler: async (req, res) => {
        const { ids } = req.body;
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        const banners = await Banner.find({ _id: { $in: objectIds } });

        for (const banner of banners) {
            if (banner.image) {
                await deleteFileFromExternalService(banner.image);
            }
        }

        await Banner.deleteMany({ _id: { $in: objectIds } });

        res.status(httpStatus.OK).json({ success: true, message: 'Banners deleted successfully' });
    },
};

module.exports = {
    createBanner,
    getAllBanners,
    getBannerById,
    updateBanner,
    deleteBanner,
    bulkDeleteBanners
};
