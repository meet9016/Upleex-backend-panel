const httpStatus = require('http-status');
const VendorKyc = require('../../models/vendor/vendorKyc.model');
const Product = require('../../models/product.model');

const getTopVendorsByProducts = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    // Aggregate products by vendor_id with optimized pipeline
    const productCounts = await Product.aggregate([
      {
        $match: {
          approval_status: 'approved',
          vendor_id: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$vendor_id',
          total_products: { $sum: 1 },
          sell_products: {
            $sum: {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /sell/i } },
                1,
                0
              ]
            }
          },
          rent_products: {
            $sum: {
              $cond: [
                { $regexMatch: { input: { $ifNull: ['$product_type_name', ''] }, regex: /rent/i } },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $sort: { total_products: -1 }
      },
      {
        $limit: limit
      }
    ]);

    if (productCounts.length === 0) {
      return res.status(httpStatus.OK).json({
        status: 200,
        success: true,
        message: 'No vendors with products found',
        data: []
      });
    }

    // Extract vendor_ids
    const vendorIds = productCounts.map(p => p._id);

    // Fetch vendor details
    const vendors = await VendorKyc.find({
      'ContactDetails.vendor_id': { $in: vendorIds }
    }).lean();

    // Create vendor map
    const vendorMap = {};
    vendors.forEach(v => {
      const vid = v.ContactDetails?.vendor_id;
      if (vid) {
        vendorMap[vid] = v;
      }
    });

    // Combine product counts with vendor details and add ranking
    const topVendors = productCounts.map((p, index) => {
      const vendor = vendorMap[p._id] || {};
      const contact = vendor.ContactDetails || {};
      const identity = vendor.Identity || {};

      return {
        rank: index + 1,
        _id: vendor._id,
        vendor_id: p._id,
        business_name: identity.business_name || contact.full_name || p._id,
        full_name: contact.full_name || identity.business_name || p._id,
        total_products: p.total_products,
        sell_products: p.sell_products,
        rent_products: p.rent_products
      };
    });

    return res.status(httpStatus.OK).json({
      status: 200,
      success: true,
      message: 'Top vendors by products fetched successfully',
      data: topVendors,
      metadata: {
        total_vendors: topVendors.length,
        limit: limit,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      status: 500,
      success: false,
      message: 'Failed to fetch top vendors',
      error: error.message
    });
  }
};

module.exports = {
  getTopVendorsByProducts
};
