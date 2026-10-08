export type UserRole = 'ADMIN' | 'CUSTOMER';

export type CustomerStatus =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'TEST'
  | 'SUSPENDED'
  | 'DELETE_PENDING'
  | 'DELETING'
  | 'DELETE_PARTIAL_FAILURE'
  | 'DELETED';

export type IptvAccessStatus =
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'BLOCKED'
  | 'TEST'
  | 'DELETE_PENDING'
  | 'DELETING'
  | 'DELETED'
  | 'DELETE_FAILED';

export type PaymentStatus = 
  | 'PENDING' 
  | 'APPROVED' 
  | 'REJECTED' 
  | 'CANCELLED' 
  | 'REFUNDED'
  | 'EXPIRED' 
  | 'PROCESSING' 
  | 'RENEWING' 
  | 'RENEWED' 
  | 'FAILED';

export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'MANUAL';

export type AutomationJobStatus = 'WAITING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type AutomationConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'ERROR';

export type LogLevel = 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface IptvAccess {
  id: string;
  customerId: string;
  customerName?: string;
  name: string; // Ex: "TV Sala", "TV Quarto", "Celular"
  iptvUsername: string;
  iptvPassword?: string;
  iptvUrl: string;
  planId?: string;
  planName?: string;
  planPrice?: number;
  customPrice?: number;
  status: IptvAccessStatus;
  expirationDate: string; // DD/MM/YYYY HH:mm:ss ou ISO
  daysRemaining?: number;
  isTrial?: boolean;
  notes?: string;
  deletedAt?: string;
  deletionError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  userId?: string;
  name: string;
  phone: string;
  email: string;
  iptvUsername: string;
  iptvPassword?: string;
  portalPassword?: string;
  iptvUrl: string;
  planId?: string;
  customPrice?: number; // Preço manual acordado
  status: CustomerStatus;
  expirationDate: string; // ISO String or DD/MM/YYYY HH:mm:ss
  trialUsed?: boolean;
  trialCreatedAt?: string;
  trialAccessId?: string;
  lastEmailNotificationDate?: string;
  lastEmailNotificationType?: string;
  notes?: string;
  accesses?: IptvAccess[];
  deletedAt?: string;
  deletedBy?: string;
  deletionStatus?: string;
  deletionSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number;
  days: number;
  active: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalOrder {
  id: string;
  customerId: string;
  customerName?: string;
  iptvAccessId: string;
  accessName?: string;
  iptvUsername: string;
  planId: string;
  planName?: string;
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'RENEWED' | 'FAILED' | 'CANCELLED';
  externalReference: string;
  mercadoPagoPaymentId?: string;
  paymentId?: string;
  automationJobId?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  iptvAccessId?: string;
  planId: string;
  startDate: string;
  expirationDate: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName?: string;
  iptvAccessId?: string;
  accessName?: string;
  iptvUsername?: string;
  planId: string;
  planName?: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  renewalOrderId?: string;
  automationJobId?: string;
  mercadoPagoPaymentId?: string;
  externalReference?: string;
  idempotencyKey?: string;
  pixQrCode?: string;
  pixQrCodeBase64?: string;
  pixCopyPaste?: string;
  ticketUrl?: string;
  renewalStatus?: 'waiting' | 'processing' | 'completed' | 'failed';
  renewalStartedAt?: string;
  renewalCompletedAt?: string;
  renewalError?: string;
  errorMessage?: string;
  approvedAt?: string;
  paidAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IptvTestResult {
  username: string;
  password: string;
  expirationDate: string;
  note?: string;
  hlsUrl: string;
  hlsShortUrl?: string;
  mpegtsUrl: string;
  mpegtsShortUrl?: string;
  ssiptvShortUrl?: string;
  webPlayerUrl?: string;
  clientPortalUrl?: string;
  dnsServer?: string;
  epgUrl?: string;
  formattedMessage: string;
  createdAt: string;
}

export interface AutomationJob {
  id: string;
  customerId: string;
  customerName: string;
  iptvAccessId?: string;
  accessName?: string;
  iptvUsername: string;
  paymentId?: string;
  renewalOrderId?: string;
  planId?: string;
  action: 'RENEW_30' | 'SYNC_ALL' | 'VERIFY_USER' | 'GENERATE_TEST' | 'DELETE_IPTV_USER';
  days: number;
  status: AutomationJobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationLog {
  id: string;
  jobId?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SystemConfig {
  iptvPanelUrl: string;
  iptvProfileDir: string;
  // Credenciais de Auto-Login e Anti-Inatividade do Painel IPTV
  iptvPanelUsername?: string;
  iptvPanelPassword?: string;
  iptvAutoLoginEnabled?: boolean;
  iptvAutoKeepAlive?: boolean;
  iptvKeepAliveIntervalMinutes?: number;
  lastIptvKeepAliveAt?: string;
  lastIptvKeepAliveResult?: string;
  mercadoPagoAccessToken: string;
  mercadoPagoPublicKey: string;
  mercadoPagoWebhookSecret: string;
  whatsappTemplate: string;
  autoRenewalEnabled: boolean;
  renewalDaysBefore: number;
  serverUrl: string;
  // Sincronização Automática com o Painel IPTV
  autoSyncEnabled?: boolean;
  autoSyncIntervalMinutes?: number;
  lastAutoSyncAt?: string;
  lastAutoSyncResult?: string;
  defaultServerHost?: string;
  defaultDnsHost?: string;
  shortenedHlsUrl?: string;
  shortenedMpegtsUrl?: string;
  shortenedSsiptvUrl?: string;
  webPlayerUrl?: string;
  clientPortalUrl?: string;
  primeIptvCode?: string;
  funPlayCode?: string;
  downloaderPinPixel?: string;
  downloaderPinXciptv?: string;
  ntdownPinXciptv?: string;
  xciptvApkUrl?: string;
  pixelPlayerUrl?: string;
  epgUrl?: string;
  // Configurações de E-mail (SMTP) & Notificações Automáticas
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpSecure?: boolean;
  smtpFrom?: string;
  smtpFromEmail?: string;
  smtpFromName?: string;
  emailNotifyWelcomeAccount?: boolean;
  emailNotifyTestCreated?: boolean;
  emailNotify7Days?: boolean;
  emailNotify3Days?: boolean;
  emailNotify0Days?: boolean;
  emailNotifyPaymentApproved?: boolean;
}

export interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  expiredCustomers: number;
  expiringSoonCustomers: number; // <= 7 days
  expiringTodayCustomers: number;
  monthRevenue: number;
  todayRevenue: number;
  pendingPaymentsCount: number;
  monthlyRevenueChart: { month: string; amount: number; count: number }[];
  customerStatusChart: { name: string; value: number; color: string }[];
  recentPayments: Payment[];
  recentCustomers: Customer[];
  upcomingExpirations: (Customer & { daysRemaining: number; planName: string })[];
}

export type IptvConnectionStatus =
  | 'CONECTADO'
  | 'AGUARDANDO_LOGIN'
  | 'CONECTANDO'
  | 'DESCONECTADO'
  | 'ERRO'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'CONNECTING'
  | 'WAITING_LOGIN';

export interface AutomationDiagnostic {
  browserRunning: boolean;
  contextReady: boolean;
  pageReady: boolean;
  pageClosed: boolean;
  currentUrl: string;
  title: string;
  usersFound: number;
  rowsFound: number;
  connectionStatus: IptvConnectionStatus;
  profileDirectory: string;
  lastError: string | null;
}

export interface SyncResult {
  success: boolean;
  found: number;
  created: number;
  updated: number;
  errors: string[];
  totalFound?: number;
  updatedCount?: number;
  importedCount?: number;
  errorCount?: number;
  timestamp: string;
  details?: string[];
}

