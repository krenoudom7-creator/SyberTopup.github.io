import { NextFunction, Request, Response } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth } from '../lib/firebase-admin.ts';
import { getOrCreateUser } from '../db/users.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  permissions: string[];
  isActive: boolean;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
}

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return next();
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    if (decoded.email) {
      const dbUser = await getOrCreateUser(
        decoded.uid,
        decoded.email,
        decoded.name,
        decoded.picture
      );
      req.dbUser = dbUser;
    }
  } catch (err) {
    console.warn('Optional auth token skipped:', (err as Error).message);
  }
  next();
};

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(401).json({ error: 'Invalid authorization header.' });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    const dbUser = await getOrCreateUser(
      decoded.uid,
      decoded.email || `${decoded.uid}@users.nexustopup`,
      decoded.name,
      decoded.picture
    );
    if (!dbUser.isActive) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Firebase token verification failed:', error);
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token.' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.dbUser) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (req.dbUser.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Administrator access required.' });
  }
  next();
};
