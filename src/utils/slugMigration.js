const { Category, SubCategory, Product } = require('../models');
const logger = require('../config/logger');

const migrateSlugsInBackground = async () => {
  try {
    const categories = await Category.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    if (categories.length > 0) {
      logger.info(`Migrating slugs for ${categories.length} categories...`);
      for (const cat of categories) { await cat.save(); }
    }

    const subCategories = await SubCategory.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    if (subCategories.length > 0) {
      logger.info(`Migrating slugs for ${subCategories.length} subcategories...`);
      for (const sub of subCategories) { await sub.save(); }
    }

    const products = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    if (products.length > 0) {
      logger.info(`Migrating slugs for ${products.length} products...`);
      for (const prod of products) { await prod.save(); }
    }

    if (categories.length || subCategories.length || products.length) {
      logger.info('Slug migration completed successfully.');
    }
  } catch (error) {
    logger.error('Error in background slug migration: ' + error.message);
  }
};

module.exports = migrateSlugsInBackground;
