import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  Customer,
  IptvAccess,
  Plan,
  Payment,
  RenewalOrder,
  AutomationJob,
  AutomationLog,
  CustomerStatus,
  IptvAccessStatus,
  User,
  SyncResult,
} from '../src/types';
import { RealTestGenerationResult, ExtractedIptvUser } from '../automation/playwrightRunner';

export interface DatabaseConfig {
  iptvPanelUrl: string;
  iptvProfileDir: string;
  mercadoPagoAccessToken: string;
  mercadoPagoPublicKey: string;
  mercadoPagoWebhookSecret: string;
  whatsappTemplate: string;
  autoRenewalEnabled: boolean;
  renewalDaysBefore: number;
  serverUrl: string;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  defaultServerHost: string;
  defaultDnsHost: string;
  shortenedHlsUrl: string;
  shortenedMpegtsUrl: string;
  shortenedSsiptvUrl: string;
  webPlayerUrl: string;
  clientPortalUrl: string;
  primeIptvCode: string;
  funPlayCode: string;
  downloaderPinPixel: string;
  downloaderPinXciptv: string;
  ntdownPinXciptv: string;
  xciptvApkUrl: string;
  pixelPlayerUrl: string;
  epgUrl: string;
  lastAutoSyncAt: string;
  lastAutoSyncResult: string;
  keepAliveIntervalMinutes?: number;
  autoLoginEnabled?: boolean;
  iptvAutoLoginEnabled?: boolean;
  iptvAutoKeepAlive?: boolean;
  iptvKeepAliveIntervalMinutes?: number;
  lastIptvKeepAliveAt?: string;
  iptvPanelUsername?: string;
  iptvPanelPassword?: string;
  lastKeepAliveAt?: string;
  lastKeepAliveResult?: string;
  emailNotify7Days?: boolean;
  emailNotify3Days?: boolean;
  emailNotify0Days?: boolean;
  [key: string]: any;
}

interface DatabaseSchema {
  users: User[];
  customers: Customer[];
  iptvAccesses: IptvAccess[];
  plans: Plan[];
  subscriptions?: any[];
  payments: Payment[];
  renewalOrders: RenewalOrder[];
  automationJobs: AutomationJob[];
  automationLogs: AutomationLog[];
  processedWebhookIds: string[];
  config: DatabaseConfig;
}

class JsonDatabase {
  private filePath: string;
  private data: DatabaseSchema;

  constructor() {
    this.filePath = path.join(process.cwd(), 'backend', 'data', 'database.json');
    const fileExists = fs.existsSync(this.filePath);
    this.data = this.load();
    if (!fileExists || !fs.existsSync(this.filePath)) {
      this.save();
    }
  }

