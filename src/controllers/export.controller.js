const httpStatus = require('http-status');
const Product = require('../models/product.model');
const GetQuote = require('../models/getQuote.model');
const Order = require('../models/order.model');
const VendorPayment = require('../models/vendorPayment.model');
const Wallet = require('../models/wallet.model');
const Service = require('../models/service.model');
const VendorKyc = require('../models/vendor/vendorKyc.model');
const Vendor = require('../models/vendor/vendor.model');
const { exportToExcel, exportToPDF, exportToTreePDF, exportOrdersToTreePDF, exportQuotesToTreePDF } = require('../utils/export.helper');
const mongoose = require('mongoose');
const ListingPlanPurchase = require('../models/listingPlanPurchase.model');
const PriorityPlanPurchase = require('../models/priorityPlanPurchase.model');
const ServicePriorityPlanPurchase = require('../models/servicePriorityPlanPurchase.model');
const ServiceListingPlanPurchase = require('../models/serviceListingPlanPurchase.model');
const RentalBoostPlanPurchase = require('../models/rentalBoostPlanPurchase.model');
const GeneralPlanPurchase = require('../models/generalPlanPurchase.model');
const User = require('../models/user.model');

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

      const headers = ['Product Name', 'Category', 'Vendor', 'Type', 'Price', 'Status'];
      const columnWidths = [130, 130, 100, 50, 70, 55];
      const title = user && user.userType === 'vendor' ? 'My Products Report' : 'Products Report';
      const filename = user && user.userType === 'vendor'
        ? `my_products_${new Date().toISOString().split('T')[0]}.pdf`
        : `products_${new Date().toISOString().split('T')[0]}.pdf`;

      const rowMapper = (product) => [
        product.product_name || '',
        product.category_name || '',
        product.vendor_name || 'N/A',
         product.product_type_name
          ? product.product_type_name.charAt(0).toUpperCase() + product.product_type_name.slice(1).toLowerCase()
          : '',
        product.price ? `${Number(product.price).toFixed(2)}` : '0.00',
        product.status
          ?product.status.charAt(0).toUpperCase() +product.status.slice(1).toLowerCase()
          : '',
      ];

      // Column indexes: 0=Product Name, 1=Category, 2=Type, 3=Price, 4=Status, 5=Vendor
      const productCellColorMapper = (colIndex, value) => {
        if (colIndex === 3) {
          // Type column: Rent = blue, Sell = orange
          const v = value.toLowerCase();
          if (v === 'rent') return '#1565C0';
          if (v === 'sell') return '#E65100';
        }
        if (colIndex === 5) {
          // Status column: active = green, inactive = red
          const v = value.toLowerCase();
          if (v === 'active') return '#2E7D32';
          if (v === 'inactive') return '#C62828';
        }
        return null;
      };

      await exportToPDF(res, products, headers, columnWidths, filename, title, rowMapper, { cellColorMapper: productCellColorMapper });

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

      const quotes = await GetQuote.find(query).populate('product_id').populate('user_id', 'name email').sort({ createdAt: -1 });
      const filename = `quotes_${Date.now()}.pdf`;
      const title = 'Quotes Report';

      await exportQuotesToTreePDF(res, quotes, filename, title);

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
      const query = { 
        'items.vendor_id': vendorId,
        $or: [
          { payment_status: { $ne: 'pending' } },
          { payment_method: { $ne: 'razorpay' } }
        ]
      };
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

      const query = { 
        'items.vendor_id': vendorId,
        $or: [
          { payment_status: { $ne: 'pending' } },
          { payment_method: { $ne: 'razorpay' } }
        ]
      };
      if (status && status !== 'all') query.vendor_status = status;
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [{ order_id: searchRegex }, { 'user_id.name': searchRegex }];
      }

      const orders = await Order.find(query).populate('user_id', 'name email').sort({ createdAt: -1 });
      const filename = `orders_${Date.now()}.pdf`;
      const title = 'Orders Report';

      await exportOrdersToTreePDF(res, orders, filename, title);

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
        `${Number(payment.vendor_amount).toFixed(2)}`,
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

      const headers = ['Date', 'Amount', 'Description', 'Type', 'Status',];
      const columnWidths = [ 70, 70, 220, 80, 100];
      const filename = `wallet_transactions_${Date.now()}.pdf`;
      const title = 'Wallet Transactions Report';

      const rowMapper = (t) => [
        new Date(t.createdAt).toLocaleDateString('en-IN'),
        `${Number(t.amount).toFixed(2)}`,
        t.description || '',
        t.type
          ? t.type.charAt(0).toUpperCase() + t.type.slice(1).toLowerCase()
          : '',
        t.status ? t.status.charAt(0).toUpperCase() + t.status.slice(1).toLowerCase()
          : '',
      ];

      const productCellColorMapper = (colIndex, value) => {

        if (colIndex === 3) {
          // Type column: Credit = green, Debit = red
          if (value === 'Credit') return '#2E7D32';
          if (value === 'Debit') return '#E65100';
        }
        if (colIndex === 4) {
          // Status column: Completed = green, Pending = yellow
          if (value === 'Completed') return '#2E7D32';
          if (value === 'Pending') return '#e4af25';
        }
        return null;
      };

      await exportToPDF(res, transactions, headers, columnWidths, filename, title, rowMapper, { cellColorMapper: productCellColorMapper });


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
        s.price ? `${Number(s.price).toFixed(2)}` : '0.00',
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

