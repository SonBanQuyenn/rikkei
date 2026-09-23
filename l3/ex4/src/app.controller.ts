import {
    Controller,
    Delete,
    Get,
    Param,
    UseGuards,
} from '@nestjs/common';
import { OwnershipGuard } from './guards/ownership.guard';

const POSTS = [
    { id: 1, title: 'Bài viết của user 1', authorId: 1 },
    { id: 2, title: 'Bài viết của user 2', authorId: 2 },
];

@Controller()
export class AppController {
    @Get('posts')
    getPosts() {
        return POSTS;
    }

    @Delete('posts/:id')
    @UseGuards(OwnershipGuard)
    deletePost(@Param('id') id: string) {
        return {
            success: true,
            message: `Đã xóa bài viết ${id}`,
        };
    }
}