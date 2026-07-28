const { Product, Category, SubCategory, Service, ServiceCategory, Blogs } = require('../models');
const catchAsync = require('../utils/catchAsync');

/**
 * Generate a list of all dynamic URLs for the frontend sitemap
 */
const getDynamicSitemapUrls = catchAsync(async (req, res) => {
  const baseUrl = process.env.FRONTEND_URL || 'https://www.upleex.com';
  const urls = [];

  // 1. Fetch active products
  const products = await Product.find({ approval_status: 'approved' })
    .populate('sub_category_id', 'slug subcategory_name')
    .select('slug product_name sub_category_id updatedAt');

  products.forEach((product) => {
    let subCatSlug = 'all';
    if (product.sub_category_id) {
      subCatSlug = product.sub_category_id.slug || 
        (product.sub_category_id.subcategory_name ? product.sub_category_id.subcategory_name.toLowerCase().replace(/[^a-z0-9]+/g, '') : 'all');
    }
    const productSlug = product.slug || product.product_name?.toLowerCase().replace(/[^a-z0-9]+/g, '');
    
    if (productSlug) {
      urls.push({
        url: `${baseUrl}/${subCatSlug}/${productSlug}`,
        lastModified: product.updatedAt || new Date(),
        priority: 0.8,
      });
    }
  });

  // 2. Fetch active categories (Rentals)
  const categories = await Category.find({ is_active: true }).select('slug categories_name updatedAt');
  categories.forEach((cat) => {
    const catSlug = cat.slug || cat.categories_name?.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (catSlug) {
      urls.push({
        url: `${baseUrl}/rent/surat/${catSlug}`,
        lastModified: cat.updatedAt || new Date(),
        priority: 0.7,
      });
    }
  });

  // 3. Fetch active blogs
  const blogs = await Blogs.find({}).select('slug title updatedAt');
  blogs.forEach((blog) => {
    const blogSlug = blog.slug || blog._id.toString();
    urls.push({
      url: `${baseUrl}/blog/${blogSlug}`,
      lastModified: blog.updatedAt || new Date(),
      priority: 0.6,
    });
  });

  // 4. Fetch service details
  const services = await Service.aggregate([
    { $match: { approval_status: 'approved' } },
    {
      $lookup: {
        from: 'vendors',
        localField: 'vendor_id',
        foreignField: 'vendor_id',
        as: 'vendor'
      }
    },
    { $unwind: { path: '$vendor', preserveNullAndEmptyArrays: true } },
    { $project: { _id: 1, updatedAt: 1, slug: 1, location: 1, vendor_city_name: '$vendor.vendor_city_name' } }
  ]);
  
  services.forEach((service) => {
    const serviceSlug = service.slug || service._id.toString();
    let city = service.vendor_city_name || service.location || 'surat';
    const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '');

    urls.push({
      url: `${baseUrl}/service/${citySlug}/${serviceSlug}`,
      lastModified: service.updatedAt || new Date(),
      priority: 0.7,
    });
  });

  // 5. Fetch service categories
  const serviceCategories = await ServiceCategory.find({ is_active: true }).select('categories_id updatedAt');
  serviceCategories.forEach((scat) => {
    if (scat.categories_id) {
      urls.push({
        url: `${baseUrl}/services-list?category=${scat.categories_id}`,
        lastModified: scat.updatedAt || new Date(),
        priority: 0.6,
      });
    }
  });

  res.send({
    success: true,
    data: urls
  });
});

module.exports = {
  getDynamicSitemapUrls
};
