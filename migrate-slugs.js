const mongoose = require('mongoose');
const Category = require('./src/models/category.model');
const SubCategory = require('./src/models/subcategory.model');
const Product = require('./src/models/product.model');
require('dotenv').config();

const DB_URL = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/upleex'; // Make sure DB URL is correct or loads from .env

const generateSlug = (text) => {
  if (!text) return '';
  return text.toString().toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
};

async function migrateSlugs() {
  try {
    await mongoose.connect(DB_URL);
    console.log('Connected to DB');

    // Categories
    const categories = await Category.find({});
    for (const cat of categories) {
      if (cat.slug && cat.slug.includes('-')) {
        cat.slug = cat.slug.replace(/-/g, '');
        // The pre-save hook will NOT override it because we are modifying slug directly, 
        // wait, the hook says `if (this.isModified('categories_name') || !this.slug)`
        // Since categories_name is not modified, and this.slug exists, the hook skips generating a new one!
        // But wait, what if the slug conflicts? We will handle conflicts if they happen (script will crash, we can fix manually).
        await cat.save();
      }
    }
    console.log('Categories migrated');

    // SubCategories
    const subcats = await SubCategory.find({});
    for (const sub of subcats) {
      if (sub.slug && sub.slug.includes('-')) {
        sub.slug = sub.slug.replace(/-/g, '');
        await sub.save();
      }
    }
    console.log('Subcategories migrated');

    // Products
    const products = await Product.find({});
    for (const prod of products) {
      if (prod.slug && prod.slug.includes('-')) {
        prod.slug = prod.slug.replace(/-/g, '');
        await prod.save();
      }
    }
    console.log('Products migrated');

    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error during migration', error);
    process.exit(1);
  }
}

migrateSlugs();
