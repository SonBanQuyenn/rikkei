import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientFundsException extends HttpException {
    constructor() {
        super('Số dư tài khoản không đủ để thực hiện giao dịch', HttpStatus.BAD_REQUEST);
    }
}