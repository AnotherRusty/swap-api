import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

// Custom error class that extends the built-in Error
export class AppError extends Error {
  statusCode: number;
  status: string;
  isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Type for async route handler functions
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

// Wrapper to catch async errors
export const catchAsync = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

// Error handling middleware
export const errorHandler: ErrorRequestHandler = (
  err: AppError | Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default values if err is not an AppError
  const statusCode = 'statusCode' in err ? err.statusCode : 500;
  const status = 'status' in err ? err.status : 'error';
  const isOperational = 'isOperational' in err ? err.isOperational : false;

  if (process.env.NODE_ENV === 'development') {
    // More detailed error response in development
    res.status(statusCode).json({
      status,
      message: err.message,
      error: err,
      stack: err.stack
    });
  } else {
    // For production: only show operational errors with details
    if (isOperational) {
      res.status(statusCode).json({
        status,
        message: err.message
      });
    } else {
      // For programming or unknown errors
      console.error('ERROR 💥', err);
      res.status(500).json({
        status: 'error',
        message: 'Something went wrong'
      });
    }
  }
};

// Example usage:
/*
import express from 'express';
import { errorHandler, AppError, catchAsync } from './errorHandler';

const app = express();

// Regular route
app.get('/example', (req, res, next) => {
  try {
    // Your code
    if (!someCondition) {
      throw new AppError('Bad request', 400);
    }
    res.send('Success');
  } catch (err) {
    next(err);
  }
});

// Async route using catchAsync
app.get('/async-example', catchAsync(async (req, res) => {
  const data = await someAsyncOperation();
  if (!data) {
    throw new AppError('Resource not found', 404);
  }
  res.json(data);
}));

// Error handler must be after all routes
app.use(errorHandler);
*/