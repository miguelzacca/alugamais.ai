import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { owners, properties, rentals, monthlyCharges } from '../db/schema';
import { eq } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
    const propertyIds = new Set(userProperties.map(p => p.id));
    const allRentals = await db.select().from(rentals);
    const userRentals = allRentals.filter(r => propertyIds.has(r.propertyId));
    const rentalIds = new Set(userRentals.map(r => r.id));

    const allCharges = await db.select().from(monthlyCharges);
    const userCharges = allCharges.filter(c => rentalIds.has(c.rentalId));

    // Monthly commission & gross for last 12 months
    const monthlyData: { month: number; year: number; label: string; commission: number; gross: number; ownerAmount: number; pendingCommission: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const monthCharges = userCharges.filter(c => c.month === m && c.year === y);
      const paidCharges = monthCharges.filter(c => c.status === 'paid');
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      monthlyData.push({
        month: m, year: y, label,
        commission: parseFloat(paidCharges.reduce((s, c) => s + c.totalCommission, 0).toFixed(2)),
        gross: parseFloat(paidCharges.reduce((s, c) => s + c.grossAmount, 0).toFixed(2)),
        ownerAmount: parseFloat(paidCharges.reduce((s, c) => s + c.ownerAmount, 0).toFixed(2)),
        pendingCommission: parseFloat(monthCharges.filter(c => c.status !== 'paid').reduce((s, c) => s + c.totalCommission, 0).toFixed(2))
      });
    }

    // Commission by owner
    const userOwners = await db.select().from(owners).where(eq(owners.userId, user.userId));
    const commissionByOwner = userOwners.map(o => {
      const ownerProps = userProperties.filter(p => p.ownerId === o.id);
      const ownerPropIds = new Set(ownerProps.map(p => p.id));
      const ownerRentals = userRentals.filter(r => ownerPropIds.has(r.propertyId));
      const ownerRentalIds = new Set(ownerRentals.map(r => r.id));
      const ownerCharges = userCharges.filter(c => ownerRentalIds.has(c.rentalId) && c.year === currentYear && c.status === 'paid');
      return {
        ownerId: o.id, ownerName: o.name,
        ytdCommission: parseFloat(ownerCharges.reduce((s, c) => s + c.totalCommission, 0).toFixed(2)),
        ytdGross: parseFloat(ownerCharges.reduce((s, c) => s + c.grossAmount, 0).toFixed(2)),
        ytdOwnerAmount: parseFloat(ownerCharges.reduce((s, c) => s + c.ownerAmount, 0).toFixed(2))
      };
    }).sort((a, b) => b.ytdCommission - a.ytdCommission);

    // Summary
    const activeRentals = userRentals.filter(r => r.status === 'active');
    const ytdCharges = userCharges.filter(c => c.year === currentYear && c.status === 'paid');
    const ytdCommission = parseFloat(ytdCharges.reduce((s, c) => s + c.totalCommission, 0).toFixed(2));
    const ytdGross = parseFloat(ytdCharges.reduce((s, c) => s + c.grossAmount, 0).toFixed(2));
    const ytdOwnerAmount = parseFloat(ytdCharges.reduce((s, c) => s + c.ownerAmount, 0).toFixed(2));

    const thisMonthCharges = userCharges.filter(c => c.month === currentMonth && c.year === currentYear);
    const avgCommissionRate = activeRentals.length > 0
      ? parseFloat((activeRentals.reduce((s, r) => s + r.commissionRate, 0) / activeRentals.length).toFixed(1))
      : 0;
    const totalGrossRentRoll = activeRentals.reduce((s, r) => s + r.baseRentAmount, 0);
    const totalCommissionRoll = activeRentals.reduce((r_acc, r) => {
      const c = r.commissionType === 'percentage' ? r.baseRentAmount * (r.commissionRate / 100) : r.commissionRate;
      return r_acc + c + (r.administrationFee || 0);
    }, 0);

    return res.status(200).json({
      monthlyData,
      commissionByOwner,
      summary: {
        activeRentals: activeRentals.length,
        totalProperties: userProperties.length,
        occupancyRate: userProperties.length > 0 ? Math.round((activeRentals.length / userProperties.length) * 100) : 0,
        avgCommissionRate,
        totalGrossRentRoll: parseFloat(totalGrossRentRoll.toFixed(2)),
        totalCommissionRoll: parseFloat(totalCommissionRoll.toFixed(2)),
        ytdCommission, ytdGross, ytdOwnerAmount,
        collectionRate: ytdGross > 0 ? Math.round((ytdCommission / (totalCommissionRoll * 12 / 12)) * 100) : 0
      },
      currentMonth: {
        paidCount: thisMonthCharges.filter(c => c.status === 'paid').length,
        pendingCount: thisMonthCharges.filter(c => c.status === 'pending').length,
        lateCount: thisMonthCharges.filter(c => c.status === 'late').length,
        paidCommission: parseFloat(thisMonthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.totalCommission, 0).toFixed(2)),
        pendingCommission: parseFloat(thisMonthCharges.filter(c => c.status !== 'paid').reduce((s, c) => s + c.totalCommission, 0).toFixed(2)),
        paidGross: parseFloat(thisMonthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.grossAmount, 0).toFixed(2)),
        ownerRemittancePending: parseFloat(thisMonthCharges.filter(c => c.status === 'paid' && !c.ownerPaid).reduce((s, c) => s + c.ownerAmount, 0).toFixed(2))
      }
    });
  } catch (error: any) {
    console.error('Reports error:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
}
