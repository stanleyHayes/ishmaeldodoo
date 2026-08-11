import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const bodyTooLarge =
      exception !== null &&
      typeof exception === "object" &&
      (("status" in exception && exception.status === 413) ||
        ("type" in exception && exception.type === "entity.too.large"));
    const status = bodyTooLarge
      ? HttpStatus.PAYLOAD_TOO_LARGE
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const requestId = String(
      response.locals.requestId ??
        request.headers["x-request-id"] ??
        crypto.randomUUID(),
    );
    const message = bodyTooLarge
      ? "Request body is too large"
      : exception instanceof HttpException && status < 500
        ? exception.message
        : "An unexpected error occurred";

    response.status(status).json({
      statusCode: status,
      code: bodyTooLarge
        ? "PayloadTooLarge"
        : exception instanceof HttpException
          ? exception.name
          : "InternalServerError",
      message,
      requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
