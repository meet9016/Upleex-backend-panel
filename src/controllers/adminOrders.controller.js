const httpStatus = require('http-status');
const { GetQuote, Order, Product } = require('../models');
const User = require('../models/user.model');
const Vendor = require('../models/vendor/vendor.model');

// ─── Helper ──────────────────────────────────────────────────────────────────
const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── GET /admin/orders/rent ───────────────────────────────────────────────────
// Returns all quotes (rent orders) with user, product and vendor info
const getRentOrders = {
  handler: async (req, res) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, status, payment_status, vendor_name, product_name } = req.query;

      // ── Resolve vendor_name → vendor IDs ──────────────────────────────────
      let vendorIdFilter = null;
      if (vendor_name && vendor_name.trim()) {
        const vendorRegex = new RegExp(vendor_name.trim(), 'i');
        const matchingVendors = await Vendor.find({
          $or: [{ business_name: vendorRegex }, { full_name: vendorRegex }],
        }).select('_id').lean();
        vendorIdFilter = matchingVendors.map((v) => v._id.toString());
      }

      // ── Resolve product_name / vendor filter → product IDs ────────────────
      let productIdFilter = null;
      if (product_name && product_name.trim()) {
        const productQuery = { product_name: new RegExp(product_name.trim(), 'i') };
        const matchingProducts = await Product.find(productQuery).select('_id').lean();
        productIdFilter = matchingProducts.map((p) => p._id);
      }

      // If vendor_name is supplied, also get the products belonging to those vendors
      if (vendorIdFilter !== null) {
        const vendorProductQuery = { vendor_id: { $in: vendorIdFilter } };
        const vendorProducts = await Product.find(vendorProductQuery).select('_id').lean();
        const vendorProductIds = vendorProducts.map((p) => p._id.toString());

        if (productIdFilter !== null) {
          // Intersection: must match both product name AND vendor
          productIdFilter = productIdFilter.filter((id) =>
            vendorProductIds.includes(id.toString())
          );
        } else {
          productIdFilter = vendorProducts.map((p) => p._id);
        }
      }

      // ── Build query ───────────────────────────────────────────────────────
      const query = {};
      if (status) query.status = status;
      if (payment_status) query.payment_status = payment_status;
      if (productIdFilter !== null) query.product_id = { $in: productIdFilter };

      // General search (user name/email + product name)
      if (search && search.trim() && productIdFilter === null) {
        const searchRegex = new RegExp(search.trim(), 'i');
        const matchingProducts = await Product.find({ product_name: searchRegex }).select('_id').lean();
        const matchingUsers = await User.find({
          $or: [
            { name: searchRegex },
            { first_name: searchRegex },
            { last_name: searchRegex },
            { email: searchRegex },
          ],
        }).select('_id').lean();

        query.$or = [
          { product_id: { $in: matchingProducts.map((p) => p._id) } },
          { user_id: { $in: matchingUsers.map((u) => u._id) } },
        ];
      }

      const [total, quotes] = await Promise.all([
        GetQuote.countDocuments(query),
        GetQuote.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate({
            path: 'user_id',
            select: 'name first_name last_name full_name email mobile phone',
          })
          .populate({
            path: 'product_id',
            select: 'product_name product_main_image product_type_name product_listing_type_name vendor_id price category_name sub_category_name',
          })
          .lean(),
      ]);

      // ── Enrich with vendor info ────────────────────────────────────────────
      const vendorIds = [
        ...new Set(quotes.map((q) => q.product_id?.vendor_id?.toString()).filter(Boolean)),
      ];
      let vendorMap = {};
      if (vendorIds.length) {
        const vendors = await Vendor.find({ _id: { $in: vendorIds } })
          .select('full_name business_name email number')
          .lean();
        vendors.forEach((v) => { vendorMap[v._id.toString()] = v; });
      }

      const enriched = quotes.map((q) => {
        const userId = q.user_id;
        const product = q.product_id;
        const vendorId = product?.vendor_id?.toString();
        const vendor = vendorId ? vendorMap[vendorId] : null;

        return {
          _id: q._id,
          user_name:
            userId?.full_name ||
            (userId?.first_name
              ? `${userId.first_name} ${userId.last_name || ''}`.trim()
              : userId?.name) ||
            'N/A',
          user_email: userId?.email || 'N/A',
          user_phone: userId?.mobile || userId?.phone || 'N/A',
          vendor_name: vendor?.business_name || vendor?.full_name || 'N/A',
          vendor_email: vendor?.email || 'N/A',
          vendor_phone: vendor?.number || 'N/A',
          product_name: product?.product_name || 'N/A',
          category_name: product?.category_name || 'N/A',
          subcategory_name: product?.sub_category_name || 'N/A',
          product_image: product?.product_main_image || '',
          product_type: product?.product_type_name || 'Rent',
          product_listing_type_name: product?.product_listing_type_name || '',
          qty: q.qty || 1,
          number_of_days: q.number_of_days || 0,
          start_date: q.start_date || null,
          end_date: q.end_date || null,
          amount: q.calculated_price || 0,
          quote_status: q.status,
          payment_status: q.payment_status,
          razorpay_payment_link: q.razorpay_payment_link || '',
          note: q.note || '',
          createdAt: q.createdAt,
          updatedAt: q.updatedAt,
        };
      });

      return res.status(httpStatus.OK).json({
        success: true,
        data: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error('Error in getRentOrders:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  },
};

// ─── GET /admin/orders/sell ───────────────────────────────────────────────────
// Returns all sell orders with full user, product and vendor info
const getSellOrders = {
  handler: async (req, res) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, payment_status, order_status, vendor_name, product_name } = req.query;

      // ── Resolve vendor_name → vendor IDs ──────────────────────────────────
      let vendorIdFilter = null;
      if (vendor_name && vendor_name.trim()) {
        const vendorRegex = new RegExp(vendor_name.trim(), 'i');
        const matchingVendors = await Vendor.find({
          $or: [{ business_name: vendorRegex }, { full_name: vendorRegex }],
        }).select('_id').lean();
        vendorIdFilter = matchingVendors.map((v) => v._id.toString());
      }

      // ── Build base query ──────────────────────────────────────────────────
      const query = {};
      if (payment_status) query.payment_status = payment_status;
      if (order_status) query.order_status = order_status;

      if (vendorIdFilter !== null) {
        query['items.vendor_id'] = { $in: vendorIdFilter };
      }

      if (product_name && product_name.trim()) {
        query['items.product_name'] = new RegExp(product_name.trim(), 'i');
      }

      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { user_name: searchRegex },
          { user_email: searchRegex },
          { order_id: searchRegex },
          { 'items.product_name': searchRegex },
        ];
      }

      const [total, orders] = await Promise.all([
        Order.countDocuments(query),
        Order.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('user_id', 'mobile phone')
          .lean(),
      ]);

      // ── Enrich with product info (Category / Subcategory) ──────────────────
      const allProductIds = [...new Set(orders.flatMap(o => o.items.map(i => i.product_id)).filter(Boolean))];
      let productMap = {};
      if (allProductIds.length) {
        const products = await Product.find({ _id: { $in: allProductIds } })
          .select('category_name sub_category_name')
          .lean();
        products.forEach(p => { productMap[p._id.toString()] = p; });
      }

      // ── Enrich with vendor info ────────────────────────────────────────────
      const allVendorIds = [
        ...new Set(
          orders.flatMap((o) => o.items.map((i) => i.vendor_id)).filter(Boolean)
        ),
      ];
      let vendorMap = {};
      if (allVendorIds.length) {
        try {
          const vendors = await Vendor.find({ _id: { $in: allVendorIds } })
            .select('full_name business_name email number')
            .lean();
          vendors.forEach((v) => { vendorMap[v._id.toString()] = v; });
        } catch (e) {
          console.warn('Could not load vendor info:', e.message);
        }
      }

      // Flatten orders → one row per item
      const enriched = orders.flatMap((order) =>
        order.items.map((item) => {
          const vendorId = item.vendor_id?.toString();
          const vendor = vendorId ? vendorMap[vendorId] : null;
          return {
            _id: `${order._id}-${item.product_id}`,
            order_db_id: order._id,
            order_id: order.order_id,
            user_name: order.user_name || 'N/A',
            user_email: order.user_email || 'N/A',
            user_phone: order.user_phone || order.user_id?.mobile || order.user_id?.phone || 'N/A',
            vendor_name: vendor?.business_name || vendor?.full_name || 'N/A',
            vendor_email: vendor?.email || 'N/A',
            vendor_phone: vendor?.number || 'N/A',
            product_name: item.product_name || 'N/A',
            category_name: productMap[item.product_id?.toString()]?.category_name || 'N/A',
            subcategory_name: productMap[item.product_id?.toString()]?.sub_category_name || 'N/A',
            product_image: item.product_image || '',
            quantity: item.quantity || 1,
            unit_price: item.price || 0,
            subtotal: item.subtotal || 0,
            gst_amount: item.gst_amount || 0,
            amount: item.final_amount || 0,
            total_order_amount: order.total_amount || 0,
            payment_status: order.payment_status,
            payment_type: order.payment_type || 'full',
            order_status: order.order_status,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        })
      );

      return res.status(httpStatus.OK).json({
        success: true,
        data: enriched,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      console.error('Error in getSellOrders:', error);
      return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  },
};

module.exports = { getRentOrders, getSellOrders };