  private load(): DatabaseSchema {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        if (raw && raw.trim().length > 0) {
          return JSON.parse(raw);
        }
      }
    } catch (err) {
      console.error('[DATABASE] Erro ao carregar database.json (arquivo corrompido ou incompleto):', err);
      // Fazer backup do arquivo corrompido para análise
      try {
        if (fs.existsSync(this.filePath)) {
          fs.copyFileSync(this.filePath, this.filePath + '.corrupt.bak');
        }
      } catch {}
    }

    return {
      users: [
        {
          id: 'usr-admin-1',
          name: 'Administrador Master',
          email: 'admin@painel.com',
          role: 'ADMIN',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      customers: [],
      iptvAccesses: [],
      plans: [
        {
          id: 'plan-mensal',
          name: 'Mensal',
          price: 35.0,
          days: 30,
          active: true,
          displayOrder: 1,
          description: 'Acesso completo com canais, filmes e séries em HD/FHD.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      payments: [],
      renewalOrders: [],
      automationJobs: [],
      automationLogs: [],
      processedWebhookIds: [],
      config: {
        iptvPanelUrl: 'https://searchdefense.top/#/users-iptv',
        iptvProfileDir: './backend/data/iptv-browser-profile',
        mercadoPagoAccessToken: '',
        mercadoPagoPublicKey: '',
        mercadoPagoWebhookSecret: '',
        whatsappTemplate:
          'Olá {{nome}}! Seu plano de TV vence em {{vencimento}} ({{dias}} dias restantes). Renove com desconto via PIX no seu portal: {{link}}',
        autoRenewalEnabled: true,
        renewalDaysBefore: 3,
        serverUrl: 'http://localhost:80',
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 5,
        defaultServerHost: 'http://anverif.top',
        defaultDnsHost: 'http://blushes.top',
        shortenedHlsUrl: 'https://tinyurl.com/2b952wvh',
        shortenedMpegtsUrl: 'https://tinyurl.com/2yug8eoe',
        shortenedSsiptvUrl: 'https://tinyurl.com/22z2a9bn',
        webPlayerUrl: 'http://navegauni.top/',
        clientPortalUrl: 'https://portaltop.net',
        primeIptvCode: 'aiqohye8',
        funPlayCode: 'asutk',
        downloaderPinPixel: '5413559',
        downloaderPinXciptv: '595381',
        ntdownPinXciptv: '84254',
        xciptvApkUrl: 'https://5664.in/7gtyap4a',
        pixelPlayerUrl: 'https://tinyurl.com/pixel-player-app-android',
        epgUrl: 'https://tinyurl.com/uniepg',
        lastAutoSyncAt: new Date().toISOString(),
        lastAutoSyncResult: 'Pronto para uso',
      },
    };
  }

  public save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tempPath = this.filePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempPath, this.filePath);
    } catch (err) {
      console.error('[DATABASE] Erro ao salvar database.json (escrita atômica):', err);
    }
  }

  // Helper date parsing (Supports DD/MM/YYYY HH:mm:ss and ISO)
  public parseDate(dateStr: string): Date | null {
    if (!dateStr) return null;
    if (dateStr.includes('/')) {
      const [datePart, timePart = '00:00:00'] = dateStr.trim().split(/\s+/);
      const [d, m, y] = datePart.split('/').map(Number);
      const [h = 0, min = 0, s = 0] = timePart.split(':').map(Number);
      return new Date(y, m - 1, d, h, min, s);
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  }

  public calculateDaysRemaining(expirationDate: string): number {
    const d = this.parseDate(expirationDate);
    if (!d) return 0;
    const diff = d.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  public calculateCustomerStatus(expirationDate: string): CustomerStatus {
    const days = this.calculateDaysRemaining(expirationDate);
    if (days < 0) return 'EXPIRED';
    if (days <= 3) return 'EXPIRING';
    return 'ACTIVE';
  }

  // --- Customers ---
  public getCustomers(): Customer[] {
    return (this.data.customers || [])
      .filter((c) => c.status !== 'DELETED')
      .map((c) => ({
        ...c,
        accesses: this.getAccesses(c.id),
      }));
  }

  public getCustomerById(id: string): Customer | null {
    const c = (this.data.customers || []).find((cust) => cust.id === id);
    if (!c) return null;
    return {
      ...c,
      accesses: this.getAccesses(c.id),
    };
  }

  public getCustomerByEmailOrPhone(identifier: string): Customer | null {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const cleanDigits = identifier.replace(/\D/g, '');

    const c = (this.data.customers || []).find((cust) => {
      if (cust.status === 'DELETED') return false;
      if (cust.email && cust.email.toLowerCase() === clean) return true;
      if (cust.iptvUsername && cust.iptvUsername.toLowerCase() === clean) return true;
      if (cleanDigits && cust.phone && cust.phone.replace(/\D/g, '') === cleanDigits) return true;
      return false;
    });

    if (!c) return null;
    return {
      ...c,
      accesses: this.getAccesses(c.id),
    };
  }

  public createCustomer(data: Partial<Customer>): Customer {
    const id = data.id || `cust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const customer: Customer = {
      id,
      name: data.name || 'Novo Cliente',
      phone: data.phone || '',
      email: data.email || '',
      iptvUsername: data.iptvUsername || '',
      iptvPassword: data.iptvPassword || '',
      portalPassword: data.portalPassword || data.iptvPassword || '',
      iptvUrl: data.iptvUrl || this.data.config?.defaultServerHost || 'http://anverif.top',
      planId: data.planId || 'plan-mensal',
      customPrice: data.customPrice,
      status: data.status || 'ACTIVE',
      expirationDate: data.expirationDate || '',
      trialUsed: data.trialUsed || false,
      trialCreatedAt: data.trialCreatedAt,
      trialAccessId: data.trialAccessId,
      notes: data.notes || '',
      createdAt: data.createdAt || now,
      updatedAt: now,
    };

    if (!this.data.customers) this.data.customers = [];
    this.data.customers.push(customer);
    this.save();
    return { ...customer, accesses: [] };
  }

  public updateCustomer(id: string, data: Partial<Customer>): Customer {
    const idx = (this.data.customers || []).findIndex((c) => c.id === id);
    if (idx === -1) throw new Error(`Cliente ${id} não encontrado`);

    const existing = this.data.customers[idx];
    const updated: Customer = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.data.customers[idx] = updated;
    this.save();
    return { ...updated, accesses: this.getAccesses(id) };
  }

  public softDeleteCustomer(id: string): boolean {
    const idx = (this.data.customers || []).findIndex((c) => c.id === id);
    if (idx === -1) return false;
    this.data.customers[idx].status = 'DELETED';
    this.data.customers[idx].deletedAt = new Date().toISOString();
    this.save();
    return true;
  }

  public initiateCustomerDeletion(id: string) {
    this.updateCustomer(id, {
      status: 'DELETE_PENDING',
      deletionStatus: 'DELETE_PENDING',
    });
  }

  // --- IPTV Accesses ---
  public getAccesses(customerId?: string): IptvAccess[] {
    const list = (this.data.iptvAccesses || []).filter((a) => a.status !== 'DELETED');
    if (customerId) {
      return list.filter((a) => a.customerId === customerId);
    }
    return list;
  }

  public getAccessById(id: string): IptvAccess | null {
    return (this.data.iptvAccesses || []).find((a) => a.id === id) || null;
  }

  public getAccessByIdAndCustomer(id: string, customerId: string): IptvAccess | null {
    return (
      (this.data.iptvAccesses || []).find((a) => a.id === id && a.customerId === customerId) || null
    );
  }

  public getAccessByUsername(username: string): IptvAccess | null {
    return (
      (this.data.iptvAccesses || []).find(
        (a) => a.iptvUsername === username && a.status !== 'DELETED'
      ) || null
    );
  }

  public createAccess(data: Partial<IptvAccess>): IptvAccess {
    const id = data.id || `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const access: IptvAccess = {
      id,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      name: data.name || 'Ponto IPTV',
      iptvUsername: data.iptvUsername || '',
      iptvPassword: data.iptvPassword || '',
      iptvUrl: data.iptvUrl || this.data.config?.defaultServerHost || 'http://anverif.top',
      planId: data.planId,
      planName: data.planName,
      planPrice: data.planPrice,
      customPrice: data.customPrice,
      status: data.status || 'ACTIVE',
      expirationDate: data.expirationDate || '',
      daysRemaining: data.expirationDate ? this.calculateDaysRemaining(data.expirationDate) : undefined,
      isTrial: data.isTrial || false,
      notes: data.notes || '',
      createdAt: data.createdAt || now,
      updatedAt: now,
    };

    if (!this.data.iptvAccesses) this.data.iptvAccesses = [];
    this.data.iptvAccesses.push(access);
    this.save();
    return access;
  }

  public updateAccess(id: string, data: Partial<IptvAccess>): IptvAccess {
    const idx = (this.data.iptvAccesses || []).findIndex((a) => a.id === id);
    if (idx === -1) throw new Error(`Acesso ${id} não encontrado`);

    const existing = this.data.iptvAccesses[idx];
    const updated: IptvAccess = {
      ...existing,
      ...data,
      daysRemaining: data.expirationDate
        ? this.calculateDaysRemaining(data.expirationDate)
        : existing.expirationDate
        ? this.calculateDaysRemaining(existing.expirationDate)
        : undefined,
      updatedAt: new Date().toISOString(),
    };

    this.data.iptvAccesses[idx] = updated;
    this.save();
    return updated;
  }

  public deleteAccess(id: string): boolean {
    const idx = (this.data.iptvAccesses || []).findIndex((a) => a.id === id);
    if (idx === -1) return false;
    this.data.iptvAccesses.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Sync with Extracted Users from Panel ---
  public syncWithExtractedUsers(extractedUsers: ExtractedIptvUser[]): SyncResult {
    let created = 0;
    let updated = 0;

    for (const u of extractedUsers) {
      if (!u.iptvUsername) continue;

      const existingAccess = this.getAccessByUsername(u.iptvUsername);
      const calculatedStatus = this.calculateCustomerStatus(u.expirationDate);

      if (existingAccess) {
        this.updateAccess(existingAccess.id, {
          expirationDate: u.expirationDate,
          status: calculatedStatus as IptvAccessStatus,
          iptvPassword: u.password || existingAccess.iptvPassword,
          notes: u.notes || existingAccess.notes,
        });

        const cust = this.getCustomerById(existingAccess.customerId);
        if (cust) {
          this.updateCustomer(cust.id, {
            expirationDate: u.expirationDate,
            status: calculatedStatus,
            iptvPassword: u.password || cust.iptvPassword,
          });
        }
        updated++;
      } else {
        const custName = u.notes?.trim() || u.iptvUsername;
        const newCustomer = this.createCustomer({
          name: custName,
          iptvUsername: u.iptvUsername,
          iptvPassword: u.password || '',
          portalPassword: u.password || '',
          expirationDate: u.expirationDate,
          status: calculatedStatus,
          notes: u.notes || '',
        });

        this.createAccess({
          customerId: newCustomer.id,
          customerName: newCustomer.name,
          name: 'Ponto IPTV',
          iptvUsername: u.iptvUsername,
          iptvPassword: u.password || '',
          expirationDate: u.expirationDate,
          status: calculatedStatus as IptvAccessStatus,
          notes: u.notes || '',
        });
        created++;
      }
    }

    return {
      success: true,
      found: extractedUsers.length,
      created,
      updated,
      errors: [],
      totalFound: extractedUsers.length,
      updatedCount: updated,
      importedCount: created,
      errorCount: 0,
      timestamp: new Date().toISOString(),
    };
  }

  // --- Real Client Trial Creation ---
  public createRealClientTrial(
    customerId: string,
    realResult: RealTestGenerationResult
  ): { access: IptvAccess; message: string } {
    const customer = this.getCustomerById(customerId);
    if (!customer) throw new Error('Cliente não encontrado');

    const now = new Date().toISOString();
    const expiry = realResult.expirationDate || '1 Hora';

    this.updateCustomer(customerId, {
      iptvUsername: realResult.username,
      iptvPassword: realResult.password,
      expirationDate: expiry,
      status: 'TEST',
      trialUsed: true,
      trialCreatedAt: now,
    });

    let access = this.getAccesses(customerId).find((a) => a.isTrial);
    if (access) {
      access = this.updateAccess(access.id, {
        iptvUsername: realResult.username,
        iptvPassword: realResult.password,
        expirationDate: expiry,
        status: 'TEST',
        notes: `Teste Real IPTV criado em ${new Date().toLocaleString('pt-BR')}`,
      });
    } else {
      access = this.createAccess({
        customerId,
        customerName: customer.name,
        name: 'TV Principal (Teste 1H)',
        iptvUsername: realResult.username,
        iptvPassword: realResult.password,
        iptvUrl: this.data.config?.defaultServerHost || 'http://anverif.top',
        status: 'TEST',
        expirationDate: expiry,
        isTrial: true,
        notes: `Teste Real IPTV gerado no painel`,
      });
    }

    this.updateCustomer(customerId, { trialAccessId: access.id });

    return {
      access,
      message: `Teste de 1 hora criado no painel IPTV com sucesso! Usuário: ${realResult.username}`,
    };
  }

  // Fallback Quick Test for Admin
  public generateQuickTest(note?: string) {
    const testUser = Math.floor(100000000 + Math.random() * 900000000).toString();
    const testPass = Math.random().toString(36).substring(2, 10).toUpperCase();
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toLocaleTimeString('pt-BR');

    return {
      username: testUser,
      password: testPass,
      expiration: `${expiry} (1 Hora)`,
      dns: this.data.config?.defaultServerHost || 'http://anverif.top',
    };
  }

  // Register Customer With Trial (Used for Public Client Sign Up)
  public registerCustomerWithTrial(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): { customer: Customer; access: IptvAccess } {
    let customer = this.getCustomerByEmailOrPhone(data.email) || this.getCustomerByEmailOrPhone(data.phone);

    if (customer) {
      customer = this.updateCustomer(customer.id, {
        name: data.name,
        portalPassword: data.password,
      });
    } else {
      customer = this.createCustomer({
        name: data.name,
        email: data.email,
        phone: data.phone,
        portalPassword: data.password,
        status: 'TEST',
      });
    }

    let access = this.getAccesses(customer.id)[0];
    if (!access) {
      access = this.createAccess({
        customerId: customer.id,
        customerName: customer.name,
        name: 'TV Principal (Teste)',
        iptvUsername: customer.iptvUsername || Math.floor(100000000 + Math.random() * 900000000).toString(),
        iptvPassword: customer.iptvPassword || Math.random().toString(36).slice(2, 8),
        iptvUrl: this.data.config?.defaultServerHost || 'http://anverif.top',
        status: 'TEST',
        expirationDate: '1 Hora',
        isTrial: true,
      });
    }

    return { customer, access };
  }

  // --- Plans ---
  public getPlans(): Plan[] {
    return this.data.plans || [];
  }

  public getPlanById(id: string): Plan | null {
    return (this.data.plans || []).find((p) => p.id === id) || null;
  }

  public createPlan(data: Partial<Plan>): Plan {
    const id = data.id || `plan-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    const plan: Plan = {
      id,
      name: data.name || 'Novo Plano',
      price: data.price || 35,
      days: data.days || 30,
      active: data.active !== undefined ? data.active : true,
      displayOrder: data.displayOrder || 1,
      description: data.description || '',
      createdAt: now,
      updatedAt: now,
    };

    if (!this.data.plans) this.data.plans = [];
    this.data.plans.push(plan);
    this.save();
    return plan;
  }

  public updatePlan(id: string, data: Partial<Plan>): Plan {
    const idx = (this.data.plans || []).findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Plano ${id} não encontrado`);

    const existing = this.data.plans[idx];
    const updated: Plan = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.data.plans[idx] = updated;
    this.save();
    return updated;
  }

  public deletePlan(id: string): boolean {
    const idx = (this.data.plans || []).findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.plans.splice(idx, 1);
    this.save();
    return true;
  }

  // --- Payments ---
  public getPayments(customerId?: string): Payment[] {
    const list = this.data.payments || [];
    if (customerId) {
      return list.filter((p) => p.customerId === customerId);
    }
    return list;
  }

  public getPaymentById(id: string): Payment | null {
    return (this.data.payments || []).find((p) => p.id === id) || null;
  }

  public getPendingPayments(): Payment[] {
    return (this.data.payments || []).filter(
      (p) => p.status === 'PENDING' || p.status === 'PROCESSING' || p.status === 'RENEWING'
    );
  }

  public getActivePendingPayment(customerId: string, accessId?: string): Payment | null {
    return (
      (this.data.payments || []).find(
        (p) =>
          p.customerId === customerId &&
          (p.status === 'PENDING' || p.status === 'PROCESSING' || p.status === 'RENEWING') &&
          (!accessId || p.iptvAccessId === accessId)
      ) || null
    );
  }

  public createPayment(data: Partial<Payment>): Payment {
    const id = data.id || `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const payment: Payment = {
      id,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      iptvAccessId: data.iptvAccessId,
      accessName: data.accessName,
      iptvUsername: data.iptvUsername,
      planId: data.planId || '',
      planName: data.planName || '',
      amount: data.amount || 0,
      status: data.status || 'PENDING',
      paymentMethod: data.paymentMethod || 'PIX',
      renewalOrderId: data.renewalOrderId,
      mercadoPagoPaymentId: data.mercadoPagoPaymentId,
      externalReference: data.externalReference,
      idempotencyKey: data.idempotencyKey,
      pixQrCode: data.pixQrCode,
      pixQrCodeBase64: data.pixQrCodeBase64,
      pixCopyPaste: data.pixCopyPaste,
      ticketUrl: data.ticketUrl,
      renewalStatus: data.renewalStatus,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.data.payments) this.data.payments = [];
    this.data.payments.push(payment);
    this.save();
    return payment;
  }

  public updatePayment(id: string, data: Partial<Payment>): Payment {
    const idx = (this.data.payments || []).findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Pagamento ${id} não encontrado`);

    const existing = this.data.payments[idx];
    const updated: Payment = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    };

    this.data.payments[idx] = updated;
    this.save();
    return updated;
  }

  public deletePayment(id: string, deletedBy?: string): boolean {
    const idx = (this.data.payments || []).findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.payments.splice(idx, 1);
    this.save();
    return true;
  }

  public applyPaymentApproval(
    paymentId: string,
    confirmedAmount?: number
  ): { success: boolean; customer: Customer; access?: IptvAccess; message: string } {
    const payment = this.getPaymentById(paymentId);
    if (!payment) throw new Error(`Pagamento ${paymentId} não encontrado`);

    const customer = this.getCustomerById(payment.customerId);
    if (!customer) throw new Error(`Cliente do pagamento não encontrado`);

    const now = new Date().toISOString();
    this.updatePayment(paymentId, {
      status: 'APPROVED',
      amount: confirmedAmount || payment.amount,
      updatedAt: now,
    });

    const targetAccess = payment.iptvAccessId
      ? this.getAccessById(payment.iptvAccessId)
      : this.getAccesses(customer.id)[0];

    return {
      success: true,
      customer,
      access: targetAccess || undefined,
      message: `Pagamento #${paymentId.slice(-6)} aprovado.`,
    };
  }

  // --- Renewal Orders ---
  public getRenewalOrders(): RenewalOrder[] {
    return this.data.renewalOrders || [];
  }

  public getRenewalOrderById(id: string): RenewalOrder | null {
    return (this.data.renewalOrders || []).find((o) => o.id === id) || null;
  }

  public getRenewalOrderByExternalReference(ref: string): RenewalOrder | null {
    return (this.data.renewalOrders || []).find((o) => o.externalReference === ref) || null;
  }

  public createRenewalOrder(data: Partial<RenewalOrder>): RenewalOrder {
    const id = data.id || `ord-${Date.now().toString(36)}`;
    const now = new Date().toISOString();
    const order: RenewalOrder = {
      id,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      iptvAccessId: data.iptvAccessId || '',
      accessName: data.accessName,
      iptvUsername: data.iptvUsername || '',
      planId: data.planId || '',
      planName: data.planName || '',
      amount: data.amount || 0,
      status: data.status || 'PENDING',
      externalReference: data.externalReference || id,
      mercadoPagoPaymentId: data.mercadoPagoPaymentId,
      paymentId: data.paymentId,
      automationJobId: data.automationJobId,
      processedAt: data.processedAt,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.data.renewalOrders) this.data.renewalOrders = [];
    this.data.renewalOrders.push(order);
    this.save();
    return order;
  }

  public updateRenewalOrder(id: string, data: Partial<RenewalOrder>): RenewalOrder {
    const idx = (this.data.renewalOrders || []).findIndex((o) => o.id === id);
    if (idx === -1) throw new Error(`Pedido ${id} não encontrado`);

    const updated = {
      ...this.data.renewalOrders[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.data.renewalOrders[idx] = updated;
    this.save();
    return updated;
  }

  // --- Webhooks Tracking ---
  public isWebhookProcessed(id: string): boolean {
    return (this.data.processedWebhookIds || []).includes(id);
  }

  public markWebhookProcessed(id: string): void {
    if (!this.data.processedWebhookIds) this.data.processedWebhookIds = [];
    if (!this.data.processedWebhookIds.includes(id)) {
      this.data.processedWebhookIds.push(id);
      this.save();
    }
  }

  // --- Automation Jobs ---
  public getAutomationJobs(): AutomationJob[] {
    return this.data.automationJobs || [];
  }

  public createAutomationJob(data: Partial<AutomationJob>): AutomationJob {
    const id = data.id || `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    const job: AutomationJob = {
      id,
      customerId: data.customerId || '',
      customerName: data.customerName || '',
      iptvAccessId: data.iptvAccessId,
      accessName: data.accessName,
      iptvUsername: data.iptvUsername || '',
      renewalOrderId: data.renewalOrderId,
      paymentId: data.paymentId,
      planId: data.planId,
      action: data.action || 'RENEW_30',
      days: data.days || 30,
      status: data.status || 'WAITING',
      attempts: data.attempts || 0,
      maxAttempts: data.maxAttempts || 3,
      errorMessage: data.errorMessage,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.data.automationJobs) this.data.automationJobs = [];
    this.data.automationJobs.unshift(job);
    this.save();
    return job;
  }

  public updateAutomationJob(id: string, data: Partial<AutomationJob>): AutomationJob {
    const idx = (this.data.automationJobs || []).findIndex((j) => j.id === id);
    if (idx === -1) throw new Error(`Job ${id} não encontrado`);

    const updated = {
      ...this.data.automationJobs[idx],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    this.data.automationJobs[idx] = updated;
    this.save();
    return updated;
  }

  // --- Automation Logs ---
  public getAutomationLogs(limit: number = 100): AutomationLog[] {
    return (this.data.automationLogs || []).slice(0, limit);
  }

  public addLog(level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR', message: string, jobId?: string): void {
    const log: AutomationLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      jobId,
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    if (!this.data.automationLogs) this.data.automationLogs = [];
    this.data.automationLogs.unshift(log);

    // Manter no máximo 500 logs em memória/arquivo
    if (this.data.automationLogs.length > 500) {
      this.data.automationLogs = this.data.automationLogs.slice(0, 500);
    }

    this.save();
  }

  // --- Config ---
  public getConfig(): DatabaseConfig {
    return this.data.config;
  }

  public updateConfig(data: Partial<DatabaseConfig>): DatabaseConfig {
    this.data.config = {
      ...this.data.config,
      ...data,
    };
    this.save();
    return this.data.config;
  }

  // --- Client Dashboard Data ---
  public getClientDashboardData(customerId: string) {
    const customer = this.getCustomerById(customerId);
    if (!customer) throw new Error('Cliente não encontrado');

    const accesses = this.getAccesses(customerId);
    const payments = this.getPayments(customerId);
    const plans = this.getPlans().filter((p) => p.active);

    return {
      customer,
      accesses,
      payments,
      plans,
    };
  }

  // --- Admin Dashboard Stats ---
  public getDashboardStats() {
    const customers = this.getCustomers();
    const accesses = this.getAccesses();
    const payments = this.getPayments();

    const active = customers.filter((c) => c.status === 'ACTIVE').length;
    const expiring = customers.filter((c) => c.status === 'EXPIRING').length;
    const expired = customers.filter((c) => c.status === 'EXPIRED').length;
    const tests = customers.filter((c) => c.status === 'TEST').length;

    const monthlyRevenue = payments
      .filter((p) => p.status === 'APPROVED' || p.status === 'RENEWED')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      totalCustomers: customers.length,
      activeCustomers: active,
      expiringCustomers: expiring,
      expiredCustomers: expired,
      trialCustomers: tests,
      totalAccesses: accesses.length,
      monthlyRevenue,
    };
  }

  public recordEmailNotification(customerId: string, type: string) {
    this.updateCustomer(customerId, {
      lastEmailNotificationDate: new Date().toISOString(),
      lastEmailNotificationType: type,
    });
  }
}

export const db = new JsonDatabase();
