import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, monthlyCharges, payments } from '../db/schema';
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

    // Monthly revenue for last 12 months
    const monthlyRevenue: { month: number; year: number; label: string; paid: number; pending: number; late: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1 - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const monthCharges = userCharges.filter(c => c.month === m && c.year === y);
      const paid = monthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.totalAmount, 0);
      const pending = monthCharges.filter(c => c.status === 'pending').reduce((s, c) => s + c.totalAmount, 0);
      const late = monthCharges.filter(c => c.status === 'late').reduce((s, c) => s + c.totalAmount, 0);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      monthlyRevenue.push({ month: m, year: y, label, paid, pending, late });
    }

    // Revenue by property (YTD)
    const revenueByProperty = userProperties.map(p => {
      const propRentals = userRentals.filter(r => r.propertyId === p.id);
      const propRentalIds = new Set(propRentals.map(r => r.id));
      const propCharges = userCharges.filter(c => propRentalIds.has(c.rentalId) && c.year === currentYear && c.status === 'paid');
      return {
        propertyId: p.id,
        address: p.address,
        buildingName: p.buildingName,
        ytdRevenue: propCharges.reduce((s, c) => s + c.totalAmount, 0)
      };
    }).sort((a, b) => b.ytdRevenue - a.ytdRevenue);

    // Status breakdown
    const activeRentals = userRentals.filter(r => r.status === 'active').length;
    const endedRentals = userRentals.filter(r => r.status === 'ended').length;
    const thisMonthCharges = userCharges.filter(c => c.month === currentMonth && c.year === currentYear);
    const paidCount = thisMonthCharges.filter(c => c.status === 'paid').length;
    const pendingCount = thisMonthCharges.filter(c => c.status === 'pending').length;
    const lateCount = thisMonthCharges.filter(c => c.status === 'late').length;

    // YTD totals
    const ytdPaid = userCharges.filter(c => c.year === currentYear && c.status === 'paid').reduce((s, c) => s + c.totalAmount, 0);
    const ytdExpected = userCharges.filter(c => c.year === currentYear).reduce((s, c) => s + c.totalAmount, 0);

    // Average ticket
    const avgTicket = activeRentals > 0
      ? userRentals.filter(r => r.status === 'active').reduce((s, r) => s + r.baseRentAmount, 0) / activeRentals
      : 0;

    return res.status(200).json({
      monthlyRevenue,
      revenueByProperty,
      summary: {
        activeRentals,
        endedRentals,
        totalProperties: userProperties.length,
        occupancyRate: userProperties.length > 0 ? Math.round((activeRentals / userProperties.length) * 100) : 0,
        avgTicket,
        ytdPaid,
        ytdExpected,
        collectionRate: ytdExpected > 0 ? Math.round((ytdPaid / ytdExpected) * 100) : 0
      },
      currentMonth: {
        paidCount,
        pendingCount,
        lateCount,
        paidAmount: thisMonthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.totalAmount, 0),
        pendingAmount: thisMonthCharges.filter(c => c.status !== 'paid').reduce((s, c) => s + c.totalAmount, 0)
      }
    });
  } catch (error: any) {
    console.error('Reports error:', error);
    return res.status(500).json({ error: 'Erro ao gerar relatórios' });
  }
}
