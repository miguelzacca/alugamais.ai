import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '../../db';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-alugamais-key-dev';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    }

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email)).get();
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();

    // Create user
    await db.insert(users).values({
      id: userId,
      email,
      name,
      passwordHash,
      createdAt: new Date(),
    });

    // Generate JWT
    const token = jwt.sign({ userId, email, name }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({ token, user: { id: userId, name, email } });
  } catch (error: any) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}
