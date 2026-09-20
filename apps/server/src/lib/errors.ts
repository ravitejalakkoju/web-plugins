export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, message, details);

export const unauthorized = (message = 'unauthorized'): HttpError => new HttpError(401, message);

export const notFound = (message = 'not found'): HttpError => new HttpError(404, message);

export const unprocessable = (message: string, details?: unknown): HttpError =>
  new HttpError(422, message, details);
