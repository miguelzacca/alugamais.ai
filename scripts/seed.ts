import { db } from '../db';
import { users, owners, properties, rentals, monthlyCharges } from '../db/schema';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../.env.local') });


async function seed() {
  console.log('🌱 Starting DB seed...');

  try {
    // 1. Create a user
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash('123456', 10);
    
    await db.insert(users).values({
      id: userId,
      email: 'admin@alugamais.com',
      passwordHash,
      name: 'Admin AlugaMais',
      agencyName: 'Imobiliária AlugaMais',
      createdAt: new Date(),
    });
    console.log('✅ User created: admin@alugamais.com / 123456');

    // 2. Create an owner
    const ownerId = randomUUID();
    await db.insert(owners).values({
      id: ownerId,
      userId: userId,
      name: 'João Proprietário',
      document: '111.222.333-44',
      email: 'joao@example.com',
      phone: '11999999999',
      bankName: 'Nubank',
      bankPixKey: 'joao@example.com',
      createdAt: new Date(),
    });
    console.log('✅ Owner created: João Proprietário');

    // 3. Create a property
    const propertyId = randomUUID();
    await db.insert(properties).values({
      id: propertyId,
      userId: userId,
      ownerId: ownerId,
      address: 'Rua das Flores, 123 - Centro',
      propertyType: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✅ Property created: Rua das Flores, 123');

    // 4. Create a rental
    const rentalId = randomUUID();
    const now = new Date();
    await db.insert(rentals).values({
      id: rentalId,
      propertyId: propertyId,
      tenantName: 'Maria Inquilina',
      tenantEmail: 'maria@example.com',
      tenantPhone: '11988888888',
      baseRentAmount: 1500.0,
      commissionType: 'percentage',
      commissionRate: 10, // 10%
      administrationFee: 0,
      moveInDate: now,
      dueDateDay: 5,
      ownerPaymentDay: 10,
      status: 'active',
      createdAt: now,
    });
    console.log('✅ Rental created: Maria Inquilina');

    // 5. Create a monthly charge for this month
    const chargeId = randomUUID();
    const baseRent = 1500.0;
    const commissionAmount = baseRent * 0.10; // 150
    const ownerAmount = baseRent - commissionAmount; // 1350

    await db.insert(monthlyCharges).values({
      id: chargeId,
      rentalId: rentalId,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      baseRent,
      totalFees: 0,
      grossAmount: baseRent,
      commissionAmount,
      administrationFee: 0,
      totalCommission: commissionAmount,
      ownerAmount,
      status: 'pending',
      ownerPaid: false,
      createdAt: now,
    });
    console.log('✅ Monthly charge created for current month');

    console.log('✨ Seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding DB:', error);
  }
}

seed().then(() => process.exit(0)).catch(() => process.exit(1));
