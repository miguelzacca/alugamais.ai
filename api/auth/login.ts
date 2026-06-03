import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-alugamais-key-dev';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Find user
    const user = await db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(200).json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
