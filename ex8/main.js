const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('=== BẮT ĐẦU CRUD PRISMA ===\n');

        console.log('1. Tạo Author kèm 2 Book:');
        const author = await prisma.author.create({
            data: {
                name: 'Robert C. Martin',
                books: {
                    create: [
                        {
                            title: 'Clean Code',
                            price: 150000
                        },
                        {
                            title: 'The Clean Coder',
                            price: 120000
                        }
                    ]
                }
            },
            include: {
                books: true
            }
        });
        console.log('✓ Đã tạo Author và Book:');
        console.log(`  Author: ${author.name} (ID: ${author.id})`);
        console.log('  Books:');
        author.books.forEach(book => {
            console.log(`    - ${book.title} (${book.price}đ, ID: ${book.id})`);
        });
        console.log('');

        console.log('2. Đọc Author kèm toàn bộ Book:');
        const foundAuthor = await prisma.author.findUnique({
            where: { id: author.id },
            include: {
                books: true
            }
        });
        if (foundAuthor) {
            console.log(`  Author: ${foundAuthor.name} (ID: ${foundAuthor.id})`);
            console.log('  Books:');
            foundAuthor.books.forEach(book => {
                console.log(`    - ${book.title} (${book.price}đ, ID: ${book.id})`);
            });
        }
        console.log('');

        console.log('3. Cập nhật giá Book:');
        const bookToUpdate = author.books[0];
        const updatedBook = await prisma.book.update({
            where: { id: bookToUpdate.id },
            data: { price: 180000 }
        });
        console.log(`  ✓ Đã cập nhật book "${updatedBook.title}":`);
        console.log(`    Giá cũ: ${bookToUpdate.price}đ → Giá mới: ${updatedBook.price}đ`);
        console.log('');

        console.log('4. Xóa một Book:');
        const bookToDelete = author.books[1];
        await prisma.book.delete({
            where: { id: bookToDelete.id }
        });
        console.log(`  ✓ Đã xóa book "${bookToDelete.title}" (ID: ${bookToDelete.id})`);
        console.log('');

        console.log('5. Thử xóa Book không tồn tại:');
        try {
            await prisma.book.delete({
                where: { id: 999999 }
            });
        } catch (error) {
            if (error.code === 'P2025') {
                console.log('  ⚠ Không tìm thấy Book với ID: 999999');
                console.log('  → Chương trình tiếp tục chạy bình thường');
            } else {
                throw error;
            }
        }
        console.log('');

        console.log('6. Kết quả cuối cùng:');
        const finalAuthor = await prisma.author.findUnique({
            where: { id: author.id },
            include: {
                books: true
            }
        });
        if (finalAuthor) {
            console.log(`  Author: ${finalAuthor.name} (ID: ${finalAuthor.id})`);
            console.log(`  Số lượng Book còn lại: ${finalAuthor.books.length}`);
            console.log('  Books:');
            finalAuthor.books.forEach(book => {
                console.log(`    - ${book.title} (${book.price}đ, ID: ${book.id})`);
            });
        }
        console.log('');

        console.log('=== HOÀN THÀNH CRUD PRISMA ===');

    } catch (error) {
        console.error('Lỗi:', error.message);
        console.error('Chi tiết:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();