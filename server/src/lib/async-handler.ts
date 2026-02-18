import type { Request, Response, NextFunction, RequestHandler } from 'express'

/**
 * Wraps an async Express route handler to properly catch rejected promises
 * and forward them to Express error handling middleware.
 *
 * Express 4.x does not automatically catch promise rejections from async handlers,
 * which can cause unhandled rejections and crash the process.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next)
  }
}
