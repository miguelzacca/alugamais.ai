import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { owners, properties, rentals, rentalFees, monthlyCharges, payments } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));

    if (userProperties.length === 0) {
      return res.status(200).json({
        stats: {
          commission: 0, activeRentals: 0, latePayments: 0,
          pendingCommission: 0, paidCommission: 0, occupancyRate: 0,
          totalProperties: 0, ytdCommission: 0, pendingOwnerRemittance: 0
        },
        rentals: [], upcomingDue: [], recentPayments: []
      });
    }

    const propertyIds = userProperties.map(p => p.id);
    const allRentals = await db.select().from(rentals);
    const activeUserRentals = allRentals.filter(r => propertyIds.includes(r.propertyId) && r.status === 'active');
    const allUserRentals = allRentals.filter(r => propertyIds.includes(r.propertyId));

    // Expected monthly commission (imob revenue)
    let expectedCommission = 0;
    for (const rental of activeUserRentals) {
      const commission = rental.commissionType === 'percentage'
        ? rental.baseRentAmount * (rental.commissionRate / 100)
        : rental.commissionRate;
      expectedCommission += commission + (rental.administrationFee || 0);
    }

    // Monthly charges stats
    const allCharges = await db.select().from(monthlyCharges);
    const rentalIdSet = new Set(activeUserRentals.map(r => r.id));
    const userCharges = allCharges.filter(c => rentalIdSet.has(c.rentalId));
    const thisMonthCharges = userCharges.filter(c => c.month === currentMonth && c.year === currentYear);

    const paidCommission = thisMonthCharges.filter(c => c.status === 'paid').reduce((s, c) => s + c.totalCommission, 0);
    const pendingCommission = thisMonthCharges.filter(c => c.status !== 'paid').reduce((s, c) => s + c.totalCommission, 0);
    const lateCharges = thisMonthCharges.filter(c => c.status === 'late').length;

    // Pending owner remittances (paid charges where owner hasn't been repassed yet)
    const pendingOwnerRemittance = thisMonthCharges
      .filter(c => c.status === 'paid' && !c.ownerPaid)
      .reduce((s, c) => s + c.ownerAmount, 0);

    // YTD commission
    const allIdSet = new Set(allUserRentals.map(r => r.id));
    const allUserCharges = allCharges.filter(c => allIdSet.has(c.rentalId));
    const ytdCommission = allUserCharges
      .filter(c => c.year === currentYear && c.status === 'paid')
      .reduce((s, c) => s + c.totalCommission, 0);

    // Upcoming due
    const today = now.getDate();
    const upcomingDue = activeUserRentals
      .filter(r => { const diff = r.dueDateDay - today; return diff >= 0 && diff <= 7; })
      .map(r => {
        const property = userProperties.find(p => p.id === r.propertyId);
        const commission = r.commissionType === 'percentage'
          ? r.baseRentAmount * (r.commissionRate / 100)
          : r.commissionRate;
        return {
          id: r.id, tenantName: r.tenantName,
          address: property?.address,
          dueDay: r.dueDateDay,
          grossAmount: r.baseRentAmount,
          commission: commission + (r.administrationFee || 0),
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
        const commission = rental
          ? (rental.commissionType === 'percentage'
              ? rental.baseRentAmount * (rental.commissionRate / 100)
              : rental.commissionRate) + (rental.administrationFee || 0)
          : 0;
        return {
          id: p.id, tenantName: rental?.tenantName,
          address: property?.address,
          grossAmount: p.amount,
          commission: parseFloat(commission.toFixed(2)),
          paidAt: p.paidAt, method: p.paymentMethod
        };
      });

    // Build rental list with commission breakdown
    const rentalsList = activeUserRentals.map(r => {
      const property = userProperties.find(p => p.id === r.propertyId);
      const charge = thisMonthCharges.find(c => c.rentalId === r.id);
      const commission = r.commissionType === 'percentage'
        ? r.baseRentAmount * (r.commissionRate / 100)
        : r.commissionRate;
      const totalCommission = commission + (r.administrationFee || 0);
      return {
        id: r.id,
        address: property?.address,
        buildingName: property?.buildingName,
        propertyType: property?.propertyType,
        tenantName: r.tenantName,
        tenantEmail: r.tenantEmail,
        dueDateDay: r.dueDateDay,
        grossAmount: r.baseRentAmount,
        commissionRate: r.commissionRate,
        commissionType: r.commissionType,
        commission: parseFloat(totalCommission.toFixed(2)),
        ownerAmount: parseFloat((r.baseRentAmount - totalCommission).toFixed(2)),
        chargeStatus: charge?.status ?? 'pending',
        ownerPaid: charge?.ownerPaid ?? false,
        status: r.status
      };
    });

    return res.status(200).json({
      stats: {
        expectedCommission: parseFloat(expectedCommission.toFixed(2)),
        activeRentals: activeUserRentals.length,
        latePayments: lateCharges,
        paidCommission: parseFloat(paidCommission.toFixed(2)),
        pendingCommission: parseFloat(pendingCommission.toFixed(2)),
        occupancyRate: userProperties.length > 0 ? Math.round((activeUserRentals.length / userProperties.length) * 100) : 0,
        totalProperties: userProperties.length,
        ytdCommission: parseFloat(ytdCommission.toFixed(2)),
        pendingOwnerRemittance: parseFloat(pendingOwnerRemittance.toFixed(2)),
        grossRentRoll: activeUserRentals.reduce((s, r) => s + r.baseRentAmount, 0)
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
