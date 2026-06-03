import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, rentalFees, monthlyCharges } from '../db/schema';
import { eq, sql } from 'drizzle-orm';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = requireAuth(req, res);
  if (!user) return; // Response is already sent by requireAuth

  try {
    // Get all properties for this user
    const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
    
    if (userProperties.length === 0) {
      return res.status(200).json({
        stats: {
          expectedRevenue: 0,
          activeRentals: 0,
          latePayments: 0
        },
        rentals: []
      });
    }

    const propertyIds = userProperties.map(p => p.id);
    
    // Get active rentals for these properties
    // Drizzle doesn't have an easy "IN" operator without mapping, so we can fetch all and filter, or use raw query.
    // For simplicity, we just fetch all rentals (we'd use inArray in production with many records)
    const allRentals = await db.select().from(rentals);
    const activeUserRentals = allRentals.filter(r => propertyIds.includes(r.propertyId) && r.status === 'active');

    // Calculate expected revenue (Sum of base rent + fees for active rentals)
    let expectedRevenue = 0;
    
    for (const rental of activeUserRentals) {
      expectedRevenue += rental.baseRentAmount;
      const fees = await db.select().from(rentalFees).where(eq(rentalFees.rentalId, rental.id));
      // Only sum active fees (where validToMonth is null or in the future)
      const currentFees = fees.filter(f => f.validToMonth === null);
      for (const fee of currentFees) {
        expectedRevenue += fee.amount;
      }
    }

    // To get full rental data for the dashboard list
    const rentalsList = activeUserRentals.map(r => {
      const property = userProperties.find(p => p.id === r.propertyId);
      return {
        id: r.id,
        address: property?.address,
        buildingName: property?.buildingName,
        tenantName: r.tenantName,
        dueDateDay: r.dueDateDay,
        baseRent: r.baseRentAmount
      };
    });

    return res.status(200).json({
      stats: {
        expectedRevenue,
        activeRentals: activeUserRentals.length,
        latePayments: 0 // Mock for now
      },
      rentals: rentalsList
    });

  } catch (error: any) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Erro ao carregar dados do painel' });
  }
}
