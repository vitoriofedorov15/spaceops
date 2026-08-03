import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private logger = new Logger('API');
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError)
      return res.status(400).json({
        code: 'VALIDATION_ERROR',
        message: 'Check the information you entered',
        details: error.flatten(),
      });
    if (error instanceof HttpException) {
      const body = error.getResponse();
      return res
        .status(error.getStatus())
        .json(
          typeof body === 'object' && 'code' in body
            ? body
            : { code: 'REQUEST_ERROR', message: error.message, details: null },
        );
    }
    const code = error?.driverError?.code ?? error?.code;
    if (code === '23P01' || code === '23505')
      return res.status(409).json({
        code: 'CONFLICT',
        message: 'The data has changed or this time is already booked. Refresh availability.',
        details: null,
      });
    // Never log query parameters: they can contain password/session hashes or private descriptions.
    this.logger.error(`Unhandled error: ${error?.name ?? 'Error'}; db code: ${code ?? 'none'}`);
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed',
      details: null,
    });
  }
}
