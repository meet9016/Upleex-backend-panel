const httpStatus = require('http-status');
const { Cart, Product } = require('../models');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

const addToCart = catchAsync(async (req, res) => {
  const { product_id, qty } = req.body;
  
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to add items to cart');
  }

  const product = await Product.findById(product_id);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }

  // Check if item already exists in active cart
  let cartItem = await Cart.findOne({
    user_id: req.user.id,
    product_id: product_id,
    status: 'active'
  });

  if (cartItem) {
    cartItem.qty += parseInt(qty) || 1;
    await cartItem.save();
  } else {
    cartItem = await Cart.create({
      user_id: req.user.id,
      product_id: product_id,
      qty: parseInt(qty) || 1,
      status: 'active'
    });
  }

  res.status(httpStatus.OK).send({
    status: 200,
    success: true,
    message: 'Product added to cart successfully',
    data: cartItem
  });
});

const listCart = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to view cart');
  }

  const items = await Cart.find({
    user_id: req.user.id,
    status: 'active',
  }).populate('product_id');

  const mapped = items.map((item) => {
    const p = item.product_id && item.product_id.toObject ? item.product_id.toObject() : item.product_id;
    const priceNum = Number(p?.price || 0) || 0;
    const qty = Number(item.qty || 1) || 1;
    const subTotal = priceNum * qty;
    const gstPer = 18; // 18% GST
    const gstAmount = (subTotal * gstPer) / 100;
    const finalAmount = subTotal + gstAmount;

    return {
      id: p?.id || p?._id?.toString() || '',
      name: p?.product_name || '',
      price: String(p?.price || '0'),
      qty: String(qty),
      sub_total: subTotal.toFixed(2),
      gst_per: String(gstPer),
      gst_amount: gstAmount.toFixed(2),
      final_amount: finalAmount.toFixed(2),
      image: p?.product_main_image || '',
      cart_id: item.id,
      // Add stock information for frontend validation
      product_type_name: p?.product_type_name || '',
      available_quantity: p?.available_quantity || 0,
      is_out_of_stock: p?.is_out_of_stock || false,
    };
  });

  const totalSubtotal = mapped.reduce((sum, item) => sum + parseFloat(item.sub_total), 0);
  const totalGst = mapped.reduce((sum, item) => sum + parseFloat(item.gst_amount), 0);
  const totalFinalAmount = mapped.reduce((sum, item) => sum + parseFloat(item.final_amount), 0);
  const deliveryCharges = 0; // Can be dynamic based on address
  const installationCharges = 0; // Can be dynamic
  const grandTotal = totalFinalAmount + deliveryCharges + installationCharges;

  res.status(httpStatus.OK).send({
    status: 200,
    message: 'Cart list fetched successfully',
    data: mapped,
    summary: {
      total_items: mapped.length,
      subtotal: totalSubtotal.toFixed(2),
      gst_amount: totalGst.toFixed(2),
      gst_percentage: '18',
      delivery_charges: deliveryCharges.toFixed(2),
      installation_charges: installationCharges.toFixed(2),
      grand_total: grandTotal.toFixed(2),
      currency: 'INR'
    }
  });
});

const updateCartItem = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to modify cart');
  }
  
  const { cart_id, qty } = req.body;
  
  if (!cart_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'cart_id is required');
  }
  
  if (!qty || qty < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Valid quantity is required');
  }

  // Find cart item
  const cartItem = await Cart.findOne({
    _id: cart_id,
    user_id: req.user.id,
    status: 'active',
  }).populate('product_id');

  if (!cartItem) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Cart item not found');
  }

  // Update quantity
  cartItem.qty = parseInt(qty);
  await cartItem.save();

  // Recalculate with fresh data
  const p = cartItem.product_id && cartItem.product_id.toObject ? cartItem.product_id.toObject() : cartItem.product_id;
  const priceNum = Number(p?.price || 0) || 0;
  const newQty = Number(cartItem.qty || 1) || 1;
  const subTotal = priceNum * newQty;
  const gstPer = 18;
  const gstAmount = (subTotal * gstPer) / 100;
  const finalAmount = subTotal + gstAmount;

  const updatedItem = {
    id: p?.id || p?._id?.toString() || '',
    name: p?.product_name || '',
    price: String(p?.price || '0'),
    qty: String(newQty),
    sub_total: subTotal.toFixed(2),
    gst_per: String(gstPer),
    gst_amount: gstAmount.toFixed(2),
    final_amount: finalAmount.toFixed(2),
    image: p?.product_main_image || '',
    cart_id: cartItem.id,
    product_type_name: p?.product_type_name || '',
    available_quantity: p?.available_quantity || 0,
    is_out_of_stock: p?.is_out_of_stock || false,
  };

  // Get all cart items and recalculate summary
  const allItems = await Cart.find({
    user_id: req.user.id,
    status: 'active',
  }).populate('product_id');

  const mapped = allItems.map((item) => {
    const prod = item.product_id && item.product_id.toObject ? item.product_id.toObject() : item.product_id;
    const price = Number(prod?.price || 0) || 0;
    const quantity = Number(item.qty || 1) || 1;
    const sub = price * quantity;
    const gst = (sub * 18) / 100;
    const final = sub + gst;

    return {
      id: prod?.id || prod?._id?.toString() || '',
      name: prod?.product_name || '',
      price: String(prod?.price || '0'),
      qty: String(quantity),
      sub_total: sub.toFixed(2),
      gst_per: '18',
      gst_amount: gst.toFixed(2),
      final_amount: final.toFixed(2),
      image: prod?.product_main_image || '',
      cart_id: item.id,
      product_type_name: prod?.product_type_name || '',
      available_quantity: prod?.available_quantity || 0,
      is_out_of_stock: prod?.is_out_of_stock || false,
    };
  });

  const totalSubtotal = mapped.reduce((sum, item) => sum + parseFloat(item.sub_total), 0);
  const totalGst = mapped.reduce((sum, item) => sum + parseFloat(item.gst_amount), 0);
  const totalFinalAmount = mapped.reduce((sum, item) => sum + parseFloat(item.final_amount), 0);
  const deliveryCharges = 0;
  const installationCharges = 0;
  const grandTotal = totalFinalAmount + deliveryCharges + installationCharges;

  res.status(httpStatus.OK).send({
    status: 200,
    message: 'Cart item updated successfully',
    data: updatedItem,
    summary: {
      total_items: mapped.length,
      subtotal: totalSubtotal.toFixed(2),
      gst_amount: totalGst.toFixed(2),
      gst_percentage: '18',
      delivery_charges: deliveryCharges.toFixed(2),
      installation_charges: installationCharges.toFixed(2),
      grand_total: grandTotal.toFixed(2),
      currency: 'INR'
    }
  });
});

const removeFromCart = catchAsync(async (req, res) => {
  if (!req.user) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Please authenticate to modify cart');
  }
  const { cart_id } = req.body;
  if (!cart_id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'cart_id is required');
  }

  const deleted = await Cart.findOneAndDelete({
    _id: cart_id,
    user_id: req.user.id,
    status: 'active',
  });

  if (!deleted) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Cart item not found');
  }

  res.status(httpStatus.OK).send({
    status: 200,
    message: 'Item removed from cart',
    data: { cart_id },
  });
});

module.exports = {
  addToCart,
  listCart,
  updateCartItem,
  removeFromCart,
};
