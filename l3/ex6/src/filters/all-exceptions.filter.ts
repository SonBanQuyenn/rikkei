import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger(AllExceptionsFilter.name);

    catch(exception: any, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = 'Lỗi hệ thống, vui lòng thử lại sau';

        // Xử lý lỗi PostgreSQL Unique Constraint (23505)
        if (exception?.code === '23505') {
            status = HttpStatus.BAD_REQUEST;
            message = 'Dữ liệu này đã tồn tại trong hệ thống';
        }
        // Xử lý HttpException
        else if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            message =
                typeof res === 'string'
                    ? res
                    : (res as any).message || exception.message;
        }
        // Log lỗi ra console
        else {
            this.logger.error(exception?.message, exception?.stack);
        }

        response.status(status).json({
            success: false,
            statusCode: status,
            message,
            path: request.url,
            timestamp: new Date().toISOString(),
        });
    }
}