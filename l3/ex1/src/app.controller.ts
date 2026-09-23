import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
    @Get()
    getHello() {
        return {
            success: true,
            message: 'Bạn đã truy cập thành công!',
        };
    }
}