const httpStatus = require('http-status');
const Joi = require('joi');
const mongoose = require('mongoose');
const { Contact } = require('../models');

const contactSchema = Joi.object().keys({
  name: Joi.string().trim().min(2).max(100).required().messages({
    'string.empty': 'Name is required',
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters'
  }),
  email: Joi.string().email().trim().required().messages({
    'string.empty': 'Email is required',
    'string.email': 'Please enter a valid email address'
  }),
  phone: Joi.string().trim().pattern(/^[+]?[0-9\s\-\(\)]{10,15}$/).optional().messages({
    'string.pattern.base': 'Please enter a valid phone number'
  }),
  message: Joi.string().trim().min(10).max(1000).required().messages({
    'string.empty': 'Message is required',
    'string.min': 'Message must be at least 10 characters',
    'string.max': 'Message cannot exceed 1000 characters'
  }),
});

const createContact = {
  validation: {
    body: contactSchema,
  },
  handler: async (req, res) => {
    try {
      const { name, email, phone, message } = req.body;

      // Check for duplicate recent submissions (within last 5 minutes)
      const recentSubmission = await Contact.findOne({
        email: email.toLowerCase(),
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
      });

      if (recentSubmission) {
        return res.status(httpStatus.TOO_MANY_REQUESTS).json({
          success: false,
          message: 'Please wait 5 minutes before submitting another message'
        });
      }

      const contact = await Contact.create({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        phone: phone?.trim(),
        message: message.trim(),
      });

      return res.status(201).json({
        success: true,
        message: 'Thank you for contacting us! We will get back to you within 24 hours.',
        data: {
          id: contact._id,
          name: contact.name,
          email: contact.email,
          message: contact.message,
          createdAt: contact.createdAt
        },
      });
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to send your message. Please try again later.'
      });
    }
  },
};

const getAllContacts = {
  handler: async (req, res) => {
    try {
      const { search, page = 1, limit = 10 } = req.query;
      let query = {};
      
      if (search) {
        query = {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { message: { $regex: search, $options: 'i' } }
          ]
        };
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await Contact.countDocuments(query);
      const contacts = await Contact.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Contacts fetched successfully',
        data: contacts,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(total / parseInt(limit)),
          total_items: total,
          per_page: parseInt(limit),
        },
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const getContactById = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid contact id' });
      }

      const contact = await Contact.findById(_id);

      if (!contact) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Contact not found' });
      }

      res.status(httpStatus.OK).json({
        success: true,
        message: 'Contact fetched successfully',
        data: contact,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const updateContactStatus = {
  validation: {
    body: Joi.object().keys({
      notes: Joi.string().trim().optional(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid contact id' });
      }

      const contact = await Contact.findById(_id);

      if (!contact) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Contact not found' });
      }

      // Just return the contact as is, since we removed status
      return res.send({
        success: true,
        message: 'Contact retrieved successfully!',
        data: contact,
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const deleteContact = {
  handler: async (req, res) => {
    try {
      const { _id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(_id)) {
        return res
          .status(httpStatus.BAD_REQUEST)
          .json({ message: 'Invalid contact id' });
      }

      const contact = await Contact.findById(_id);

      if (!contact) {
        return res
          .status(httpStatus.NOT_FOUND)
          .json({ message: 'Contact not found' });
      }

      await Contact.findByIdAndDelete(_id);

      res.send({
        success: true,
        message: 'Contact deleted successfully',
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

const bulkDeleteContacts = {
  validation: {
    body: Joi.object().keys({
      ids: Joi.array().items(Joi.string()).required(),
    }),
  },
  handler: async (req, res) => {
    try {
      const { ids } = req.body;

      const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

      const contacts = await Contact.find({ _id: { $in: objectIds } });

      if (contacts.length === 0) {
        return res.status(httpStatus.BAD_REQUEST).json({
          message: 'No contacts found to delete',
        });
      }

      await Contact.deleteMany({ _id: { $in: objectIds } });

      res.send({
        success: true,
        message: 'Contacts deleted successfully',
      });
    } catch (error) {
      res
        .status(httpStatus.INTERNAL_SERVER_ERROR)
        .json({ message: error.message });
    }
  },
};

module.exports = {
  createContact,
  getAllContacts,
  getContactById,
  updateContactStatus,
  deleteContact,
  bulkDeleteContacts,
};