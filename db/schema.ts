import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  address: text('address').notNull(),
  buildingName: text('building_name'),
  propertyType: text('property_type').default('apartment'), // apartment, house, commercial, land
  area: real('area'), // m²
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const rentals = sqliteTable('rentals', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  tenantName: text('tenant_name').notNull(),
  tenantDocument: text('tenant_document'), // CPF/CNPJ
  tenantEmail: text('tenant_email'),
  tenantPhone: text('tenant_phone'),
  baseRentAmount: real('base_rent_amount').notNull(),
  moveInDate: integer('move_in_date', { mode: 'timestamp' }).notNull(),
  contractEndDate: integer('contract_end_date', { mode: 'timestamp' }),
  contractDurationMonths: integer('contract_duration_months'),
  dueDateDay: integer('due_date_day').notNull(),
  indexType: text('index_type').default('none'), // igpm, ipca, fixed, none
  indexRate: real('index_rate'), // % ao ano se fixed
  guaranteeType: text('guarantee_type').default('none'), // caution, surety, deposit, none
  status: text('status').notNull().default('active'), // active, ended
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rentalFees = sqliteTable('rental_fees', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  feeType: text('fee_type').notNull(), // condominio, iptu, lixo, agua, luz, etc
  amount: real('amount').notNull(),
  validFromMonth: integer('valid_from_month').notNull(),
  validFromYear: integer('valid_from_year').notNull(),
  validToMonth: integer('valid_to_month'), // null means currently active
  validToYear: integer('valid_to_year'),
  isVariable: integer('is_variable', { mode: 'boolean' }).notNull().default(false),
});

export const monthlyCharges = sqliteTable('monthly_charges', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  baseRent: real('base_rent').notNull(),
  totalFees: real('total_fees').notNull(),
  totalAmount: real('total_amount').notNull(),
  status: text('status').notNull().default('pending'), // pending, paid, late
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  chargeId: text('charge_id').references(() => monthlyCharges.id),
  amount: real('amount').notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }).notNull(),
  paymentMethod: text('payment_method').default('transfer'), // transfer, pix, cash, check, other
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rentalNotes = sqliteTable('rental_notes', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
