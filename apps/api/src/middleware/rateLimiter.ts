import {
  Request,
  Response,
} from 'express';
import rateLimit from 'express-rate-limit';

function rateLimitExceeded(req: Request, res: Response): Response {
  console.warn('Rate limit exceeded for IP:', req.ip);
  return res.status(429).json({ error: 'Too many requests, please try again later.' });
}

export const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceeded,
});

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitExceeded,
});