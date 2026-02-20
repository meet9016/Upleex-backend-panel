const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const Joi = require('joi');
const { Question } = require('../models');
const { handlePagination } = require('../utils/helper');


const createQuestion = {
  validation: {
    body: Joi.object().keys({
      title: Joi.string().trim().required(),
      tag: Joi.string().required(),
      rating: Joi.number(),
      total_reviews: Joi.number(),
      features: Joi.array().items(Joi.string()),
      sort_description: Joi.string().allow(''),
      description: Joi.string().allow(''),
      price: Joi.number()
    }),
  },
  handler: async (req, res) => {
    try {
      const { title } = req.body;

      const questionExist = await Question.findOne({ title });

      if (questionExist) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Question already exist');
      }

      const question = await Question.create(req.body);

      return res.status(201).json({
        success: true,
        message: "Question created successfully!",
        data: question
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Failed to create live course",
        error: error.message,
      });
    }
  }
}

const getAllQuestion = {
  handler: async (req, res) => {
    const { status, search } = req.query;

    const query = {};

    if (status) query.status = status;
    if (search) query.title = { $regex: search, $options: "i" };

    await handlePagination(Question, req, res, query);
  }
}

const getLiveCoursesById = {

  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      // 🔍 Find blog by MongoDB ID
      const pre_recorded = await Question.findById(_id);

      if (!pre_recorded) {
        return res.status(404).json({ message: "Question not found" });
      }

      res.status(200).json(pre_recorded);
    } catch (error) {
      console.error("Error fetching blog by ID:", error);
      res.status(500).json({ message: "Internal Server Error" });
    }
  }
};

const updateQuestion = {
  validation: {
    body: Joi.object().keys({
      title: Joi.string().trim().required(),
      tag: Joi.string().required(),
      rating: Joi.number(),
      total_reviews: Joi.number(),
      features: Joi.array().items(Joi.string()),
      sort_description: Joi.string().allow(''),
      description: Joi.string().allow(''),
      price: Joi.number()
    }),
  },
  handler: async (req, res) => {

    const { _id } = req.params;

    const questionExist = await Question.findOne({ _id });

    if (!questionExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Question not exist');
    }

    if (req.body?.title) {
      const questionExist = await Question.findOne({ name: req.body.title, _id: { $ne: _id } });
      if (questionExist) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Question already exist');
      }
    }

    const question = await Question.findByIdAndUpdate(_id, req.body, { new: true });

    res.send({
      success: true,
      message: "Question updated successfully!",
      question
    });
  }

}

const deleteQuestion = {
  handler: async (req, res) => {
    const { _id } = req.params;

    const questionExist = await Question.findOne({ _id });

    if (!questionExist) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Question not exist');
    }

    await Question.findByIdAndDelete(_id);

    res.send({ message: 'Question deleted successfully' });
  }
}

module.exports = {
  createQuestion,
  getAllQuestion,
  getLiveCoursesById,
  updateQuestion,
  deleteQuestion
};