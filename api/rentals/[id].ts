import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../_utils/auth';
import { db } from '../../db';
import { properties, rentals, rentalFees, monthlyCharges, payments } from '../../db/schema';
import { eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID inválido' });

  try {
    // Verify ownership
    const [rental] = await db.select().from(rentals).where(eq(rentals.id, id));
    if (!rental) return res.status(404).json({ error: 'Aluguel não encontrado' });

    const [property] = await db.select().from(properties).where(eq(properties.id, rental.propertyId));
    if (!property || property.userId !== user.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    // GET - full rental details
    if (req.method === 'GET') {
      const fees = await db.select().from(rentalFees).where(eq(rentalFees.rentalId, id));
      const charges = await db.select().from(monthlyCharges).where(eq(monthlyCharges.rentalId, id));
      const rentalPayments = await db.select().from(payments).where(eq(payments.rentalId, id));

      // Sort charges by year/month desc
      charges.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));

      return res.status(200).json({
        rental: { ...rental, property },
        fees,
        charges,
        payments: rentalPayments
      });
    }

    // PUT - update rental
    if (req.method === 'PUT') {
      const {
        tenantName, tenantDocument, tenantEmail, tenantPhone,
        baseRentAmount, dueDateDay, contractEndDate, indexType, indexRate,
        guaranteeType, notes, status
      } = req.body;

      await db.update(rentals)
        .set({
          tenantName: tenantName ?? rental.tenantName,
          tenantDocument: tenantDocument ?? rental.tenantDocument,
          tenantEmail: tenantEmail ?? rental.tenantEmail,
          tenantPhone: tenantPhone ?? rental.tenantPhone,
          baseRentAmount: baseRentAmount ? parseFloat(baseRentAmount) : rental.baseRentAmount,
          dueDateDay: dueDateDay ? parseInt(dueDateDay) : rental.dueDateDay,
          contractEndDate: contractEndDate ? new Date(contractEndDate) : rental.contractEndDate,
          indexType: indexType ?? rental.indexType,
          indexRate: indexRate ? parseFloat(indexRate) : rental.indexRate,
          guaranteeType: guaranteeType ?? rental.guaranteeType,
          notes: notes ?? rental.notes,
          status: status ?? rental.status
        })
        .where(eq(rentals.id, id));

      return res.status(200).json({ success: true });
    }

    // DELETE - end rental
    if (req.method === 'DELETE') {
      await db.update(rentals).set({ status: 'ended' }).where(eq(rentals.id, id));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('Rental detail error:', error);
    return res.status(500).json({ error: 'Erro ao processar aluguel' });
  }
}
