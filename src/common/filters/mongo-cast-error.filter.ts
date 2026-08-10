import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Error as MongooseError } from 'mongoose';

// Mongoose throws a CastError when a value can't be cast to the schema's
// expected type — most commonly a malformed ObjectId in a route param (e.g.
// GET /orders/payment-status/:orderId with a non-ObjectId :orderId).
// Uncaught, this reaches Nest's default filter as an opaque 500 instead of
// a client error. Registered globally in main.ts.
@Catch(MongooseError.CastError)
export class MongoCastErrorFilter implements ExceptionFilter {
  catch(exception: MongooseError.CastError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      message: `Invalid value for '${exception.path}'`,
      error: 'Bad Request',
    });
  }
}
