const ActivityLog = require('../models/activityLog.model');

/**
 * Log an admin activity to the database
 * @param {Object} req - The Express request object (used to extract IP)
 * @param {ObjectId|String} adminId - The ID of the admin performing the action
 * @param {String} action - The action performed (e.g., LOGIN, CREATE, UPDATE, DELETE)
 * @param {String} module - The module affected (e.g., Auth, Vendor, Product)
 * @param {String} description - Detailed description of what happened
 * @param {Object} [metadata] - Optional additional info
 */
const logActivity = async (req, userId, action, moduleName, description, metadata = {}, actorType = 'admin') => {
  try {
    console.log('--- START logActivity ---');
    console.log('userId:', userId);
    console.log('actorType:', actorType);
    console.log('action:', action);
    console.log('moduleName:', moduleName);
    
    if (!userId) {
       console.log('logActivity aborted: no userId');
       return;
    }

    let ip_address = '';
    if (req) {
      ip_address = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    }

    const logData = {
      action,
      module: moduleName,
      description,
      ip_address,
      metadata,
      actor_type: actorType
    };

    if (actorType === 'vendor') {
      logData.vendor_id = userId;
    } else {
      logData.admin_id = userId;
    }

    const log = new ActivityLog(logData);

    await log.save();
    console.log('--- END logActivity: SUCCESS ---');
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

module.exports = {
  logActivity
};
