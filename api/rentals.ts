import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, rentalFees } from '../db/schema';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'POST') {
    try {
      const {
        address, buildingName,
        tenantName, tenantDocument,
        baseRentAmount, moveInDate, dueDateDay,
        fees // Array of { feeType, amount, isVariable }
      } = req.body;

      if (!address || !tenantName || !baseRentAmount || !moveInDate || !dueDateDay) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
      }

      const propertyId = crypto.randomUUID();
      const rentalId = crypto.randomUUID();
      const now = new Date();

      // Create Property
      await db.insert(properties).values({
        id: propertyId,
        userId: user.userId,
        address,
        buildingName,
        createdAt: now,
        updatedAt: now
      });

      // Create Rental
      await db.insert(rentals).values({
        id: rentalId,
        propertyId,
        tenantName,
        tenantDocument,
        baseRentAmount: parseFloat(baseRentAmount),
        moveInDate: new Date(moveInDate),
        dueDateDay: parseInt(dueDateDay),
        status: 'active',
        createdAt: now
      });

      // Insert Fees if any
      if (fees && Array.isArray(fees)) {
        for (const fee of fees) {
          await db.insert(rentalFees).values({
            id: crypto.randomUUID(),
            rentalId,
            feeType: fee.feeType,
            amount: parseFloat(fee.amount),
            validFromMonth: now.getMonth() + 1,
            validFromYear: now.getFullYear(),
            isVariable: fee.isVariable || false
          });
        }
      }

      return res.status(201).json({ success: true, rentalId });
    } catch (error: any) {
      console.error('Create rental error:', error);
      return res.status(500).json({ error: 'Erro ao criar aluguel' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
