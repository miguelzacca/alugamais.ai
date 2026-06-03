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
      const userProperties = await db.select().from(properties).where(eq(properties.userId, user.userId));
      const userOwners = await db.select().from(owners).where(eq(owners.userId, user.userId));
      const propertyIds = userProperties.map(p => p.id);
      const allRentals = await db.select().from(rentals);
      const userRentals = allRentals.filter(r => propertyIds.includes(r.propertyId));

      const result = userRentals.map(r => {
        const property = userProperties.find(p => p.id === r.propertyId);
        const owner = userOwners.find(o => o.id === property?.ownerId);
        const commission = r.commissionType === 'percentage'
          ? r.baseRentAmount * (r.commissionRate / 100)
          : r.commissionRate;
        const totalCommission = commission + (r.administrationFee || 0);
        return {
          ...r,
          property,
          owner,
          commission: parseFloat(totalCommission.toFixed(2)),
          ownerAmount: parseFloat((r.baseRentAmount - totalCommission).toFixed(2))
        };
      });
      return res.status(200).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao listar aluguéis' });
    }
  }

  if (req.method === 'POST') {
    try {
      const {
        // Property
        address, buildingName, propertyType, area, bedrooms, bathrooms, ownerId,
        // Tenant
        tenantName, tenantDocument, tenantEmail, tenantPhone,
        // Financial
        baseRentAmount, commissionType, commissionRate, administrationFee,
        // Contract
        moveInDate, contractEndDate, contractDurationMonths,
        dueDateDay, ownerPaymentDay,
        indexType, indexRate, guaranteeType, notes,
        // Fees
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
        ownerId: ownerId || null,
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
        commissionType: commissionType || 'percentage',
        commissionRate: commissionRate ? parseFloat(commissionRate) : 10,
        administrationFee: administrationFee ? parseFloat(administrationFee) : 0,
        moveInDate: new Date(moveInDate),
        contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        contractDurationMonths: contractDurationMonths ? parseInt(contractDurationMonths) : null,
        dueDateDay: parseInt(dueDateDay),
        ownerPaymentDay: ownerPaymentDay ? parseInt(ownerPaymentDay) : 10,
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
            paidBy: fee.paidBy || 'tenant',
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
