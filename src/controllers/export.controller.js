const httpStatus = require('http-status');
const Product = require('../models/product.model');
const GetQuote = require('../models/getQuote.model');
const Order = require('../models/order.model');
const VendorPayment = require('../models/vendorPayment.model');
const Wallet = require('../models/wallet.model');
const Service = require('../models/service.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/user.model');
const { exportToExcel, exportToPDF } = require('../utils/export.helper');

// Export Products to Excel
const exportProductsToExcel = {
  handler: async (req, res) => {
    try {
      const { vendor_id, category_id, sub_category_id, filter_rent_sell, filter_tenure, search, status } = req.query;
      const user = req.user;

      // Build query - IMPORTANT: Filter by vendor
      const query = {};

      // If vendor_id is provided in query, use it (for admin)
      if (vendor_id) {
        query.vendor_id = vendor_id;
      }
      // If user is logged in and is a vendor, only show their products
      else if (user && user.userType === 'vendor') {
        query.vendor_id = user.id || user._id;
      }
      // If no vendor specified and not a vendor user, show only approved products
      else {
        query.approval_status = 'approved';
      }
      if (status) query.status = status;
      if (category_id) query.category_id = category_id;
      if (sub_category_id && sub_category_id !== 'all') query.sub_category_id = sub_category_id;
      if (filter_rent_sell === '1') query.product_type_name = 'Rent';
      else if (filter_rent_sell === '2') query.product_type_name = 'Sell';
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { product_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex }
        ];
      }

      const products = await Product.find(query).sort({ createdAt: -1 });

      const columns = [
        { header: 'Product Name', key: 'product_name', width: 25 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'Sub Category', key: 'sub_category_name', width: 20 },
        { header: 'Type', key: 'product_type_name', width: 15 },
        { header: 'Price (₹)', key: 'price', width: 15 },
        { header: 'Cancel Price (₹)', key: 'cancel_price', width: 15 },
        { header: 'Listing Type', key: 'product_listing_type_name', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Created Date', key: 'createdAt', width: 15 },
        { header: 'Expires On', key: 'expires_at', width: 15 }
      ];

      const data = products.map(product => ({
          product_name: product.product_name || '',
          category_name: product.category_name || '',
          sub_category_name: product.sub_category_name || '',
          product_type_name: product.product_type_name || '',
          price: product.price ? `₹${Number(product.price).toFixed(2)}` : '₹0.00',
          cancel_price: product.cancel_price ? `₹${Number(product.cancel_price).toFixed(2)}` : '₹0.00',
          product_listing_type_name: product.product_listing_type_name || '',
          status: product.status || '',
          vendor_name: product.vendor_name || 'N/A',
          createdAt: product.createdAt ? new Date(product.createdAt).toLocaleDateString() : '',
          expires_at: product.expires_at ? new Date(product.expires_at).toLocaleDateString() : ''
        }));
      const filename = user && user.userType === 'vendor'
        ? `my_products_${new Date().toISOString().split('T')[0]}.xlsx`
        : `products_${new Date().toISOString().split('T')[0]}.xlsx`;

      await exportToExcel(res, data, columns, filename, 'Products');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Products to PDF
const exportProductsToPDF = {
  handler: async (req, res) => {
    try {
      const { vendor_id, category_id, sub_category_id, filter_rent_sell, filter_tenure, search, status } = req.query;
      const user = req.user;

      // Build query - IMPORTANT: Filter by vendor (same as Excel)
      const query = {};

      // If vendor_id is provided in query, use it (for admin)
      if (vendor_id) {
        query.vendor_id = vendor_id;
      }
      // If user is logged in and is a vendor, only show their products
      else if (user && user.userType === 'vendor') {
        query.vendor_id = user.id || user._id;
      }
      // If no vendor specified and not a vendor user, show only approved products
      else {
        query.approval_status = 'approved';
      }

      if (status) query.status = status;
      if (category_id) query.category_id = category_id;
      if (sub_category_id && sub_category_id !== 'all') query.sub_category_id = sub_category_id;
      if (filter_rent_sell === '1') query.product_type_name = 'Rent';
      else if (filter_rent_sell === '2') query.product_type_name = 'Sell';
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { product_name: searchRegex },
          { description: searchRegex },
          { category_name: searchRegex }
        ];
      }

      const products = await Product.find(query).sort({ createdAt: -1 });

      const headers = ['Product Name', 'Category', 'Type', 'Price', 'Status', 'Vendor'];
      const columnWidths = [150, 100, 60, 80, 60, 85];
      const title = user && user.userType === 'vendor' ? 'My Products Report' : 'Products Report';
      const filename = user && user.userType === 'vendor'
        ? `my_products_${new Date().toISOString().split('T')[0]}.pdf`
        : `products_${new Date().toISOString().split('T')[0]}.pdf`;

      const rowMapper = (product) => [
            product.product_name || '',
            product.category_name || '',
            product.product_type_name || '',
            product.price ? `₹${Number(product.price).toFixed(2)}` : '₹0.00',
            product.status || '',
            product.vendor_name || 'N/A'
          ];

      await exportToPDF(res, products, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Quotes to Excel
const exportQuotesToExcel = {
  handler: async (req, res) => {
    try {
      const { status, search, product_type, listing_type, month } = req.query;
      const user = req.user;

      const query = {};
      if (user.userType === 'vendor') {
        const vendorProducts = await Product.find({ vendor_id: user._id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      } else {
        query.user_id = user._id;
      }

      if (status) query.status = status;
      if (month) query.months_id = month;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ note: searchRegex }, { status: searchRegex }];
      }

      const quotes = await GetQuote.find(query).populate('product_id').sort({ createdAt: -1 });

      const columns = [
        { header: 'Quote ID', key: 'quote_id', width: 15 },
        { header: 'Product Name', key: 'product_name', width: 25 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'Quantity', key: 'qty', width: 12 },
        { header: 'Days', key: 'number_of_days', width: 12 },
        { header: 'Price (₹)', key: 'calculated_price', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Delivery Date', key: 'delivery_date', width: 15 },
        { header: 'Note', key: 'note', width: 30 },
        { header: 'Created Date', key: 'createdAt', width: 15 }
      ];

      const data = quotes.map(quote => ({
          quote_id: quote._id.toString().slice(-8),
          product_name: quote.product_id?.product_name || '',
          category: quote.product_id?.category_name || '',
          qty: quote.qty || 1,
          number_of_days: quote.number_of_days || '',
          calculated_price: quote.calculated_price ? `₹${Number(quote.calculated_price).toFixed(2)}` : '₹0.00',
          status: quote.status || '',
          delivery_date: quote.delivery_date ? new Date(quote.delivery_date).toLocaleDateString() : '',
          note: quote.note || '',
          createdAt: quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : ''
        }));

      await exportToExcel(res, data, columns, `quotes_${Date.now()}.xlsx`, 'Quotes');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Quotes to PDF
const exportQuotesToPDF = {
  handler: async (req, res) => {
    try {
      const { status, search, product_type, listing_type, month } = req.query;
      const user = req.user;

      const query = {};
      if (user.userType === 'vendor') {
        const vendorProducts = await Product.find({ vendor_id: user._id }).select('_id');
        const productIds = vendorProducts.map(p => p._id);
        query.product_id = { $in: productIds };
      } else {
        query.user_id = user._id;
      }

      if (status) query.status = status;
      if (month) query.months_id = month;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ note: searchRegex }, { status: searchRegex }];
      }

      const quotes = await GetQuote.find(query).populate('product_id').sort({ createdAt: -1 });

      const headers = ['Quote ID', 'Product', 'Qty', 'Price', 'Status'];
      const columnWidths = [100, 200, 60, 100, 100];
      const filename = `quotes_${Date.now()}.pdf`;
      const title = 'Quotes Report';

      const rowMapper = (quote) => [
          quote._id.toString().slice(-8),
          quote.product_id?.product_name || '',
          quote.qty || '1',
          quote.calculated_price ? `₹${Number(quote.calculated_price).toFixed(2)}` : '₹0.00',
          quote.status || ''
        ];

      await exportToPDF(res, quotes, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Orders to Excel
const exportOrdersToExcel = {
  handler: async (req, res) => {
    try {
      const { status, search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      // Build query
      const query = { 'items.vendor_id': vendorId };
      if (status && status !== 'all') query.vendor_status = status;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ order_id: searchRegex }, { 'user_id.name': searchRegex }];
      }

      const orders = await Order.find(query).populate('user_id', 'name email phone').sort({ createdAt: -1 });

      const columns = [
        { header: 'Order ID', key: 'order_id', width: 15 },
        { header: 'Customer', key: 'customer', width: 25 },
        { header: 'Items', key: 'items_count', width: 10 },
        { header: 'Amount (₹)', key: 'total_amount', width: 15 },
        { header: 'Order Status', key: 'vendor_status', width: 15 },
        { header: 'Payment Status', key: 'payment_status', width: 15 },
        { header: 'Date', key: 'createdAt', width: 15 }
      ];

      const data = orders.map(order => ({
          order_id: `#${order.order_id}`,
          customer: order.user_id?.name || 'N/A',
          items_count: order.items.filter(i => i.vendor_id === vendorId).length,
          total_amount: order.items.filter(i => i.vendor_id === vendorId).reduce((sum, i) => sum + i.final_amount, 0),
          vendor_status: order.vendor_status || 'pending',
          payment_status: order.payment_status || 'pending',
          createdAt: new Date(order.createdAt).toLocaleDateString()
        }));

      await exportToExcel(res, data, columns, `orders_${Date.now()}.xlsx`, 'Orders');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Payments to Excel
const exportPaymentsToExcel = {
  handler: async (req, res) => {
    try {
      const { status, search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const query = { vendor_id: vendorId };
      if (status && status !== 'all') query.payment_status = status;

      const payments = await VendorPayment.find(query).populate('order_id').sort({ createdAt: -1 });

      const columns = [
        { header: 'Order ID', key: 'order_id', width: 15 },
        { header: 'Vendor Amount (₹)', key: 'vendor_amount', width: 15 },
        { header: 'Payment Status', key: 'payment_status', width: 15 },
        { header: 'Delivered At', key: 'delivered_at', width: 15 },
        { header: 'Release Date', key: 'release_date', width: 15 },
        { header: 'Notes', key: 'notes', width: 30 }
      ];

      const data = payments.map(payment => ({
          order_id: `#${payment.order_id?.order_id || 'N/A'}`,
          vendor_amount: payment.vendor_amount,
          payment_status: payment.payment_status,
          delivered_at: new Date(payment.delivered_at).toLocaleDateString(),
          release_date: new Date(payment.release_date).toLocaleDateString(),
          notes: payment.notes || ''
        }));

      await exportToExcel(res, data, columns, `payments_${Date.now()}.xlsx`, 'Payments');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Orders to PDF
const exportOrdersToPDF = {
  handler: async (req, res) => {
    try {
      const { status, search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const query = { 'items.vendor_id': vendorId };
      if (status && status !== 'all') query.vendor_status = status;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ order_id: searchRegex }, { 'user_id.name': searchRegex }];
      }

      const orders = await Order.find(query).populate('user_id', 'name email').sort({ createdAt: -1 });

      const headers = ['Order ID', 'Customer', 'Amount', 'Status', 'Date'];
      const columnWidths = [100, 150, 80, 100, 100];
      const filename = `orders_${Date.now()}.pdf`;
      const title = 'Orders Report';

      const rowMapper = (order) => {
        const vendorTotal = order.items.filter(i => i.vendor_id === vendorId).reduce((sum, i) => sum + i.final_amount, 0);
        return [
          `#${order.order_id}`,
          order.user_id?.name || 'N/A',
          `₹${Number(vendorTotal).toFixed(2)}`,
          order.vendor_status || 'pending',
          new Date(order.createdAt).toLocaleDateString()
        ];
      };

      await exportToPDF(res, orders, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Payments to PDF
const exportPaymentsToPDF = {
  handler: async (req, res) => {
    try {
      const { status } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const query = { vendor_id: vendorId };
      if (status && status !== 'all') query.payment_status = status;

      const payments = await VendorPayment.find(query).populate('order_id').sort({ createdAt: -1 });

      const headers = ['Order ID', 'Amount', 'Status', 'Delivered', 'Release'];
      const columnWidths = [100, 100, 100, 100, 130];
      const filename = `payments_${Date.now()}.pdf`;
      const title = 'Payments Report';

      const rowMapper = (payment) => [
        `#${payment.order_id?.order_id || 'N/A'}`,
        `₹${Number(payment.vendor_amount).toFixed(2)}`,
        payment.payment_status,
        new Date(payment.delivered_at).toLocaleDateString(),
        new Date(payment.release_date).toLocaleDateString()
      ];

      await exportToPDF(res, payments, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Wallet Transactions to Excel
const exportWalletTransactionsToExcel = {
  handler: async (req, res) => {
    try {
      const { type, status, search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const wallet = await Wallet.findOne({ vendor_id: vendorId });
      if (!wallet) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Wallet not found' });
      }

      let transactions = [...wallet.transactions];
      if (type && type !== 'all') transactions = transactions.filter(t => t.type === type);
      if (status && status !== 'all') transactions = transactions.filter(t => t.status === status);
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        transactions = transactions.filter(t => searchRegex.test(t.description) || searchRegex.test(t.transaction_id));
      }

      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const columns = [
        { header: 'Transaction ID', key: 'transaction_id', width: 20 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Date', key: 'createdAt', width: 20 }
      ];

      const data = transactions.map(t => ({
        transaction_id: t.transaction_id || 'N/A',
        description: t.description || '',
        type: t.type?.toUpperCase() || '',
        amount: t.amount || 0,
        status: t.status?.toUpperCase() || '',
        createdAt: new Date(t.createdAt).toLocaleString('en-IN')
      }));

      await exportToExcel(res, data, columns, `wallet_transactions_${Date.now()}.xlsx`, 'Wallet Transactions');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Wallet Transactions to PDF
const exportWalletTransactionsToPDF = {
  handler: async (req, res) => {
    try {
      const { type, status, search, vendor_id } = req.query;
      const user = req.user;
      const vendorId = vendor_id || user?.id || user?._id;

      const wallet = await Wallet.findOne({ vendor_id: vendorId });
      if (!wallet) {
        return res.status(httpStatus.NOT_FOUND).json({ message: 'Wallet not found' });
      }

      let transactions = [...wallet.transactions];
      if (type && type !== 'all') transactions = transactions.filter(t => t.type === type);
      if (status && status !== 'all') transactions = transactions.filter(t => t.status === status);
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        transactions = transactions.filter(t => searchRegex.test(t.description) || searchRegex.test(t.transaction_id));
      }

      transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const headers = ['Description', 'Type', 'Amount', 'Status', 'Date'];
      const columnWidths = [195, 60, 80, 80, 100];
      const filename = `wallet_transactions_${Date.now()}.pdf`;
      const title = 'Wallet Transactions Report';

      const rowMapper = (t) => [
        t.description || '',
        t.type?.toUpperCase() || '',
        `₹${Number(t.amount).toFixed(2)}`,
        t.status?.toUpperCase() || '',
        new Date(t.createdAt).toLocaleDateString('en-IN')
      ];

      await exportToPDF(res, transactions, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Services to Excel
const exportServicesToExcel = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const query = { vendor_id: vendorId };
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ service_name: searchRegex }, { category_name: searchRegex }];
      }

      const services = await Service.find(query).sort({ createdAt: -1 });

      const columns = [
        { header: 'Service Name', key: 'service_name', width: 30 },
        { header: 'Category', key: 'category_name', width: 20 },
        { header: 'Price (₹)', key: 'price', width: 15 },
        { header: 'Duration', key: 'duration', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Approval Status', key: 'approval_status', width: 15 },
        { header: 'Created Date', key: 'createdAt', width: 20 }
      ];

      const data = services.map(s => ({
          service_name: s.service_name || '',
          category_name: s.category_name || '',
          price: s.price ? `₹${Number(s.price).toFixed(2)}` : '₹0.00',
          duration: s.duration || '',
          status: s.status || '',
          approval_status: s.approval_status || '',
          createdAt: new Date(s.createdAt).toLocaleDateString()
        }));

      await exportToExcel(res, data, columns, `services_${Date.now()}.xlsx`, 'Services');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Services to PDF
const exportServicesToPDF = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;
      const user = req.user;
      const vendorId = user.id || user._id;

      const query = { vendor_id: vendorId };
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ service_name: searchRegex }, { category_name: searchRegex }];
      }

      const services = await Service.find(query).sort({ createdAt: -1 });

      const headers = ['Service Name', 'Category', 'Price', 'Status', 'Duration'];
      const columnWidths = [150, 100, 80, 80, 90];
      const filename = `services_${Date.now()}.pdf`;
      const title = 'Services Report';

      const rowMapper = (s) => [
        s.service_name || '',
        s.category_name || '',
        s.price ? `₹${Number(s.price).toFixed(2)}` : '₹0.00',
        s.status || '',
        s.duration || ''
      ];

      await exportToPDF(res, services, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Vendors to Excel
const exportVendorsToExcel = {
  handler: async (req, res) => {
    try {
      const { status, search, vendor_name, business_name, vendor_type } = req.query;

      const query = {};
      if (status && status !== 'all') query.status = status;
      if (vendor_type && vendor_type !== 'all') query.vendor_type = vendor_type;
      if (vendor_name) {
        const searchRegex = new RegExp(vendor_name.trim(), 'i');
        query['ContactDetails.full_name'] = searchRegex;
      }
      if (business_name) {
        const searchRegex = new RegExp(business_name.trim(), 'i');
        query['Identity.business_name'] = searchRegex;
      }
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { 'ContactDetails.full_name': searchRegex },
          { 'ContactDetails.email': searchRegex },
          { 'Identity.business_name': searchRegex }
        ];
      }

      const vendors = await VendorKyc.find(query).sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Email', key: 'email', width: 25 },
        { header: 'Phone', key: 'phone', width: 10 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Vendor Type', key: 'vendor_type', width: 15 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'KYC Progress', key: 'kyc_progress', width: 15 },
        { header: 'Created Date', key: 'createdAt', width: 15 }
      ];

      const data = vendors.map(vendor => ({
        vendor_name: vendor.ContactDetails?.full_name || '-',
        email: vendor.ContactDetails?.email || '-',
        phone: vendor.ContactDetails?.mobile || '-',
        business_name: vendor.Identity?.business_name || '-',
        vendor_type: vendor.vendor_type ? vendor.vendor_type.charAt(0).toUpperCase() + vendor.vendor_type.slice(1) : 'Both',
        pancard_number: vendor.Identity?.pancard_number || '-',
        gst_number: vendor.Identity?.gst_number || '-',
        status: vendor.status ? vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1) : 'Pending',
        kyc_progress: `${vendor.completed_pages?.length || 0} pages`,
        createdAt: vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString() : ''
      }));

      await exportToExcel(res, data, columns, `vendors_${new Date().toISOString().split('T')[0]}.xlsx`, 'Vendors');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Vendors to PDF
const exportVendorsToPDF = {
  handler: async (req, res) => {
    try {
      const { status, search, vendor_name, business_name, vendor_type } = req.query;

      const query = {};
      if (status && status !== 'all') query.status = status;
      if (vendor_type && vendor_type !== 'all') query.vendor_type = vendor_type;
      if (vendor_name) {
        const searchRegex = new RegExp(vendor_name.trim(), 'i');
        query['ContactDetails.full_name'] = searchRegex;
      }
      if (business_name) {
        const searchRegex = new RegExp(business_name.trim(), 'i');
        query['Identity.business_name'] = searchRegex;
      }
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { 'ContactDetails.full_name': searchRegex },
          { 'ContactDetails.email': searchRegex },
          { 'Identity.business_name': searchRegex }
        ];
      }

      const vendors = await VendorKyc.find(query).sort({ createdAt: -1 });

      const headers = ['Vendor Name', 'Email', 'Phone', 'Business Name', 'Type', 'Status', 'Progress'];
      const columnWidths = [120, 150, 110, 150, 90, 100, 100];
      const filename = `vendors_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Vendors Report';

      const rowMapper = (vendor) => [
        vendor.ContactDetails?.full_name || '-',
        vendor.ContactDetails?.email || '-',
        vendor.ContactDetails?.mobile || '-',
        vendor.Identity?.business_name || '-',
        vendor.vendor_type ? vendor.vendor_type.charAt(0).toUpperCase() + vendor.vendor_type.slice(1) : 'Both',
        vendor.status ? vendor.status.charAt(0).toUpperCase() + vendor.status.slice(1) : 'Pending',
        `${vendor.completed_pages?.length || 0} pages`
      ];

      await exportToPDF(res, vendors, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Vendor Wallets to Excel (All vendors wallet summary)
const exportVendorWalletsToExcel = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;

      let searchQuery = {};
      if (search) {
        // First find matching vendors
        const matchingVendors = await Vendor.find({
          $or: [
            { full_name: { $regex: search, $options: 'i' } },
            { business_name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ]
        }).select('_id');

        const vendorIds = matchingVendors.map(v => v._id);
        searchQuery = { vendor_id: { $in: vendorIds } };
      }

      // Get all wallets with vendor info
      const wallets = await Wallet.find(searchQuery)
        .populate('vendor_id', 'full_name email business_name')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 25 },
        { header: 'Vendor Email', key: 'vendor_email', width: 30 },
        { header: 'Current Balance (₹)', key: 'balance', width: 18 },
        { header: 'Total Credited (₹)', key: 'total_credited', width: 18 },
        { header: 'Total Debited (₹)', key: 'total_debited', width: 18 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Transaction Count', key: 'transaction_count', width: 16 },
        { header: 'Currency', key: 'currency', width: 12 }
      ];

      const data = wallets.map(wallet => ({
        vendor_name: wallet.vendor_id?.full_name || 'N/A',
        vendor_email: wallet.vendor_id?.email || 'N/A',
        balance: `₹${Number(wallet.balance || 0).toFixed(2)}`,
        total_credited: `₹${Number(wallet.total_credited || 0).toFixed(2)}`,
        total_debited: `₹${Number(wallet.total_debited || 0).toFixed(2)}`,
        status: wallet.is_active ? 'Active' : 'Inactive',
        transaction_count: wallet.transaction_count || 0,
        currency: wallet.currency || 'INR'
      }));

      await exportToExcel(res, data, columns, `vendor_wallets_${new Date().toISOString().split('T')[0]}.xlsx`, 'Vendor Wallets');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Vendor Wallets to PDF (All vendors wallet summary)
const exportVendorWalletsToPDF = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;

      let searchQuery = {};
      if (search) {
        // First find matching vendors
        const matchingVendors = await Vendor.find({
          $or: [
            { full_name: { $regex: search, $options: 'i' } },
            { business_name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
          ]
        }).select('_id');

        const vendorIds = matchingVendors.map(v => v._id);
        searchQuery = { vendor_id: { $in: vendorIds } };
      }

      // Get all wallets with vendor info
      const wallets = await Wallet.find(searchQuery)
        .populate('vendor_id', 'full_name email business_name')
        .sort({ createdAt: -1 });

      const headers = ['Vendor Name', 'Email', 'Balance', 'Credited', 'Debited', 'Status', 'Count'];
      const columnWidths = [140, 160, 100, 100, 100, 90, 80];
      const filename = `vendor_wallets_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Vendor Wallets Report';

      const rowMapper = (wallet) => [
        wallet.vendor_id?.full_name || 'N/A',
        wallet.vendor_id?.email || 'N/A',
        `₹${Number(wallet.balance || 0).toFixed(2)}`,
        `₹${Number(wallet.total_credited || 0).toFixed(2)}`,
        `₹${Number(wallet.total_debited || 0).toFixed(2)}`,
        wallet.is_active ? 'Active' : 'Inactive',
        wallet.transaction_count || 0
      ];

      await exportToPDF(res, wallets, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

module.exports = {
  exportProductsToExcel,
  exportProductsToPDF,
  exportQuotesToExcel,
  exportQuotesToPDF,
  exportOrdersToExcel,
  exportOrdersToPDF,
  exportPaymentsToExcel,
  exportPaymentsToPDF,
  exportWalletTransactionsToExcel,
  exportWalletTransactionsToPDF,
  exportServicesToExcel,
  exportServicesToPDF,
  exportVendorsToExcel,
  exportVendorsToPDF,
  exportVendorWalletsToExcel,
  exportVendorWalletsToPDF
};