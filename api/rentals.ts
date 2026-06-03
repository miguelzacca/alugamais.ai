import { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_utils/auth';
import { db } from '../db';
import { properties, rentals, rentalFees } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = requireAuth(req, res);
  if (!user) return;

  // GET - list all rentals with property info
  if (req.method === 'GET') {
    try {
      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const propertyIds = userProperties.map(p => p.id);
      const allRentals = await db.select().from(rentals);
      const userRentals = allRentals.filter(r => propertyIds.includes(r.propertyId));

      const result = userRentals.map(r => {
        const property = userProperties.find(p => p.id === r.propertyId);
        return { ...r, property };
      });

      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao listar aluguéis' });
    }
  }

  // POST - create new rental
  if (req.method === 'POST') {
    try {
      const {
        address, buildingName, propertyType, area, bedrooms, bathrooms,
        tenantName, tenantDocument, tenantEmail, tenantPhone,
        baseRentAmount, moveInDate, contractEndDate, contractDurationMonths,
        dueDateDay, indexType, indexRate, guaranteeType, notes,
        fees
      } = req.body;

      if (!address || !tenantName || !baseRentAmount || !moveInDate || !dueDateDay) {
        return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
      }

      const propertyId = crypto.randomUUID();
      const rentalId = crypto.randomUUID();
      const now = new Date();

      await db.insert(properties).values({
        id: propertyId,
        userId: user.userId,
        address,
        buildingName: buildingName || null,
        propertyType: propertyType || 'apartment',
        area: area ? parseFloat(area) : null,
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms ? parseInt(bathrooms) : null,
        createdAt: now,
        updatedAt: now
      });

      await db.insert(rentals).values({
        id: rentalId,
        propertyId,
        tenantName,
        tenantDocument: tenantDocument || null,
        tenantEmail: tenantEmail || null,
        tenantPhone: tenantPhone || null,
        baseRentAmount: parseFloat(baseRentAmount),
        moveInDate: new Date(moveInDate),
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        contractDurationMonths: contractDurationMonths ? parseInt(contractDurationMonths) : null,
        dueDateDay: parseInt(dueDateDay),
        indexType: indexType || 'none',
        indexRate: indexRate ? parseFloat(indexRate) : null,
        guaranteeType: guaranteeType || 'none',
        notes: notes || null,
        status: 'active',
        createdAt: now
      });

      if (fees && Array.isArray(fees)) {
        for (const fee of fees) {
          if (!fee.feeType || !fee.amount) continue;
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

      return res.status(201).json({ success: true, rentalId, propertyId });
    } catch (error: any) {
      console.error('Create rental error:', error);
      return res.status(500).json({ error: 'Erro ao criar aluguel' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