// Export Users to Excel
const exportUsersToExcel = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;

      const query = {};
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { first_name: searchRegex },
          { last_name: searchRegex },
          { full_name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ];
      }

      const users = await User.find(query).sort({ createdAt: -1 });

      const columns = [
        { header: 'Full Name', key: 'full_name', width: 25 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 15 },
        { header: 'Platform', key: 'platform', width: 15 },
        { header: 'Join Date', key: 'createdAt', width: 15 }
      ];

      const data = users.map(user => ({
        full_name: user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name || 'N/A',
        email: user.email || 'N/A',
        phone: user.phone || user.mobile || 'N/A',
        platform: user.platform ? user.platform.charAt(0).toUpperCase() + user.platform.slice(1) : 'N/A',
        createdAt: user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'
      }));

      await exportToExcel(res, data, columns, `users_${new Date().toISOString().split('T')[0]}.xlsx`, 'Users');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Users to PDF
const exportUsersToPDF = {
  handler: async (req, res) => {
    try {
      const { search } = req.query;

      const query = {};
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        query.$or = [
          { first_name: searchRegex },
          { last_name: searchRegex },
          { full_name: searchRegex },
          { email: searchRegex },
          { phone: searchRegex }
        ];
      }

      const users = await User.find(query).sort({ createdAt: -1 });

      const headers = ['Full Name', 'Email', 'Phone', 'Platform', 'Join Date'];
      const columnWidths = [150, 180, 100, 100, 100];
      const filename = `users_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Users Report';

      const rowMapper = (user) => [
        user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name || 'N/A',
        user.email || 'N/A',
        user.phone || user.mobile || 'N/A',
        user.platform ? user.platform.charAt(0).toUpperCase() + user.platform.slice(1) : 'N/A',
        user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'
      ];

      await exportToPDF(res, users, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
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
        { header: 'Transaction ID', key: 'transaction_id', width: 20 },
        { header: 'Txn Type', key: 'txn_type', width: 12 },
        { header: 'Txn Amount (₹)', key: 'txn_amount', width: 15 },
        { header: 'Txn Status', key: 'txn_status', width: 12 },
        { header: 'Txn Description', key: 'txn_description', width: 30 },
        { header: 'Txn Date', key: 'txn_date', width: 18 }
      ];

      const data = [];
      wallets.forEach(wallet => {
        const baseData = {
          vendor_name: wallet.vendor_id?.full_name || 'N/A',
          vendor_email: wallet.vendor_id?.email || 'N/A',
          balance: `₹${Number(wallet.balance || 0).toFixed(2)}`,
          total_credited: `₹${Number(wallet.total_credited || 0).toFixed(2)}`,
          total_debited: `₹${Number(wallet.total_debited || 0).toFixed(2)}`,
          status: wallet.is_active ? 'Active' : 'Inactive'
        };

        if (wallet.transactions && wallet.transactions.length > 0) {
          // Sort transactions by date descending
          const sortedTxns = [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          sortedTxns.forEach(txn => {
            data.push({
              ...baseData,
              transaction_id: txn.transaction_id || 'N/A',
              txn_type: txn.type ? txn.type.toUpperCase() : 'N/A',
              txn_amount: txn.amount ? `₹${Number(txn.amount).toFixed(2)}` : '₹0.00',
              txn_status: txn.status ? txn.status.toUpperCase() : 'N/A',
              txn_description: txn.description || 'N/A',
              txn_date: txn.createdAt ? new Date(txn.createdAt).toLocaleString('en-IN') : 'N/A'
            });
          });
        } else {
          data.push({
            ...baseData,
            transaction_id: 'N/A',
            txn_type: 'N/A',
            txn_amount: 'N/A',
            txn_status: 'N/A',
            txn_description: 'N/A',
            txn_date: 'N/A'
          });
        }
      });

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

      const headers = ['Vendor Name', 'Balance', 'Txn Type', 'Txn Amount', 'Txn Status', 'Txn Date'];
      const columnWidths = [150, 80, 80, 80, 80, 90];
      const filename = `vendor_wallets_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Vendor Wallets Report';

      const data = [];
      wallets.forEach(wallet => {
        const vendor_name = wallet.vendor_id?.full_name || 'N/A';
        const balance = `${Number(wallet.balance || 0).toFixed(2)}`;

        if (wallet.transactions && wallet.transactions.length > 0) {
          const sortedTxns = [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          sortedTxns.forEach(txn => {
            data.push({
              vendor_name,
              balance,
              txn_type: txn.type ? txn.type.toUpperCase() : 'N/A',
              txn_amount: txn.amount ? `${Number(txn.amount).toFixed(2)}` : '0.00',
              txn_status: txn.status ? txn.status.toUpperCase() : 'N/A',
              txn_date: txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('en-IN') : 'N/A'
            });
          });
        } else {
          data.push({
            vendor_name,
            balance,
            txn_type: 'N/A',
            txn_amount: 'N/A',
            txn_status: 'N/A',
            txn_date: 'N/A'
          });
        }
      });

      const rowMapper = (item) => [
        item.vendor_name,
        item.balance,
        item.txn_type,
        item.txn_amount,
        item.txn_status,
        item.txn_date
      ];

      await exportToPDF(res, data, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Vendor Reports to Excel
const exportVendorReportToExcel = {
  handler: async (req, res) => {
    try {
      const { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue } = req.query;

      const vendorQuery = {};
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        vendorQuery.$or = [
          { full_name: searchRegex },
          { email: searchRegex },
          { business_name: searchRegex },
          { number: searchRegex }
        ];
      }
      
      if (vendor_type && vendor_type !== 'all') {
        vendorQuery.vendor_type = vendor_type.toLowerCase();
      }

      if (date_range && date_range !== 'all') {
        const now = new Date();
        let startDate;
        switch (date_range) {
          case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
          case 'week': startDate = new Date(); startDate.setDate(now.getDate() - 7); break;
          case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
          case '3months': startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
          case '6months': startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); break;
          case 'year': startDate = new Date(now.getFullYear(), 0, 1); break;
          case 'custom':
            if (start_date && end_date) {
              startDate = new Date(start_date);
              vendorQuery.createdAt = { $gte: startDate, $lte: new Date(end_date + 'T23:59:59.999Z') };
            }
            break;
        }
        if (startDate && date_range !== 'custom') {
          vendorQuery.createdAt = { $gte: startDate, $lte: new Date() };
        }
      }

      const vendors = await Vendor.find(vendorQuery).lean();
      
      const vendorReports = await Promise.all(
        vendors.map(async (vendor) => {
          const vendorId = vendor._id.toString();
          const [totalProducts, rentProducts, sellProducts, totalServices, totalOrders] = await Promise.all([
            Product.countDocuments({ vendor_id: vendorId }),
            Product.countDocuments({ vendor_id: vendorId, listing_type: 'rent' }),
            Product.countDocuments({ vendor_id: vendorId, listing_type: 'sell' }),
            Service.countDocuments({ vendor_id: vendorId }),
            Order.countDocuments({ 
              'items.vendor_id': vendorId,
              $or: [
                { payment_status: { $ne: 'pending' } },
                { payment_method: { $ne: 'razorpay' } }
              ]
            })
          ]);

          const orders = await Order.find({ 
            'items.vendor_id': vendorId,
            $or: [
              { payment_status: { $ne: 'pending' } },
              { payment_method: { $ne: 'razorpay' } }
            ]
          }).lean();
          const totalOrderRevenue = orders.reduce((sum, order) => {
            const vendorPayment = order.vendor_payments?.find(p => p.vendor_id === vendorId);
            return sum + (vendorPayment?.vendor_amount || 0);
          }, 0);

          const vendorProducts = await Product.find({ vendor_id: vendorId }).select('_id').lean();
          const vendorProductIds = vendorProducts.map(p => p._id);
          const quotes = await GetQuote.find({ 
            product_id: { $in: vendorProductIds },
            status: { $in: ['successful', 'complete', 'delivery'] }
          }).lean();
          const totalQuoteRevenue = quotes.reduce((sum, quote) => sum + (quote.calculated_price || 0), 0);
          const wallet = await Wallet.findOne({ vendor_id: vendor._id }).lean();

          // Calculations: Total Revenue = Total Sell + Total Rent
          const totalSellValue = totalOrderRevenue;
          const totalRentValue = totalQuoteRevenue;
          const totalRevenue = totalSellValue + totalRentValue;

          return {
            full_name: vendor.full_name || 'N/A',
            email: vendor.email || 'N/A',
            phone: vendor.number || 'N/A',
            business_name: vendor.business_name || 'N/A',
            vendor_type: vendor.vendor_type || 'both',
            total_products: totalProducts,
            rent_products: rentProducts,
            sell_products: sellProducts,
            total_services: totalServices,
            total_orders: totalOrders,
            order_revenue: totalOrderRevenue,
            total_sell_value: totalSellValue,
            total_quotes: quotes.length,
            quote_revenue: totalQuoteRevenue,
            total_rent_value: totalRentValue,
            total_revenue: totalRevenue,
            wallet_balance: wallet?.balance || 0,
            registered_date: vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString('en-GB') : 'N/A'
          };
        })
      );

      // Filter to show only active vendors (those with at least one order or quote)
      let filteredVendors = vendorReports.filter(v => v.total_orders > 0 || v.total_quotes > 0);
      if (min_revenue || max_revenue) {
        const min = min_revenue ? parseFloat(min_revenue) : 0;
        const max = max_revenue ? parseFloat(max_revenue) : Infinity;
        filteredVendors = vendorReports.filter(v => v.total_revenue >= min && v.total_revenue <= max);
      }

      const columns = [
        { header: 'Vendor Name', key: 'full_name', width: 25 },
        { header: 'Business', key: 'business_name', width: 25 },
        { header: 'Type', key: 'vendor_type', width: 12 },
        { header: 'Prods', key: 'total_products', width: 10 },
        { header: 'Rent', key: 'rent_products', width: 10 },
        { header: 'Sell', key: 'sell_products', width: 10 },
        { header: 'Serv', key: 'total_services', width: 10 },
        { header: 'Orders', key: 'total_orders', width: 10 },
        { header: 'Ord Rev', key: 'order_revenue', width: 15 },
        { header: 'Total Sell', key: 'total_sell_value', width: 15 },
        { header: 'Quotes', key: 'total_quotes', width: 10 },
        { header: 'Quo Rev', key: 'quote_revenue', width: 15 },
        { header: 'Total Rent', key: 'total_rent_value', width: 15 },
        { header: 'Total Rev', key: 'total_revenue', width: 15 },
        { header: 'Wallet', key: 'wallet_balance', width: 15 },
        { header: 'Reg Date', key: 'registered_date', width: 15 }
      ];

      const excelData = filteredVendors.map(v => ({
        ...v,
        order_revenue: `₹${v.order_revenue.toLocaleString('en-IN')}`,
        total_sell_value: `₹${v.total_sell_value.toLocaleString('en-IN')}`,
        quote_revenue: `₹${v.quote_revenue.toLocaleString('en-IN')}`,
        total_rent_value: `₹${v.total_rent_value.toLocaleString('en-IN')}`,
        total_revenue: `₹${v.total_revenue.toLocaleString('en-IN')}`,
        wallet_balance: `₹${v.wallet_balance.toLocaleString('en-IN')}`
      }));

      await exportToExcel(res, excelData, columns, `vendor-report-${Date.now()}.xlsx`, 'Vendor Report');
    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Vendor Reports to PDF
const exportVendorReportToPDF = {
  handler: async (req, res) => {
    try {
      const { vendor_type, date_range, start_date, end_date, search, min_revenue, max_revenue } = req.query;

      const vendorQuery = {};
      if (search) {
        const searchRegex = new RegExp(search.trim(), 'i');
        vendorQuery.$or = [
          { full_name: searchRegex },
          { email: searchRegex },
          { business_name: searchRegex },
          { number: searchRegex }
        ];
      }
      
      if (vendor_type && vendor_type !== 'all') {
        vendorQuery.vendor_type = vendor_type.toLowerCase();
      }

      if (date_range && date_range !== 'all') {
        const now = new Date();
        let startDate;
        switch (date_range) {
          case 'today': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
          case 'week': startDate = new Date(); startDate.setDate(now.getDate() - 7); break;
          case 'month': startDate = new Date(now.getFullYear(), now.getMonth(), 1); break;
          case '3months': startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1); break;
          case '6months': startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1); break;
          case 'year': startDate = new Date(now.getFullYear(), 0, 1); break;
          case 'custom':
            if (start_date && end_date) {
              startDate = new Date(start_date);
              vendorQuery.createdAt = { $gte: startDate, $lte: new Date(end_date + 'T23:59:59.999Z') };
            }
            break;
        }
        if (startDate && date_range !== 'custom') {
          vendorQuery.createdAt = { $gte: startDate, $lte: new Date() };
        }
      }

      const vendors = await Vendor.find(vendorQuery).lean();
      
      const vendorReports = await Promise.all(
        vendors.map(async (vendor) => {
          const vendorId = vendor._id.toString();
          const [totalProducts, rentProducts, sellProducts, totalServices, totalOrders] = await Promise.all([
            Product.countDocuments({ vendor_id: vendorId }),
            Product.countDocuments({ vendor_id: vendorId, listing_type: 'rent' }),
            Product.countDocuments({ vendor_id: vendorId, listing_type: 'sell' }),
            Service.countDocuments({ vendor_id: vendorId }),
            Order.countDocuments({ 
              'items.vendor_id': vendorId,
              $or: [
                { payment_status: { $ne: 'pending' } },
                { payment_method: { $ne: 'razorpay' } }
              ]
            })
          ]);

          const orders = await Order.find({ 
            'items.vendor_id': vendorId,
            $or: [
              { payment_status: { $ne: 'pending' } },
              { payment_method: { $ne: 'razorpay' } }
            ]
          }).lean();
          const totalOrderRevenue = orders.reduce((sum, order) => {
            const vendorPayment = order.vendor_payments?.find(p => p.vendor_id === vendorId);
            return sum + (vendorPayment?.vendor_amount || 0);
          }, 0);

          const vendorProducts = await Product.find({ vendor_id: vendorId }).select('_id').lean();
          const vendorProductIds = vendorProducts.map(p => p._id);
          const quotes = await GetQuote.find({ 
            product_id: { $in: vendorProductIds },
            status: { $in: ['successful', 'complete', 'delivery'] }
          }).lean();
          const totalQuoteRevenue = quotes.reduce((sum, quote) => sum + (quote.calculated_price || 0), 0);
          const wallet = await Wallet.findOne({ vendor_id: vendor._id }).lean();

          const totalSellValue = totalOrderRevenue;
          const totalRentValue = totalQuoteRevenue;
          const totalRevenue = totalSellValue + totalRentValue;

          return {
            full_name: vendor.full_name || 'N/A',
            business_name: vendor.business_name || 'N/A',
            vendor_type: vendor.vendor_type || 'both',
            total_products: totalProducts,
            rent_products: rentProducts,
            sell_products: sellProducts,
            total_services: totalServices,
            total_orders: totalOrders,
            order_revenue: totalOrderRevenue,
            total_sell_value: totalSellValue,
            total_quotes: quotes.length,
            quote_revenue: totalQuoteRevenue,
            total_rent_value: totalRentValue,
            total_revenue: totalRevenue,
            wallet_balance: wallet?.balance || 0,
            registered_date: vendor.createdAt ? new Date(vendor.createdAt).toLocaleDateString('en-GB') : 'N/A'
          };
        })
      );

      // Filter to show only active vendors (those with at least one order or quote)
      let filteredVendors = vendorReports.filter(v => v.total_orders > 0 || v.total_quotes > 0);
      if (min_revenue || max_revenue) {
        const min = min_revenue ? parseFloat(min_revenue) : 0;
        const max = max_revenue ? parseFloat(max_revenue) : Infinity;
        filteredVendors = vendorReports.filter(v => v.total_revenue >= min && v.total_revenue <= max);
      }

      const headers = ['Vendor', 'Business', 'Type', 'Prods', 'Rent', 'Sell', 'Serv', 'Orders', 'Ord Rev', 'Total Sell', 'Quotes', 'Quo Rev', 'Total Rent', 'Total Rev', 'Wallet', 'Reg Date'];
      const columnWidths = [70, 70, 30, 35, 35, 35, 35, 40, 50, 60, 40, 50, 60, 70, 60, 60];
      const filename = `vendor-report-${Date.now()}.pdf`;
      const title = 'Vendors Report';

      const rowMapper = (v) => [
        v.full_name.substring(0, 15),
        v.business_name.substring(0, 15),
        v.vendor_type.charAt(0).toUpperCase(),
        v.total_products.toString(),
        v.rent_products.toString(),
        v.sell_products.toString(),
        v.total_services.toString(),
        v.total_orders.toString(),
        `${v.order_revenue.toLocaleString('en-IN')}`,
        `${v.total_sell_value.toLocaleString('en-IN')}`,
        v.total_quotes.toString(),
        `${v.quote_revenue.toLocaleString('en-IN')}`,
        `${v.total_rent_value.toLocaleString('en-IN')}`,
        `${v.total_revenue.toLocaleString('en-IN')}`,
        `${v.wallet_balance.toLocaleString('en-IN')}`,
        v.registered_date
      ];

      await exportToPDF(res, filteredVendors, headers, columnWidths, filename, title, rowMapper, { layout: 'landscape' });
    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      }
    }
  }
};

// ==========================================
// PLAN PURCHASE EXPORT CONTROLLERS
// ==========================================



// Export Listing Plans to Excel
const exportListingPlansToExcel = {
  handler: async (req, res) => {
    try {
      const { q, plan_type, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_type) {
        query.plan_type = plan_type;
      }

      if (amount) {
        query.amount = Number(amount);
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ListingPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name email')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Plan Type', key: 'plan_type', width: 20 },
        { header: 'Months', key: 'months', width: 10 },
        { header: 'Max Products', key: 'max_products', width: 15 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Products', key: 'products_count', width: 12 },
        { header: 'Start Date', key: 'start_at', width: 15 },
        { header: 'Expire Date', key: 'expire_at', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 15 }
      ];

      const data = purchases.map(purchase => ({
        vendor_name: purchase.vendor_id?.full_name || 'N/A',
        business_name: purchase.vendor_id?.business_name || 'N/A',
        plan_type: purchase.plan_type || 'N/A',
        months: purchase.months || 0,
        max_products: purchase.max_products || 0,
        amount: purchase.amount ? `₹${Number(purchase.amount).toFixed(2)}` : '₹0.00',
        products_count: purchase.product_ids?.length || 0,
        start_at: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
        expire_at: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
        createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
      }));

      const filename = `listing_plans_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'Listing Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Listing Plans to PDF
const exportListingPlansToPDF = {
  handler: async (req, res) => {
    try {
      const { q, plan_type, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_type) query.plan_type = plan_type;
      if (amount) query.amount = Number(amount);

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ListingPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name')
        .sort({ createdAt: -1 });

      const filename = `listing_plans_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Listing Plan Purchases Report';

      await exportToTreePDF(res, purchases, filename, title);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Priority Purchases to Excel
const exportPriorityPurchasesToExcel = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_name) {
        query.plan_name = plan_name;
      }

      if (amount) {
        query.amount = Number(amount);
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await PriorityPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name email')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Plan Name', key: 'plan_name', width: 20 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Total Slots', key: 'total_slots', width: 15 },
        { header: 'Duration', key: 'plan_duration', width: 12 },
        { header: 'Products', key: 'products_count', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Start Date', key: 'start_at', width: 15 },
        { header: 'Expire Date', key: 'expire_at', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 15 }
      ];

      const data = purchases.map(purchase => ({
        vendor_name: purchase.vendor_id?.full_name || 'N/A',
        business_name: purchase.vendor_id?.business_name || 'N/A',
        plan_name: purchase.plan_name || 'N/A',
        amount: purchase.amount ? `₹${Number(purchase.amount).toFixed(2)}` : '₹0.00',
        total_slots: purchase.total_slots || 0,
        plan_duration: purchase.plan_duration ? purchase.plan_duration.charAt(0).toUpperCase() + purchase.plan_duration.slice(1) : 'Monthly',
        products_count: purchase.product_ids?.length || 0,
        status: purchase.status ? purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1) : 'Active',
        start_at: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
        expire_at: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
        createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
      }));

      const filename = `priority_purchases_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'Priority Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Priority Purchases to PDF
const exportPriorityPurchasesToPDF = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_name) query.plan_name = plan_name;
      if (amount) query.amount = Number(amount);

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await PriorityPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name')
        .sort({ createdAt: -1 });

      const filename = `priority_purchases_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Priority Plan Purchases Report';

      await exportToTreePDF(res, purchases, filename, title);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Service Listing Purchases to Excel
const exportServiceListingPurchasesToExcel = {
  handler: async (req, res) => {
    try {
      const { q, plan_type, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_type) {
        query.plan_name = plan_type;
      }

      if (amount) {
        query.amount = Number(amount);
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ServiceListingPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name email')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Plan Name', key: 'plan_name', width: 20 },
        { header: 'Months', key: 'months', width: 10 },
        { header: 'Max Services', key: 'max_services', width: 15 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Services', key: 'services_count', width: 12 },
        { header: 'Start Date', key: 'start_at', width: 15 },
        { header: 'Expire Date', key: 'expire_at', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 15 }
      ];

      const data = purchases.map(purchase => ({
        vendor_name: purchase.vendor_id?.full_name || 'N/A',
        business_name: purchase.vendor_id?.business_name || 'N/A',
        plan_name: purchase.plan_name || 'N/A',
        months: purchase.months || 0,
        max_services: purchase.max_services || 0,
        amount: purchase.amount ? `₹${Number(purchase.amount).toFixed(2)}` : '₹0.00',
        services_count: purchase.service_ids?.length || 0,
        start_at: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
        expire_at: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
        createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
      }));

      const filename = `service_listing_purchases_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'Service Listing Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Service Listing Purchases to PDF
const exportServiceListingPurchasesToPDF = {
  handler: async (req, res) => {
    try {
      const { q, plan_type, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_type) query.plan_name = plan_type;
      if (amount) query.amount = Number(amount);

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ServiceListingPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name')
        .sort({ createdAt: -1 });

      const filename = `service_listing_purchases_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Service Listing Plan Purchases Report';

      await exportToTreePDF(res, purchases, filename, title);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Service Priority Purchases to Excel
const exportServicePriorityPurchasesToExcel = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_name) {
        query.plan_name = plan_name;
      }

      if (amount) {
        query.amount = Number(amount);
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ServicePriorityPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name email')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Plan Name', key: 'plan_name', width: 20 },
        { header: 'Months', key: 'months', width: 10 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Services', key: 'services_count', width: 12 },
        { header: 'Start Date', key: 'start_at', width: 15 },
        { header: 'Expire Date', key: 'expire_at', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 15 }
      ];

      const data = purchases.map(purchase => ({
        vendor_name: purchase.vendor_id?.full_name || purchase.vendor_id?.business_name || 'N/A',
        plan_name: purchase.plan_name || 'N/A',
        months: purchase.months || 0,
        amount: purchase.amount ? `₹${Number(purchase.amount).toFixed(2)}` : '₹0.00',
        services_count: purchase.service_ids?.length || 0,
        start_at: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
        expire_at: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
        createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
      }));

      const filename = `service_priority_purchases_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'Service Priority Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Service Priority Purchases to PDF
const exportServicePriorityPurchasesToPDF = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, amount, start_month, expire_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        }
      }

      if (plan_name) query.plan_name = plan_name;
      if (amount) query.amount = Number(amount);

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_at = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expire_at = { $gte: startDate, $lte: endDate };
      }

      const purchases = await ServicePriorityPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name')
        .sort({ createdAt: -1 });

      const headers = ['Vendor', 'Plan', 'Months', 'Amount', 'Services', 'Start', 'Expire'];
      const columnWidths = [120, 100, 60, 80, 70, 80, 80];
      const filename = `service_priority_purchases_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Service Priority Plan Purchases Report';

      const rowMapper = (purchase) => [
        purchase.vendor_id?.full_name || purchase.vendor_id?.business_name || 'N/A',
        purchase.plan_name || 'N/A',
        purchase.months || 0,
        purchase.amount ? `${Number(purchase.amount).toFixed(2)}` : '0.00',
        purchase.service_ids?.length || 0,
        purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
        purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-'
      ];

      await exportToPDF(res, purchases, headers, columnWidths, filename, title, rowMapper);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export Rental Boost Purchases to Excel
const exportRentalBoostPurchasesToExcel = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, price, start_month, expiry_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        } else {
          // Fallback: search in product and plan name if no vendor match
          query.$or = [
            { product_name: searchRegex },
            { plan_name: searchRegex }
          ];
        }
      }

      if (plan_name) {
        query.plan_name = plan_name;
      }

      if (price) {
        query.price = Number(price);
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_date = { $gte: startDate, $lte: endDate };
      }

      if (expiry_month) {
        const year = parseInt(expiry_month.split('-')[0]);
        const month = parseInt(expiry_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expiry_date = { $gte: startDate, $lte: endDate };
      }

      const purchases = await RentalBoostPlanPurchase.find(query)
        .populate('vendor_id', 'full_name business_name')
        .sort({ createdAt: -1 });

      const columns = [
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Business Name', key: 'business_name', width: 20 },
        { header: 'Product Name', key: 'product_name', width: 25 },
        { header: 'Plan Name', key: 'plan_name', width: 20 },
        { header: 'Price (₹)', key: 'price', width: 15 },
        { header: 'Days', key: 'days', width: 10 },
        { header: 'Payment Status', key: 'payment_status', width: 15 },
        { header: 'Start Date', key: 'start_date', width: 15 },
        { header: 'Expiry Date', key: 'expiry_date', width: 15 },
        { header: 'Created At', key: 'createdAt', width: 15 }
      ];

      const data = purchases.map(purchase => ({
        vendor_name: purchase.vendor_id?.full_name || purchase.vendor_name || 'N/A',
        business_name: purchase.vendor_id?.business_name || 'N/A',
        product_name: purchase.product_name || 'N/A',
        plan_name: purchase.plan_name || 'N/A',
        price: purchase.price ? `₹${Number(purchase.price).toFixed(2)}` : '₹0.00',
        days: purchase.days || 0,
        payment_status: purchase.payment_status ? purchase.payment_status.charAt(0).toUpperCase() + purchase.payment_status.slice(1) : 'Pending',
        start_date: purchase.start_date ? new Date(purchase.start_date).toLocaleDateString('en-GB') : '-',
        expiry_date: purchase.expiry_date ? new Date(purchase.expiry_date).toLocaleDateString('en-GB') : '-',
        createdAt: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
      }));

      const filename = `rental_boost_purchases_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'Rental Boost Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export Rental Boost Purchases to PDF
const exportRentalBoostPurchasesToPDF = {
  handler: async (req, res) => {
    try {
      const { q, plan_name, price, start_month, expiry_month } = req.query;

      const query = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          query.vendor_id = { $in: vendorIds };
        } else {
          // Fallback: search in product and plan name if no vendor match
          query.$or = [
            { product_name: searchRegex },
            { plan_name: searchRegex }
          ];
        }
      }

      if (plan_name) query.plan_name = plan_name;
      if (price) query.price = Number(price);

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.start_date = { $gte: startDate, $lte: endDate };
      }

      if (expiry_month) {
        const year = parseInt(expiry_month.split('-')[0]);
        const month = parseInt(expiry_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        query.expiry_date = { $gte: startDate, $lte: endDate };
      }

      const purchases = await RentalBoostPlanPurchase.find(query)
        .sort({ createdAt: -1 });

      const vendorIds = [...new Set(purchases.map((d) => d.vendor_id).filter(Boolean))];
      let vendorMap = {};
      if (vendorIds.length) {
        const kycs = await VendorKyc.find(
          { 'ContactDetails.vendor_id': { $in: vendorIds } },
          { 'ContactDetails.vendor_id': 1, 'ContactDetails.full_name': 1, 'Identity.business_name': 1 }
        ).lean();
        kycs.forEach((k) => {
          const vid = (k?.ContactDetails?.vendor_id || '').toString();
          const business = k?.Identity?.business_name || '';
          const full = k?.ContactDetails?.full_name || '';
          vendorMap[vid] = { vendor_name: full || '', business_name: business || '' };
        });
      }

      const enriched = purchases.map((d) => {
        const obj = d.toObject ? d.toObject() : d;
        const vendorData = vendorMap[String(d.vendor_id)] || { vendor_name: '', business_name: '' };
        return {
          ...obj,
          vendor_name: vendorData.vendor_name,
          business_name: vendorData.business_name,
        };
      });

      const filename = `rental_boost_purchases_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'Rental Boost Plan Purchases Report';

      await exportToTreePDF(res, enriched, filename, title);

    } catch (error) {
      if (!res.headersSent) {
        res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
      } else {
        res.destroy();
      }
    }
  }
};

// Export All Plan Purchases Combined to Excel
const exportAllPlanPurchasesToExcel = {
  handler: async (req, res) => {
    try {
      const { q, start_month, expire_month } = req.query;

      // Fetch all three types of purchases
      const listingQuery = {};
      const priorityQuery = {};
      const rentalQuery = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          listingQuery.vendor_id = { $in: vendorIds };
          priorityQuery.vendor_id = { $in: vendorIds };
          rentalQuery.$or = [
            { vendor_name: searchRegex },
            { product_name: searchRegex }
          ];
        }
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        listingQuery.start_at = { $gte: startDate, $lte: endDate };
        priorityQuery.start_at = { $gte: startDate, $lte: endDate };
        rentalQuery.start_date = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        listingQuery.expire_at = { $gte: startDate, $lte: endDate };
        priorityQuery.expire_at = { $gte: startDate, $lte: endDate };
        rentalQuery.expiry_date = { $gte: startDate, $lte: endDate };
      }

      const generalQuery = {};
      Object.assign(generalQuery, listingQuery);
      if (generalQuery.start_at) {
        generalQuery.created_at = generalQuery.start_at;
        delete generalQuery.start_at;
      }

      const [listingPurchases, priorityPurchases, rentalPurchases, generalPurchases] = await Promise.all([
        ListingPlanPurchase.find(listingQuery).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
        PriorityPlanPurchase.find(priorityQuery).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 }),
        RentalBoostPlanPurchase.find(rentalQuery).sort({ createdAt: -1 }),
        GeneralPlanPurchase.find(generalQuery).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 })
      ]);

      // Combine all data
      const combinedData = [];

      // Add Listing Plan Purchases
      listingPurchases.forEach(purchase => {
        combinedData.push({
          plan_type: 'Listing Plan',
          vendor_name: purchase.vendor_id?.full_name || purchase.vendor_id?.business_name || 'N/A',
          plan_name: purchase.plan_type || 'N/A',
          amount: purchase.amount || 0,
          duration: `${purchase.months || 0} months`,
          products_services: purchase.max_products || 0,
          status: 'Active',
          start_date: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
          expire_date: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
          created_at: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
        });
      });

      // Add Priority Plan Purchases
      priorityPurchases.forEach(purchase => {
        combinedData.push({
          plan_type: 'Priority Plan',
          vendor_name: purchase.vendor_id?.full_name || purchase.vendor_id?.business_name || 'N/A',
          plan_name: purchase.plan_name || 'N/A',
          amount: purchase.amount || 0,
          duration: purchase.plan_duration ? purchase.plan_duration.charAt(0).toUpperCase() + purchase.plan_duration.slice(1) : 'Monthly',
          products_services: purchase.total_slots || 0,
          status: purchase.status ? purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1) : 'Active',
          start_date: purchase.start_at ? new Date(purchase.start_at).toLocaleDateString('en-GB') : '-',
          expire_date: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
          created_at: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
        });
      });

      // Add Rental Boost Purchases
      rentalPurchases.forEach(purchase => {
        combinedData.push({
          plan_type: 'Rental Boost',
          vendor_name: purchase.vendor_name || 'N/A',
          plan_name: purchase.plan_name || 'N/A',
          amount: purchase.price || 0,
          duration: `${purchase.days || 0} days`,
          products_services: purchase.product_name || 'N/A',
          status: purchase.payment_status ? purchase.payment_status.charAt(0).toUpperCase() + purchase.payment_status.slice(1) : 'Pending',
          start_date: purchase.start_date ? new Date(purchase.start_date).toLocaleDateString('en-GB') : '-',
          expire_date: purchase.expiry_date ? new Date(purchase.expiry_date).toLocaleDateString('en-GB') : '-',
          created_at: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
        });
      });

      // Add General Plan Purchases
      generalPurchases.forEach(purchase => {
        combinedData.push({
          plan_type: 'General Plan',
          vendor_name: purchase.vendor_id?.full_name || purchase.vendor_id?.business_name || 'N/A',
          plan_name: purchase.plan_type || 'N/A',
          amount: purchase.amount || 0,
          duration: '30 days',
          products_services: purchase.max_products || 0,
          status: purchase.status ? purchase.status.charAt(0).toUpperCase() + purchase.status.slice(1) : 'Active',
          start_date: purchase.created_at ? new Date(purchase.created_at).toLocaleDateString('en-GB') : (purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'),
          expire_date: purchase.expire_at ? new Date(purchase.expire_at).toLocaleDateString('en-GB') : '-',
          created_at: purchase.createdAt ? new Date(purchase.createdAt).toLocaleDateString('en-GB') : '-'
        });
      });

      const columns = [
        { header: 'Plan Type', key: 'plan_type', width: 15 },
        { header: 'Vendor Name', key: 'vendor_name', width: 20 },
        { header: 'Plan Name', key: 'plan_name', width: 20 },
        { header: 'Amount (₹)', key: 'amount', width: 15 },
        { header: 'Duration', key: 'duration', width: 15 },
        { header: 'Products/Services', key: 'products_services', width: 25 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Start Date', key: 'start_date', width: 15 },
        { header: 'Expire Date', key: 'expire_date', width: 15 },
        { header: 'Created At', key: 'created_at', width: 15 }
      ];

      const data = combinedData.map(item => ({
        ...item,
        amount: item.amount ? `₹${Number(item.amount).toFixed(2)}` : '₹0.00'
      }));

      const filename = `all_plan_purchases_${new Date().toISOString().split('T')[0]}.xlsx`;
      await exportToExcel(res, data, columns, filename, 'All Plan Purchases');

    } catch (error) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
  }
};

