const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Blogs } = require('../models');
const { handlePagination } = require('../utils/helper');
const { uploadToExternalService, updateFileOnExternalService, deleteFileFromExternalService } = require('../utils/fileUpload');

const formatBlogDate = (date) => {
  if (!date) {
    return '';
  }
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const createBlogs = {
    validation: {
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            sort_description: Joi.string().trim().required(),
            long_description: Joi.string().trim().required(),
            date: Joi.date().required(),
            image: Joi.string().allow(),
        }),
    },
    handler: async (req, res) => {
        try {
            const { title } = req.body;

            const blogsExist = await Blogs.findOne({ $or: [{ title }] });

            if (blogsExist) {
                return res.status(httpStatus.BAD_REQUEST).json({ message: 'Blog this name already exists' });
            }

            let imageUrl = req.body.image || '';
            if (req.file) {
                imageUrl = await uploadToExternalService(req.file, 'blogs_image');
            }

            const blogs = await Blogs.create({
                ...req.body,
                image: imageUrl,
            });

            return res.status(201).json({
                success: true,
                message: "Blog created successfully!",
                blogs
            });
        } catch (error) {
            res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
        }
    }
}

const getAllBlogs = {
    handler: async (req, res) => {
        const { status, search } = req.query;
        const query = {};

        if (status) query.status = status;
        if (search) query.title = { $regex: search, $options: "i" };

        const originalJson = res.json.bind(res);

        res.json = (payload) => {
            if (payload && Array.isArray(payload.data)) {
                payload.data = payload.data.map((item) => ({
                    id: item.id,
                    title: item.title,
                    image: item.image,
                    description: item.sort_description,
                    blog_date: formatBlogDate(item.date),
                }));
            }
            return originalJson(payload);
        };

        await handlePagination(Blogs, req, res, query, { date: -1, createdAt: -1 });
    },
};

const getBlogById = {

    handler: async (req, res) => {
        try {
            const { _id } = req.params;

            if (!mongoose.Types.ObjectId.isValid(_id)) {
                return res.status(httpStatus.BAD_REQUEST).json({ message: "Invalid blog id" });
            }

            const blog = await Blogs.findById(_id);

            if (!blog) {
                return res.status(404).json({ message: "Blog not found" });
            }

            const related = await Blogs.find({ _id: { $ne: _id } })
                .sort({ date: -1, createdAt: -1 })
                .limit(5);

            const blogData = {
                id: blog.id,
                title: blog.title,
                image: blog.image,
                description: blog.sort_description,
                long_description: blog.long_description,
                blog_date: formatBlogDate(blog.date),
            };

            const relatedBlogs = related.map((item) => ({
                id: item.id,
                title: item.title,
                image: item.image,
                description: item.sort_description,
                blog_date: formatBlogDate(item.date),
            }));

            res.status(200).json({
                blog_data: blogData,
                related_blogs: relatedBlogs,
            });
        } catch (error) {
            res.status(500).json({ message: "Internal Server Error" });
        }
    }
};

const updateBlogs = {
    validation: {
        body: Joi.object().keys({
            title: Joi.string().trim().required(),
            sort_description: Joi.string().trim().required(),
            long_description: Joi.string().trim().required(),
            date: Joi.date().required(),
            image: Joi.string().allow(),
        })
            .prefs({ convert: true }),
    },
    handler: async (req, res) => {

        const { _id } = req.params;

        const blogsExist = await Blogs.findOne({ _id });

        if (!blogsExist) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Blogs not exist');
        }

        let imageUrl = req.body.image || blogsExist.image || '';

        if (req.file) {
            if (blogsExist.image) {
                imageUrl = await updateFileOnExternalService(blogsExist.image, req.file);
            } else {
                imageUrl = await uploadToExternalService(req.file, 'blogs_image');
            }
        }

        const updateData = {
            ...req.body,
            image: imageUrl,
        };

        const blogs = await Blogs.findByIdAndUpdate(_id, updateData, { new: true });

        res.send({
            success: true,
            message: "Blog updated successfully!",
            data: blogs,
        });
    }

}

const deleteBlogs = {
    handler: async (req, res) => {
        const { _id } = req.params;

        const blogsExist = await Blogs.findOne({ _id });

        if (!blogsExist) {
            throw new ApiError(httpStatus.BAD_REQUEST, 'Blogs not exist');
        }

        if (blogsExist.image) {
            await deleteFileFromExternalService(blogsExist.image);
        }

        await Blogs.findByIdAndDelete(_id);

        res.send({ message: 'Blogs deleted successfully' });
    }
}

const bulkDeleteBlogs = {
  validation: {
    body: Joi.object().keys({
      ids: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
    }),
  },
  handler: async (req, res) => {
    const { ids } = req.body;

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    const blogs = await Blogs.find({ _id: { $in: objectIds } });

    if (blogs.length !== ids.length) {
      return res.status(httpStatus.BAD_REQUEST).json({ message: 'One or more blogs do not exist' });
    }

    for (const blog of blogs) {
      if (blog.image) {
        await deleteFileFromExternalService(blog.image);
      }
    }

    await Blogs.deleteMany({ _id: { $in: objectIds } });

    res.send({ message: 'Blogs deleted successfully' });
  },
};

module.exports = {
    createBlogs,
    getAllBlogs,
    getBlogById,
    updateBlogs,
    deleteBlogs,
    bulkDeleteBlogs
};

