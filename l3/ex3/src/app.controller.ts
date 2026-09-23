import { Controller, Get, Param } from '@nestjs/common';

@Controller()
export class AppController {
    @Get('hello')
    getHello() {
        return { message: 'Xin chào' };
    }

    @Get('users')
    getUsers() {
        return [
            { id: 1, name: 'Nguyen Van A' },
            { id: 2, name: 'Tran Thi B' },
        ];
    }

    @Get('users/:id')
    getUser(@Param('id') id: string) {
        return { id: Number(id), name: 'Nguyen Van A' };
    }
}