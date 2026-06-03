import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, rentalFees, monthlyCharges, payments } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Get all properties for this user
    const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));

    if (userProperties.length === 0) {
      return res.status(200).json({
        stats: {
          expectedRevenue: 0, activeRentals: 0, latePayments: 0,
          pendingThisMonth: 0, paidThisMonth: 0, occupancyRate: 0, totalProperties: 0
        },
        rentals: [], upcomingDue: [], recentPayments: []
      });
    }

    const propertyIds = userProperties.map(p => p.id);
    const allRentals = await db.select().from(rentals);
    const activeUserRentals = allRentals.filter(r => propertyIds.includes(r.propertyId) && r.status === 'active');
    const allUserRentals = allRentals.filter(r => propertyIds.includes(r.propertyId));

    // Calculate expected revenue (base rent + active fees)
    let expectedRevenue = 0;
    for (const rental of activeUserRentals) {
      expectedRevenue += rental.baseRentAmount;
      const fees = await db.select().from(rentalFees).where(eq(rentalFees.rentalId, rental.id));
      const currentFees = fees.filter(f => f.validToMonth === null);
      for (const fee of currentFees) { expectedRevenue += fee.amount; }
    }

    // Get all monthly charges to calculate stats
    const allCharges = await db.select().from(monthlyCharges);
    const rentalIdSet = new Set(activeUserRentals.map(r => r.id));
    const userCharges = allCharges.filter(c => rentalIdSet.has(c.rentalId));

    // Current month charges
    const thisMonthCharges = userCharges.filter(c => c.month === currentMonth && c.year === currentYear);
    const paidThisMonth = thisMonthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.totalAmount, 0);
    const pendingThisMonth = thisMonthCharges.filter(c => c.status !== 'paid').reduce((s, c) => s + c.totalAmount, 0);
    const lateCharges = thisMonthCharges.filter(c => c.status === 'late').length;

    // Upcoming due (rentals with due date in next 7 days)
    const today = now.getDate();
    const upcomingDue = activeUserRentals
      .filter(r => {
        const diff = r.dueDateDay - today;
        return diff >= 0 && diff <= 7;
      })
      .map(r => {
        const property = userProperties.find(p => p.id === r.propertyId);
        return {
          id: r.id,
          tenantName: r.tenantName,
          address: property?.address,
          dueDay: r.dueDateDay,
          amount: r.baseRentAmount,
          daysUntilDue: r.dueDateDay - today
        };
      })
      .sort((a, b) => a.daysUntilDue - b.daysUntilDue);

    // Recent payments
    const allPayments = await db.select().from(payments).orderBy(desc(payments.paidAt));
    const rentalIds = new Set(allUserRentals.map(r => r.id));
    const recentPayments = allPayments
      .filter(p => rentalIds.has(p.rentalId))
      .slice(0, 5)
      .map(p => {
        const rental = allUserRentals.find(r => r.id === p.rentalId);
        const property = userProperties.find(pr => pr.id === rental?.propertyId);
        return {
          id: p.id,
          tenantName: rental?.tenantName,
          address: property?.address,
          amount: p.amount,
          paidAt: p.paidAt,
          method: p.paymentMethod
        };
      });

    // Build rental list
    const rentalsList = activeUserRentals.map(r => {
      const property = userProperties.find(p => p.id === r.propertyId);
      const charge = thisMonthCharges.find(c => c.rentalId === r.id);
      return {
        id: r.id,
        address: property?.address,
        buildingName: property?.buildingName,
        propertyType: property?.propertyType,
        tenantName: r.tenantName,
        tenantEmail: r.tenantEmail,
        dueDateDay: r.dueDateDay,
        baseRent: r.baseRentAmount,
        totalAmount: charge?.totalAmount ?? r.baseRentAmount,
        chargeStatus: charge?.status ?? 'pending',
        status: r.status
      };
    });

    // YTD revenue (paid charges this year)
    const yearCharges = userCharges.filter(c => c.year === currentYear && c.status === 'paid');
    const ytdRevenue = yearCharges.reduce((s, c) => s + c.totalAmount, 0);

    return res.status(200).json({
      stats: {
        expectedRevenue,
        activeRentals: activeUserRentals.length,
        latePayments: lateCharges,
        paidThisMonth,
        pendingThisMonth,
        occupancyRate: userProperties.length > 0 ? Math.round((activeUserRentals.length / userProperties.length) * 100) : 0,
        totalProperties: userProperties.length,
        ytdRevenue
      },
      rentals: rentalsList,
      upcomingDue,
      recentPayments
    });

  } catch (error: any) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Erro ao carregar dados do painel' });
  }
}
