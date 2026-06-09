require('dotenv').config();
const mongoose = require('mongoose');
const config = require('./src/config/config');
const Category = require('./src/models/category.model');
const SubCategory = require('./src/models/subcategory.model');
const Product = require('./src/models/product.model');

const migrateSlugs = async () => {
  try {
    console.log('Connecting to MongoDB...', config.mongoose.url);
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('Connected.');

    // Find and migrate categories
    const categories = await Category.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    console.log(`Found ${categories.length} categories without slugs. Migrating...`);
    for (const cat of categories) {
      await cat.save(); // triggers the pre-save hook
    }

    // Find and migrate subcategories
    const subCategories = await SubCategory.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    console.log(`Found ${subCategories.length} subcategories without slugs. Migrating...`);
    for (const sub of subCategories) {
      await sub.save();
    }

    // Find and migrate products
    const products = await Product.find({ $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] });
    console.log(`Found ${products.length} products without slugs. Migrating...`);
    for (const prod of products) {
      await prod.save();
    }

    console.log('Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error migrating slugs:', error);
    process.exit(1);
  }
};

migrateSlugs();
