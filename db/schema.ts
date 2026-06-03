import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  agencyName: text('agency_name'), // Nome da imobiliária
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Proprietários (donos dos imóveis) - clientes da imobiliária
export const owners = sqliteTable('owners', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  document: text('document'), // CPF/CNPJ
  email: text('email'),
  phone: text('phone'),
  bankName: text('bank_name'),
  bankAgency: text('bank_agency'),
  bankAccount: text('bank_account'),
  bankPixKey: text('bank_pix_key'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  ownerId: text('owner_id').references(() => owners.id), // Proprietário do imóvel
  address: text('address').notNull(),
  buildingName: text('building_name'),
  propertyType: text('property_type').default('apartment'), // apartment, house, commercial, land
  area: real('area'),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const rentals = sqliteTable('rentals', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id),
  tenantName: text('tenant_name').notNull(),
  tenantDocument: text('tenant_document'),
  tenantEmail: text('tenant_email'),
  tenantPhone: text('tenant_phone'),
  baseRentAmount: real('base_rent_amount').notNull(),

  // Comissão da imobiliária
  commissionType: text('commission_type').notNull().default('percentage'), // percentage | fixed
  commissionRate: real('commission_rate').notNull().default(10), // % se percentage, R$ se fixed
  administrationFee: real('administration_fee').default(0), // Taxa de administração mensal adicional

  moveInDate: integer('move_in_date', { mode: 'timestamp' }).notNull(),
  contractEndDate: integer('contract_end_date', { mode: 'timestamp' }),
  contractDurationMonths: integer('contract_duration_months'),
  dueDateDay: integer('due_date_day').notNull(),
  ownerPaymentDay: integer('owner_payment_day').default(10), // Dia de repasse ao proprietário
  indexType: text('index_type').default('none'), // igpm, ipca, fixed, none
  indexRate: real('index_rate'),
  guaranteeType: text('guarantee_type').default('none'),
  status: text('status').notNull().default('active'), // active, ended
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rentalFees = sqliteTable('rental_fees', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  feeType: text('fee_type').notNull(), // condominio, iptu, lixo, agua, luz, etc
  amount: real('amount').notNull(),
  paidBy: text('paid_by').notNull().default('tenant'), // tenant | owner (quem paga essa taxa)
  validFromMonth: integer('valid_from_month').notNull(),
  validFromYear: integer('valid_from_year').notNull(),
  validToMonth: integer('valid_to_month'),
  validToYear: integer('valid_to_year'),
  isVariable: integer('is_variable', { mode: 'boolean' }).notNull().default(false),
});

export const monthlyCharges = sqliteTable('monthly_charges', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  month: integer('month').notNull(),
  year: integer('year').notNull(),

  // Valores brutos (recebidos do inquilino)
  baseRent: real('base_rent').notNull(),
  totalFees: real('total_fees').notNull(),
  grossAmount: real('gross_amount').notNull(), // Total cobrado do inquilino

  // Comissão da imobiliária
  commissionAmount: real('commission_amount').notNull(), // Receita da imob
  administrationFee: real('administration_fee').notNull().default(0),
  totalCommission: real('total_commission').notNull(), // commission + admin fee = lucro imob

  // Repasse ao proprietário
  ownerAmount: real('owner_amount').notNull(), // grossAmount - totalCommission

  status: text('status').notNull().default('pending'), // pending, paid, late
  ownerPaid: integer('owner_paid', { mode: 'boolean' }).default(false), // Repasse ao proprietário efetuado?
  dueDate: integer('due_date', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  chargeId: text('charge_id').references(() => monthlyCharges.id),
  amount: real('amount').notNull(),
  paidAt: integer('paid_at', { mode: 'timestamp' }).notNull(),
  paymentMethod: text('payment_method').default('transfer'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// Repasses ao proprietário
export const ownerRemittances = sqliteTable('owner_remittances', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => owners.id),
  chargeId: text('charge_id').references(() => monthlyCharges.id),
  amount: real('amount').notNull(),
  remittedAt: integer('remitted_at', { mode: 'timestamp' }).notNull(),
  paymentMethod: text('payment_method').default('pix'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const rentalNotes = sqliteTable('rental_notes', {
  id: text('id').primaryKey(),
  rentalId: text('rental_id').notNull().references(() => rentals.id),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
