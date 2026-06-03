import { VercelRequest, VercelResponse } from '@vercel/node';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-alugamais-key-dev';

export function requireAuth(req: VercelRequest, res: VercelResponse): { userId: string, email: string } | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autorizado. Token ausente.' });
    return null;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      userId: decoded.userId,
      email: decoded.email
    };
  } catch (error) {
    res.status(401).json({ error: 'Não autorizado. Token inválido ou expirado.' });
    return null;
  }
}
