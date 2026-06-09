const mongoose = require('mongoose');
const { Product, Category, SubCategory } = require('./src/models');
require('dotenv').config();

const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

async function run() {
  await mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected to MongoDB');

  // Categories
  const categories = await Category.find({ slug: { $exists: false } });
  for (let cat of categories) {
    cat.slug = generateSlug(cat.categories_name);
    // Let pre-save hook handle uniqueness if needed, but we can just save it.
    await cat.save();
  }
  console.log(`Updated ${categories.length} categories`);

  // SubCategories
  const subCategories = await SubCategory.find({ slug: { $exists: false } });
  for (let sub of subCategories) {
    sub.slug = generateSlug(sub.name);
    await sub.save();
  }
  console.log(`Updated ${subCategories.length} subcategories`);

  // Products
  const products = await Product.find({ slug: { $exists: false } });
  for (let prod of products) {
    prod.markModified('product_name');
    await prod.save();
  }
  console.log(`Updated ${products.length} products`);

  console.log('Done');
  process.exit(0);
}

run().catch(console.error);
