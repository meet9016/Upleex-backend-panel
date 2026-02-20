const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

async function updateCartIndexes() {
    try {
        // Use your actual connection string from .env
        const mongoUri = process.env.MONGODB_URL || process.env.MONGO_URI;
        
        if (!mongoUri) {
            throw new Error('MongoDB connection string not found in environment variables');
        }

        await mongoose.connect(mongoUri);

        const db = mongoose.connection.db;
        const collection = db.collection('carts');

        // Drop ALL indexes except _id_
    
        await collection.dropIndexes();

        // PreRecord with user_id
        await collection.createIndex(
            { cart_type: 1, product_id: 1, user_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_product_id_1_user_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'prerecord',
                    bucket_type: true,
                    user_id: { $type: 'objectId' }
                }
            }
        );

        // PreRecord with temp_id
        await collection.createIndex(
            { cart_type: 1, product_id: 1, temp_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_product_id_1_temp_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'prerecord',
                    bucket_type: true,
                    temp_id: { $type: 'string' }
                }
            }
        );

        // Exam Plans with user_id
        await collection.createIndex(
            { cart_type: 1, exam_category_id: 1, plan_id: 1, user_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_exam_category_id_1_plan_id_1_user_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'exam_plan',
                    bucket_type: true,
                    user_id: { $type: 'objectId' }
                }
            }
        );

        // Exam Plans with temp_id
        await collection.createIndex(
            { cart_type: 1, exam_category_id: 1, plan_id: 1, temp_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_exam_category_id_1_plan_id_1_temp_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'exam_plan',
                    bucket_type: true,
                    temp_id: { $type: 'string' }
                }
            }
        );

        // HyperSpecialist with user_id
        await collection.createIndex(
            { cart_type: 1, hyperspecialist_id: 1, user_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_hyperspecialist_id_1_user_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'hyperspecialist',
                    bucket_type: true,
                    user_id: { $type: 'objectId' }
                }
            }
        );

        // HyperSpecialist with temp_id
        await collection.createIndex(
            { cart_type: 1, hyperspecialist_id: 1, temp_id: 1, bucket_type: 1 },
            {
                unique: true,
                name: 'cart_type_1_hyperspecialist_id_1_temp_id_1_bucket_type_1',
                partialFilterExpression: {
                    cart_type: 'hyperspecialist',
                    bucket_type: true,
                    temp_id: { $type: 'string' }
                }
            }
        );

        // Performance indexes
        await collection.createIndex({ user_id: 1, bucket_type: 1 });
        await collection.createIndex({ temp_id: 1, bucket_type: 1 });

        // Verify
        const indexes = await collection.indexes();
        indexes.forEach(idx => console.log(`  - ${idx.name}`));

        await mongoose.connection.close();

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

updateCartIndexes();