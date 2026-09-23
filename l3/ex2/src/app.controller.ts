import { Controller, Get, Query } from '@nestjs/common';
import { InsufficientFundsException } from './exceptions/insufficient-funds.exception';

const BALANCE = 100000;

@Controller()
export class AppController {
    @Get('transfer')
    transfer(@Query('amount') amount: string) {
        const transferAmount = Number(amount);

        if (transferAmount > BALANCE) {
            throw new InsufficientFundsException();
        }

        return {
            success: true,
            message: 'Chuyển tiền thành công',
            data: {
                balance: BALANCE,
                transferred: transferAmount,
                remaining: BALANCE - transferAmount,
            },
        };
    }
}