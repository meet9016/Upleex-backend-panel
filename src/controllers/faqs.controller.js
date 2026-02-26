const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const { FAQ } = require('../models');

const faqSchema = Joi.object().keys({
  question: Joi.string().trim().required(),
  answer: Joi.string().trim().required(),
});

const createFaq = {
  validation: {
    body: faqSchema,
  },
  handler: async (req, res) => {
    try {
      const { question } = req.body;

      const exists = await FAQ.findOne({ question: question.trim() });
      if (exists) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'FAQ with this question already exists' });
      }

      const faq = await FAQ.create({
        question: req.body.question,
        answer: req.body.answer,
      });

      return res.status(201).json({
        success: true,
        message: 'FAQ created successfully!',
        data: faq,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getAllFaqs = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;
      let query = {};
      
      if (search) {
        query = {
          $or: [
            { question: { $regex: search, $options: 'i' } },
            { answer: { $regex: search, $options: 'i' } }
          ]
        };
      }
      
      const faqs = await FAQ.find(query).sort({ createdAt: -1 });

      res.status(httpStatus.OK).json({
        success: true,
        message: 'FAQ list fetched successfully',
        data: faqs,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateFaq = {
  validation: {
    body: faqSchema,
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid FAQ id' });
      }

      const existing = await FAQ.findById(_id);

      if (!existing) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'FAQ not found' });
      }

      const duplicate = await FAQ.findOne({
        _id: { $ne: _id },
        question: req.body.question.trim(),
      });

      if (duplicate) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'FAQ with this question already exists' });
      }

      existing.question = req.body.question;
      existing.answer = req.body.answer;

      await existing.save();

      return res.send({
        success: true,
        message: 'FAQ updated successfully!',
        data: existing,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteFaq = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid FAQ id' });
      }

      const existing = await FAQ.findById(_id);

      if (!existing) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'FAQ not found' });
      }

      await FAQ.findByIdAndDelete(_id);

      res.send({
        success: true,
        message: 'FAQ deleted successfully',
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports = {
  createFaq,
  getAllFaqs,
  updateFaq,
  deleteFaq,
};

