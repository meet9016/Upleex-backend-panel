const express = require('express');
const validate = require('../../middlewares/validate');
const auth = require('../../middlewares/auth');
const catchAsync = require('../../utils/catchAsync');
const upload = require('../../middlewares/upload');
const { contactsController } = require('../../controllers');

const router = express.Router();

// Public route for creating contact (user-facing)
router.post(
  '/create-contact',
  upload.none(),
  validate(contactsController.createContact.validation),
  catchAsync(contactsController.createContact.handler)
);

// Admin routes (protected)
router.get(
  '/getall',
  auth('admin'),
  catchAsync(contactsController.getAllContacts.handler)
);

router.get(
  '/getById/:_id',
  auth('admin'),
  catchAsync(contactsController.getContactById.handler)
);

router.put(
  '/add-notes/:_id',
  auth('admin'),
  upload.none(),
  validate(contactsController.updateContactStatus.validation),
  catchAsync(contactsController.updateContactStatus.handler)
);

router.delete(
  '/delete/:_id',
  auth('admin'),
  catchAsync(contactsController.deleteContact.handler)
);

router.delete(
  '/bulk-delete',
  auth('admin'),
  upload.none(),
  validate(contactsController.bulkDeleteContacts.validation),
  catchAsync(contactsController.bulkDeleteContacts.handler)
);

module.exports = router;