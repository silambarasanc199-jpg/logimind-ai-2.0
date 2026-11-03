import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing token' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    if (decodedToken.uid && decodedToken.email) {
      await getOrCreateUser(
        decodedToken.uid,
        decodedToken.email,
        decodedToken.name
      ).catch((err) => {
        console.error('Non-fatal user sync warning:', err);
      });
    }
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const attachOptionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1];
    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      req.user = decodedToken;
      if (decodedToken.uid && decodedToken.email) {
        await getOrCreateUser(
          decodedToken.uid,
          decodedToken.email,
          decodedToken.name
        ).catch((err) => {
          console.error('Non-fatal user sync warning:', err);
        });
      }
    } catch (error) {
      console.error('Optional Firebase token verification failed:', error);
    }
  }
  next();
};
