import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, monthlyCharges, payments } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  // GET - list payments with optional filters
  if (req.method === 'GET') {
    try {
      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const propertyIds = new Set(userProperties.map(p => p.id));
      const allRentals = await db.select().from(rentals);
      const userRentals = allRentals.filter(r => propertyIds.has(r.propertyId));
      const rentalIds = new Set(userRentals.map(r => r.id));

      const allPayments = await db.select().from(payments);
      const userPayments = allPayments
        .filter(p => rentalIds.has(p.rentalId))
        .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());

      const result = userPayments.map(p => {
        const rental = userRentals.find(r => r.id === p.rentalId);
        const property = userProperties.find(pr => pr.id === rental?.propertyId);
        return { ...p, tenantName: rental?.tenantName, address: property?.address };
      });

      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao listar pagamentos' });
    }
  }

  // POST - register a payment and optionally mark charge as paid
  if (req.method === 'POST') {
    try {
      const { rentalId, chargeId, amount, paidAt, paymentMethod, notes } = req.body;
      if (!rentalId || !amount || !paidAt) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
      }

      // Verify rental belongs to user
      const [rental] = await db.select().from(rentals).where(eq(rentals.id, rentalId));
      if (!rental) return res.status(404).json({ error: 'Aluguel não encontrado' });
      const [property] = await db.select().from(properties).where(eq(properties.id, rental.propertyId));
      if (!property || property.userId !== user.userId) return res.status(403).json({ error: 'Acesso negado' });

      const paymentId = crypto.randomUUID();
      const now = new Date();

      await db.insert(payments).values({
        id: paymentId,
        rentalId,
        chargeId: chargeId || null,
        amount: parseFloat(amount),
        paidAt: new Date(paidAt),
        paymentMethod: paymentMethod || 'transfer',
        notes: notes || null,
        createdAt: now
      });

      // If a chargeId was provided, mark that charge as paid
      if (chargeId) {
        await db.update(monthlyCharges)
          .set({ status: 'paid' })
          .where(eq(monthlyCharges.id, chargeId));
      }

      return res.status(201).json({ success: true, paymentId });
    } catch (error: any) {
      console.error('Create payment error:', error);
      return res.status(500).json({ error: 'Erro ao registrar pagamento' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
