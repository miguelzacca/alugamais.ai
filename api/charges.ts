import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { owners, properties, rentals, rentalFees, monthlyCharges } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { month, year, status } = req.query;
      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const propertyIds = new Set(userProperties.map(p => p.id));
      const allRentals = await db.select().from(rentals);
      const userRentals = allRentals.filter(r => propertyIds.has(r.propertyId));
      const rentalIds = new Set(userRentals.map(r => r.id));

      const allCharges = await db.select().from(monthlyCharges);
      let userCharges = allCharges.filter(c => rentalIds.has(c.rentalId));

      if (month) userCharges = userCharges.filter(c => c.month === parseInt(month as string));
      if (year) userCharges = userCharges.filter(c => c.year === parseInt(year as string));
      if (status) userCharges = userCharges.filter(c => c.status === status);

      userCharges.sort((a, b) => (b.year * 100 + b.month) - (a.year * 100 + a.month));

      const userOwners = await db.select().from(owners).where(eq(owners.userId, user.userId));

      const result = userCharges.map(c => {
        const rental = userRentals.find(r => r.id === c.rentalId);
        const property = userProperties.find(p => p.id === rental?.propertyId);
        const owner = userOwners.find(o => o.id === property?.ownerId);
        return {
          ...c,
          tenantName: rental?.tenantName,
          address: property?.address,
          dueDateDay: rental?.dueDateDay,
          ownerName: owner?.name,
          ownerPaymentDay: rental?.ownerPaymentDay
        };
      });

      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao listar cobranças' });
    }
  }

  if (req.method === 'POST') {
    try {
      const now = new Date();
      const targetMonth = req.body.month ? parseInt(req.body.month) : now.getMonth() + 1;
      const targetYear = req.body.year ? parseInt(req.body.year) : now.getFullYear();

      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const propertyIds = new Set(userProperties.map(p => p.id));
      const allRentals = await db.select().from(rentals);
      const activeRentals = allRentals.filter(r => propertyIds.has(r.propertyId) && r.status === 'active');

      const allCharges = await db.select().from(monthlyCharges);
      const created: string[] = [];

      for (const rental of activeRentals) {
        const existing = allCharges.find(c =>
          c.rentalId === rental.id && c.month === targetMonth && c.year === targetYear
        );
        if (existing) continue;

        const fees = await db.select().from(rentalFees).where(eq(rentalFees.rentalId, rental.id));
        const activeFees = fees.filter(f => {
          if (f.validToMonth === null) return true;
          return (f.validToYear! * 100 + f.validToMonth!) >= (targetYear * 100 + targetMonth);
        });

        // Fees paid by tenant only count toward gross
        const tenantFees = activeFees.filter(f => f.paidBy === 'tenant').reduce((s, f) => s + f.amount, 0);
        const grossAmount = rental.baseRentAmount + tenantFees;

        // Commission calculation (on base rent only, not fees)
        const commissionAmount = rental.commissionType === 'percentage'
          ? parseFloat((rental.baseRentAmount * (rental.commissionRate / 100)).toFixed(2))
          : parseFloat(rental.commissionRate.toFixed(2));
        const adminFee = rental.administrationFee || 0;
        const totalCommission = parseFloat((commissionAmount + adminFee).toFixed(2));
        const ownerAmount = parseFloat((grossAmount - totalCommission).toFixed(2));

        const dueDate = new Date(targetYear, targetMonth - 1, rental.dueDateDay);
        const chargeId = crypto.randomUUID();

        await db.insert(monthlyCharges).values({
          id: chargeId,
          rentalId: rental.id,
          month: targetMonth,
          year: targetYear,
          baseRent: rental.baseRentAmount,
          totalFees: tenantFees,
          grossAmount,
          commissionAmount,
          administrationFee: adminFee,
          totalCommission,
          ownerAmount,
          status: dueDate < now ? 'late' : 'pending',
          ownerPaid: false,
          dueDate,
          createdAt: now
        });
        created.push(chargeId);
      }

      return res.status(200).json({ success: true, generated: created.length, chargeIds: created });
    } catch (error: any) {
      console.error('Generate charges error:', error);
      return res.status(500).json({ error: 'Erro ao gerar cobranças' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
