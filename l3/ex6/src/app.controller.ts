import { Controller, Post, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get('health')
    health() {
        return { success: true, message: 'OK' };
    }

    @Post('users')
    createUser() {
        // Giả lập lỗi PostgreSQL Unique Constraint (23505)
        const dbError: any = new Error(
            'duplicate key value violates unique constraint "users_email_key"',
        );
        dbError.code = '23505';
        dbError.detail = 'Key (email)=(test@example.com) already exists.';

        throw dbError;
    }
}