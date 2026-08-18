const mongoose = require('mongoose');
const Store = require('./models/Store');

const MONGODB_URI = 'mongodb://localhost:27017/ecommerce_db';

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Kết nối MongoDB thành công!\n');
    } catch (error) {
        console.error('Kết nối MongoDB thất bại:', error.message);
        process.exit(1);
    }
}

async function createStore() {
    console.log('=== TẠO CỬA HÀNG MỚI ===\n');

    const storeData = {
        name: 'TechStore Pro',
        phone: '0987654321',
        email: 'contact@techstore.com',
        location: {
            street: '123 Nguyễn Trãi, Phường Bến Thành',
            district: 'Quận 1',
            city: 'Thành phố Hồ Chí Minh'
        }
    };

    console.log('Dữ liệu cửa hàng:');
    console.log(JSON.stringify(storeData, null, 2));
    console.log('');

    try {
        const store = new Store(storeData);
        const savedStore = await store.save();

        console.log('✓ Tạo cửa hàng THÀNH CÔNG:');
        console.log(`  ID: ${savedStore._id}`);
        console.log(`  Tên: ${savedStore.name}`);
        console.log(`  SĐT: ${savedStore.phone}`);
        console.log(`  Email: ${savedStore.email}`);
        console.log(`  Địa chỉ: ${savedStore.location.street}, ${savedStore.location.district}, ${savedStore.location.city}`);
        console.log(`  Tạo lúc: ${savedStore.createdAt}`);
        console.log('');

        return savedStore;
    } catch (error) {
        console.error('Lỗi khi tạo cửa hàng:', error.message);
        if (error.name === 'ValidationError') {
            console.log('\nChi tiết lỗi validation:');
            for (const field in error.errors) {
                console.log(`- ${field}: ${error.errors[field].message}`);
            }
        }
        return null;
    }
}

async function createMultipleStores() {
    console.log('=== TẠO NHIỀU CỬA HÀNG ===\n');

    const storesData = [
        {
            name: 'BookStore Central',
            phone: '0912345678',
            email: 'central@bookstore.com',
            location: {
                street: '456 Lê Lợi, Phường Bến Nghé',
                district: 'Quận 1',
                city: 'Thành phố Hồ Chí Minh'
            }
        },
        {
            name: 'Gadget World',
            phone: '0923456789',
            email: 'info@gadgetworld.com',
            location: {
                street: '789 Trần Hưng Đạo, Phường Cầu Kho',
                district: 'Quận 5',
                city: 'Thành phố Hồ Chí Minh'
            }
        },
        {
            name: 'Fashion Hub',
            phone: '0934567890',
            email: 'hello@fashionhub.com',
            location: {
                street: '321 Nguyễn Huệ, Phường Bến Nghé',
                district: 'Quận 1',
                city: 'Thành phố Hồ Chí Minh'
            }
        }
    ];

    try {
        const inserted = await Store.insertMany(storesData);
        console.log(`✓ Đã tạo ${inserted.length} cửa hàng:\n`);
        inserted.forEach((store, index) => {
            console.log(`  ${index + 1}. ${store.name}`);
            console.log(`     Địa chỉ: ${store.location.street}, ${store.location.district}, ${store.location.city}\n`);
        });
        return inserted;
    } catch (error) {
        console.error('Lỗi khi tạo nhiều cửa hàng:', error.message);
        return null;
    }
}

async function queryStores() {
    console.log('=== TRUY VẤN CỬA HÀNG ===\n');

    // Truy vấn theo embedded document
    console.log('1. Cửa hàng tại Quận 1:');
    const storesInDistrict1 = await Store.find({
        'location.district': 'Quận 1'
    });
    storesInDistrict1.forEach(store => {
        console.log(`   - ${store.name} | ${store.location.street}, ${store.location.district}`);
    });
    console.log('');

    console.log('2. Cửa hàng tại Thành phố Hồ Chí Minh:');
    const storesInHCM = await Store.find({
        'location.city': 'Thành phố Hồ Chí Minh'
    });
    storesInHCM.forEach(store => {
        console.log(`   - ${store.name} | ${store.location.district}`);
    });
    console.log('');

    console.log('3. Tất cả cửa hàng (có location):');
    const allStores = await Store.find();
    allStores.forEach(store => {
        console.log(`   - ${store.name}`);
        console.log(`     Địa chỉ: ${store.location.street}`);
        console.log(`     Quận: ${store.location.district}`);
        console.log(`     Thành phố: ${store.location.city}\n`);
    });
}

async function main() {
    await connectDB();

    await Store.deleteMany({});
    console.log('Đã xóa dữ liệu cũ\n');

    await createStore();
    await createMultipleStores();
    await queryStores();

    await mongoose.disconnect();
    console.log('\nĐã ngắt kết nối MongoDB');
}

main();