import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { owners, properties, rentals } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const userOwners = await db.select().from(owners).where(eq(owners.userId, user.userId));
      // Enrich with property/rental count
      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const allRentals = await db.select().from(rentals);
      const propertyIds = userProperties.map(p => p.id);
      const userRentals = allRentals.filter(r => propertyIds.includes(r.propertyId));

      const result = userOwners.map(o => {
        const ownerProperties = userProperties.filter(p => p.ownerId === o.id);
        const ownerPropIds = new Set(ownerProperties.map(p => p.id));
        const activeRentals = userRentals.filter(r => ownerPropIds.has(r.propertyId) && r.status === 'active');
        const totalRent = activeRentals.reduce((s, r) => s + r.baseRentAmount, 0);
        const totalCommission = activeRentals.reduce((r_acc, r) => {
          const c = r.commissionType === 'percentage' ? r.baseRentAmount * (r.commissionRate / 100) : r.commissionRate;
          return r_acc + c + (r.administrationFee || 0);
        }, 0);
        return {
          ...o,
          propertyCount: ownerProperties.length,
          activeRentals: activeRentals.length,
          totalRent,
          totalCommission: parseFloat(totalCommission.toFixed(2)),
          totalOwnerAmount: parseFloat((totalRent - totalCommission).toFixed(2))
        };
      });
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao listar proprietários' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, document, email, phone, bankName, bankAgency, bankAccount, bankPixKey, notes } = req.body;
      if (!name) return res.status(400).json({ error: 'Nome é obrigatório.' });

      const id = crypto.randomUUID();
      await db.insert(owners).values({
        id, userId: user.userId, name,
        document: document || null, email: email || null, phone: phone || null,
        bankName: bankName || null, bankAgency: bankAgency || null,
        bankAccount: bankAccount || null, bankPixKey: bankPixKey || null,
        notes: notes || null,
        createdAt: new Date()
      });
      return res.status(201).json({ success: true, id });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao criar proprietário' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
