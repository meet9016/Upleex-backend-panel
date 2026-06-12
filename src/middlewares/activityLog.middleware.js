const { logActivity } = require('../utils/activityLogger');

const activityLogMiddleware = async (req, res, next) => {
  // We only want to log after the request completes to capture the final status
  res.on('finish', async () => {
    // Only log modifying requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      // Ignore 4xx and 5xx errors (optional, but usually we only log successful actions)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        
        let moduleName = 'System';
        let action = req.method;
        
        // Determine action based on method
        if (req.method === 'POST') action = 'CREATE';
        if (req.method === 'PUT' || req.method === 'PATCH') action = 'UPDATE';
        if (req.method === 'DELETE') action = 'DELETE';

        // Very basic heuristic for module name based on URL
        const url = req.originalUrl || req.url;
        if (url.includes('/vendor')) moduleName = 'Vendors';
        else if (url.includes('/product') || url.includes('/approve')) moduleName = 'Products';
        else if (url.includes('/admin')) moduleName = 'Admins';
        else if (url.includes('/category')) moduleName = 'Categories';
        else if (url.includes('/order')) moduleName = 'Orders';
        else if (url.includes('/auth') || url.includes('/login')) moduleName = 'Auth';

        // Check if user is authenticated (depends on auth middleware running first)
        const userId = req.user && (req.user._id || req.user.id);
        const userType = req.user && req.user.userType;
        
        // Log if user is admin or vendor
        if (userId && (userType === 'admin' || userType === 'vendor')) {
          // Exclude login here if we already log it explicitly, or just let it log
          if (!url.includes('/login')) {
            const actorName = userType === 'admin' ? 'Admin' : 'Vendor';
            const description = `${actorName} performed ${action} on ${moduleName} (Route: ${url})`;
            await logActivity(req, userId, action, moduleName, description, {
              body: req.body,
              query: req.query,
              params: req.params,
              url: url
            }, userType);
          }
        }
      }
    }
  });

  next();
};

module.exports = activityLogMiddleware;