// Export All Plan Purchases Combined to PDF
const exportAllPlanPurchasesToPDF = {
  handler: async (req, res) => {
    try {
      const { q, start_month, expire_month } = req.query;

      // Fetch all three types of purchases
      const listingQuery = {};
      const priorityQuery = {};
      const rentalQuery = {};

      if (q) {
        const searchRegex = new RegExp(q.trim(), 'i');
        const vendors = await Vendor.find({
          $or: [
            { full_name: searchRegex },
            { business_name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id');
        const vendorIds = vendors.map(v => v._id);
        if (vendorIds.length > 0) {
          listingQuery.vendor_id = { $in: vendorIds };
          priorityQuery.vendor_id = { $in: vendorIds };
          rentalQuery.$or = [
            { vendor_name: searchRegex },
            { product_name: searchRegex }
          ];
        }
      }

      if (start_month) {
        const year = parseInt(start_month.split('-')[0]);
        const month = parseInt(start_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        listingQuery.start_at = { $gte: startDate, $lte: endDate };
        priorityQuery.start_at = { $gte: startDate, $lte: endDate };
        rentalQuery.start_date = { $gte: startDate, $lte: endDate };
      }

      if (expire_month) {
        const year = parseInt(expire_month.split('-')[0]);
        const month = parseInt(expire_month.split('-')[1]) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        listingQuery.expire_at = { $gte: startDate, $lte: endDate };
        priorityQuery.expire_at = { $gte: startDate, $lte: endDate };
        rentalQuery.expiry_date = { $gte: startDate, $lte: endDate };
      }

      const generalQuery = {};
      Object.assign(generalQuery, listingQuery);
      if (generalQuery.start_at) {
        generalQuery.created_at = generalQuery.start_at;
        delete generalQuery.start_at;
      }

      const [listingPurchases, priorityPurchases, rentalPurchases, generalPurchases] = await Promise.all([
        ListingPlanPurchase.find(listingQuery).populate('vendor_id', 'full_name business_name').sort({ createdAt: -1 }),
        PriorityPlanPurchase.find(priorityQuery).populate('vendor_id', 'full_name business_name').sort({ createdAt: -1 }),
        RentalBoostPlanPurchase.find(rentalQuery).sort({ createdAt: -1 }),
        GeneralPlanPurchase.find(generalQuery).populate('vendor_id', 'full_name business_name email').sort({ createdAt: -1 })
      ]);

      // Combine all data in format expected by exportToTreePDF
      const combinedData = [];

      // Add Listing Plan Purchases
      listingPurchases.forEach(purchase => {
        combinedData.push({
          vendor_id: purchase.vendor_id,
          vendor_name: purchase.vendor_id?.full_name || 'N/A',
          business_name: purchase.vendor_id?.business_name || '',
          plan_type: 'Listing Plan',
          plan_name: purchase.plan_type || 'Listing Plan',
          months: purchase.months || 0,
          max_products: purchase.max_products || 0,
          amount: purchase.amount || 0,
          product_ids: purchase.product_ids || [],
          start_at: purchase.start_at,
          expire_at: purchase.expire_at
        });
      });

      // Add Priority Plan Purchases
      priorityPurchases.forEach(purchase => {
        combinedData.push({
          vendor_id: purchase.vendor_id,
          vendor_name: purchase.vendor_id?.full_name || 'N/A',
          business_name: purchase.vendor_id?.business_name || '',
          plan_type: 'Priority Plan',
          plan_name: purchase.plan_name || 'Priority Plan',
          months: purchase.plan_duration === 'yearly' ? 12 : 1,
          max_products: purchase.total_slots || 0,
          amount: purchase.amount || 0,
          product_ids: [],
          start_at: purchase.start_at,
          expire_at: purchase.expire_at
        });
      });

      // Add Rental Boost Purchases
      rentalPurchases.forEach(purchase => {
        combinedData.push({
          vendor_id: purchase.vendor_id || purchase._id,
          vendor_name: purchase.vendor_name || 'N/A',
          business_name: '',
          plan_type: 'Rental Boost',
          plan_name: purchase.plan_name || 'Rental Boost',
          days: purchase.days || 0,
          max_products: 1,
          amount: purchase.price || 0,
          product_ids: [],
          start_date: purchase.start_date,
          expiry_date: purchase.expiry_date
        });
      });

      // Add General Plan Purchases
      generalPurchases.forEach(purchase => {
        combinedData.push({
          vendor_id: purchase.vendor_id,
          vendor_name: purchase.vendor_id?.full_name || 'N/A',
          business_name: purchase.vendor_id?.business_name || '',
          plan_type: 'General Plan',
          plan_name: purchase.plan_type || 'General Plan',
          months: 1,
          max_products: purchase.max_products || 0,
          amount: purchase.amount || 0,
          product_ids: purchase.product_ids || [],
          start_at: purchase.created_at || purchase.createdAt,
          expire_at: purchase.expire_at
        });
      });

      // Sort by vendor name
      combinedData.sort((a, b) => (a.vendor_name || '').localeCompare(b.vendor_name || ''));

      const filename = `all_plan_purchases_${new Date().toISOString().split('T')[0]}.pdf`;
      const title = 'All Plan Purchases Report';

      await exportToTreePDF(res, combinedData, filename, title);

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
  exportVendorWalletsToPDF,
  exportVendorReportToExcel,
  exportVendorReportToPDF,
  exportListingPlansToExcel,
  exportListingPlansToPDF,
  exportPriorityPurchasesToExcel,
  exportPriorityPurchasesToPDF,
  exportServicePriorityPurchasesToExcel,
  exportServicePriorityPurchasesToPDF,
  exportServiceListingPurchasesToExcel,
  exportServiceListingPurchasesToPDF,
  exportRentalBoostPurchasesToExcel,
  exportRentalBoostPurchasesToPDF,
  exportAllPlanPurchasesToExcel,
  exportAllPlanPurchasesToPDF,
  exportUsersToExcel,
  exportUsersToPDF
};