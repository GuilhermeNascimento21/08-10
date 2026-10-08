import {
  Customer,
  Plan,
  Payment,
  AutomationJob,
  AutomationLog,
  SystemConfig,
  DashboardStats,
  SyncResult,
  AutomationDiagnostic,
  IptvAccess,
  IptvTestResult,
  RenewalOrder,
} from '../types';

const API_BASE = '/api';

function getClientToken(): string | null {
  return localStorage.getItem('iptv_client_token');
}

function getAdminToken(): string | null {
  return localStorage.getItem('iptv_admin_token');
}

export const api = {
  // Auth
  async login(emailOrUser: string, role?: 'ADMIN' | 'CUSTOMER', password?: string) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailOrUser, role, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha no login');
    }
    const data = await res.json();
    if (data.token) {
      if (role === 'ADMIN') {
        localStorage.setItem('iptv_admin_token', data.token);
      } else {
        localStorage.setItem('iptv_client_token', data.token);
      }
    }
    return data;
  },

  async adminLogin(email: string, password?: string) {
    return this.login(email, 'ADMIN', password);
  },

  async clientLogin(identifier: string, password?: string): Promise<{ success: boolean; token: string; customer: Customer }> {
    const res = await fetch(`${API_BASE}/auth/client-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Falha na autenticação do cliente');
    }
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('iptv_client_token', data.token);
    }
    return data;
  },

  // ==========================================
  // CLIENT PORTAL (ISOLATED & AUTHENTICATED)
  // ==========================================

  async getClientMe(): Promise<Customer> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/me`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao carregar dados do cliente');
    }
    return res.json();
  },

  async getClientDashboard(): Promise<{
    customer: Customer;
    summary: {
      totalAccesses: number;
      activeAccesses: number;
      expiringAccesses: number;
      expiredAccesses: number;
      nextExpiration: string;
      minDaysRemaining: number;
    };
    accesses: IptvAccess[];
  }> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/dashboard`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao carregar dashboard do cliente');
    }
    return res.json();
  },

  async getClientAccesses(): Promise<IptvAccess[]> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/accesses`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao listar acessos do cliente');
    }
    return res.json();
  },

  async getClientAccess(id: string): Promise<IptvAccess> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/accesses/${id}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Acesso não encontrado');
    }
    return res.json();
  },

  async createClientPixPayment(planId: string, iptvAccessId: string): Promise<{ payment: Payment; order: RenewalOrder }> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/payments/create-pix`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ planId, iptvAccessId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar pagamento PIX');
    }
    return res.json();
  },

  async activateClientMac(iptvUsername: string, macAddress: string): Promise<{ success: boolean; message: string }> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/activate-mac`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ iptvUsername, macAddress }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao ativar MAC da TV');
    }
    return res.json();
  },

  async getClientPayments(): Promise<Payment[]> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/payments`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao carregar histórico financeiro');
    }
    return res.json();
  },

  async getClientPaymentStatus(paymentId: string): Promise<Payment> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/payments/${paymentId}/status?_t=${Date.now()}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    if (!res.ok) {
      // Fallback to general payment status endpoint
      const fallbackRes = await fetch(`${API_BASE}/payments/${paymentId}/status?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (!fallbackRes.ok) {
        throw new Error('Erro ao consultar status do pagamento');
      }
      return fallbackRes.json();
    }
    return res.json();
  },

  async getClientPendingPayment(accessId?: string): Promise<Payment | null> {
    const token = getClientToken();
    const query = accessId ? `?accessId=${encodeURIComponent(accessId)}&_t=${Date.now()}` : `?_t=${Date.now()}`;
    const res = await fetch(`${API_BASE}/client/payments/pending${query}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.payment || null;
  },

  async cancelClientPayment(paymentId: string): Promise<boolean> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/payments/${paymentId}/cancel`, {
      method: 'POST',
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    return res.ok;
  },

  async requestClientTrial(): Promise<{ success: boolean; access: IptvAccess; message: string }> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/trial`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao solicitar teste gratuito');
    }
    return res.json();
  },

  async clientRegisterTrial(data: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }): Promise<{
    success: boolean;
    token: string;
    customer: Customer;
    access: IptvAccess;
    message: string;
    emailSent: boolean;
  }> {
    const res = await fetch(`${API_BASE}/auth/client-register-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao realizar cadastro de teste');
    }
    const result = await res.json();
    if (result.token) {
      localStorage.setItem('iptv_client_token', result.token);
    }
    return result;
  },

  async clientChangePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar senha');
    }
    return res.json();
  },

  async clientUpdateProfile(data: { name?: string; phone?: string; email?: string }): Promise<Customer> {
    const token = getClientToken();
    const res = await fetch(`${API_BASE}/client/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar perfil');
    }
    return res.json();
  },

  // ==========================================
  // ADMIN DASHBOARD & GENERAL CRUD
  // ==========================================

  async getDashboard(): Promise<DashboardStats> {
    const res = await fetch(`${API_BASE}/dashboard`);
    if (!res.ok) throw new Error('Erro ao carregar dados da dashboard');
    return res.json();
  },

  async getDashboardStats(): Promise<DashboardStats> {
    return this.getDashboard();
  },

  // Customers
  async getCustomers(includeDeleted = false): Promise<Customer[]> {
    const res = await fetch(`${API_BASE}/customers${includeDeleted ? '?includeDeleted=true' : ''}`);
    if (!res.ok) throw new Error('Erro ao listar clientes');
    return res.json();
  },

  async getCustomer(id: string): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers/${id}`);
    if (!res.ok) throw new Error('Cliente não encontrado');
    return res.json();
  },

  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao criar cliente');
    }
    return res.json();
  },

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    const res = await fetch(`${API_BASE}/customers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao atualizar cliente');
    return res.json();
  },

  async deleteCustomer(id: string, force = false): Promise<{ success: boolean; message: string; jobs?: AutomationJob[] }> {
    const res = await fetch(`${API_BASE}/customers/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir cliente');
    }
    return res.json();
  },

  async retryCustomerDeletion(id: string): Promise<{ success: boolean; message: string; jobs?: AutomationJob[] }> {
    const res = await fetch(`${API_BASE}/customers/${id}/retry-deletion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao retentar exclusão');
    }
    return res.json();
  },

  async renewCustomerManual(id: string, days: number = 30): Promise<{ success: boolean; job: AutomationJob }> {
    const res = await fetch(`${API_BASE}/customers/${id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) throw new Error('Erro ao disparar renovação manual');
    return res.json();
  },

  // IPTV Accesses (Admin)
  async getAccesses(customerId?: string): Promise<IptvAccess[]> {
    const url = customerId ? `${API_BASE}/accesses?customerId=${customerId}` : `${API_BASE}/accesses`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao listar acessos IPTV');
    return res.json();
  },

  async getAccess(id: string): Promise<IptvAccess> {
    const res = await fetch(`${API_BASE}/accesses/${id}`);
    if (!res.ok) throw new Error('Acesso IPTV não encontrado');
    return res.json();
  },

  async createAccess(data: Partial<IptvAccess>): Promise<IptvAccess> {
    const res = await fetch(`${API_BASE}/accesses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao cadastrar acesso IPTV');
    }
    return res.json();
  },

  async updateAccess(id: string, data: Partial<IptvAccess>): Promise<IptvAccess> {
    const res = await fetch(`${API_BASE}/accesses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao atualizar acesso IPTV');
    return res.json();
  },

  async deleteAccess(id: string, force = false): Promise<{ success: boolean; message: string; job?: AutomationJob }> {
    const res = await fetch(`${API_BASE}/accesses/${id}${force ? '?force=true' : ''}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir acesso IPTV');
    }
    return res.json();
  },

  async renewAccessManual(id: string, days: number = 30): Promise<{ success: boolean; job: AutomationJob }> {
    const res = await fetch(`${API_BASE}/accesses/${id}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    if (!res.ok) throw new Error('Erro ao renovar acesso IPTV');
    return res.json();
  },

  // Plans
  async getPlans(): Promise<Plan[]> {
    const res = await fetch(`${API_BASE}/plans`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao listar planos');
    }
    return res.json();
  },

  async createPlan(data: Partial<Plan>): Promise<Plan> {
    const res = await fetch(`${API_BASE}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao criar plano');
    }
    return res.json();
  },

  async updatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
    const res = await fetch(`${API_BASE}/plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao atualizar plano');
    }
    return res.json();
  },

  async deletePlan(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/plans/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Erro ao excluir plano');
    }
  },

  // Payments (Admin)
  async getPayments(customerId?: string): Promise<Payment[]> {
    const url = customerId ? `${API_BASE}/payments?customerId=${customerId}` : `${API_BASE}/payments`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao listar pagamentos');
    return res.json();
  },

  async getPayment(id: string): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments/${id}`);
    if (!res.ok) throw new Error('Pagamento não encontrado');
    return res.json();
  },

  async getPaymentStatus(id: string): Promise<Payment> {
    return this.getPayment(id);
  },

  async deletePayment(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/payments/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao excluir pagamento');
    }
  },

  async createPixPayment(customerId: string, planId: string, iptvAccessId?: string): Promise<Payment> {
    const res = await fetch(`${API_BASE}/payments/create-pix`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, planId, iptvAccessId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar PIX');
    }
    return res.json();
  },

  async simulatePaymentApproval(paymentId: string): Promise<{ processed: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/payments/${paymentId}/simulate-approval`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Erro ao simular aprovação do pagamento');
    return res.json();
  },

  // Automation
  async getAutomationStatus() {
    const res = await fetch(`${API_BASE}/automation/status`);
    if (!res.ok) throw new Error('Erro ao buscar status da automação');
    return res.json();
  },

  async getAutomationDiagnostic(): Promise<AutomationDiagnostic> {
    const res = await fetch(`${API_BASE}/automation/diagnostic`);
    if (!res.ok) throw new Error('Erro ao obter diagnóstico do Playwright');
    return res.json();
  },

  async connectAutomation() {
    const res = await fetch(`${API_BASE}/automation/connect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao conectar Playwright');
    }
    return res.json();
  },

  async disconnectAutomation() {
    const res = await fetch(`${API_BASE}/automation/disconnect`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Erro ao desconectar automação');
    }
    return res.json();
  },

  async syncIptv(): Promise<SyncResult> {
    const res = await fetch(`${API_BASE}/automation/sync`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Erro ao sincronizar painel IPTV');
    }
    return res.json();
  },

  async keepAliveNow(): Promise<{ success: boolean; message: string; autoLoggedIn: boolean }> {
    const res = await fetch(`${API_BASE}/automation/keep-alive-now`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Erro ao renovar sessão do painel');
    }
    return res.json();
  },

  async autoLoginNow(): Promise<{ success: boolean; message: string; autoLoggedIn: boolean }> {
    const res = await fetch(`${API_BASE}/automation/auto-login-now`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Erro ao executar auto-login');
    }
    return res.json();
  },

  async getVaultStatus(): Promise<{
    exists: boolean;
    savedAt?: string;
    hasAuthToken: boolean;
    userId?: string;
    username?: string;
    cookieCount: number;
    storageKeyCount: number;
  }> {
    const res = await fetch(`${API_BASE}/automation/vault-status`);
    if (!res.ok) throw new Error('Erro ao buscar status do vault');
    return res.json();
  },

  async saveVaultNow(): Promise<{ success: boolean; message: string; status: any }> {
    const res = await fetch(`${API_BASE}/automation/save-vault`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || 'Erro ao salvar vault de sessão');
    }
    return res.json();
  },

  async generateIptvTest(note?: string): Promise<IptvTestResult> {
    const res = await fetch(`${API_BASE}/automation/generate-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar teste IPTV');
    }
    return res.json();
  },

  async getAutomationJobs(): Promise<AutomationJob[]> {
    const res = await fetch(`${API_BASE}/automation/jobs`);
    if (!res.ok) throw new Error('Erro ao buscar fila de jobs');
    return res.json();
  },

  async retryJob(jobId: string): Promise<{ success: boolean; job: AutomationJob }> {
    const res = await fetch(`${API_BASE}/automation/jobs/${jobId}/retry`, { method: 'POST' });
    if (!res.ok) throw new Error('Erro ao retentar job');
    return res.json();
  },

  async getAutomationLogs(limit: number = 100): Promise<AutomationLog[]> {
    const res = await fetch(`${API_BASE}/automation/logs?limit=${limit}`);
    if (!res.ok) throw new Error('Erro ao carregar logs');
    return res.json();
  },

  async openWhatsAppWeb(): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/whatsapp/open`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao abrir WhatsApp Web');
    }
    return res.json();
  },

  // Config / Settings
  async getConfig(): Promise<SystemConfig> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error('Erro ao obter configurações');
    return res.json();
  },

  async updateConfig(data: Partial<SystemConfig>): Promise<SystemConfig> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Erro ao salvar configurações');
    return res.json();
  },

  async getSettings(): Promise<SystemConfig> {
    return this.getConfig();
  },

  async updateSettings(data: Partial<SystemConfig>): Promise<SystemConfig> {
    return this.updateConfig(data);
  },

  async testSmtp(email: string, configOverride?: Partial<SystemConfig>): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/admin/test-smtp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, configOverride }),
    });
    return res.json();
  },

  async triggerExpirationEmails(): Promise<{ success: boolean; message: string; result?: { checked: number; sent: number } }> {
    const res = await fetch(`${API_BASE}/admin/trigger-expiration-emails`, {
      method: 'POST',
    });
    return res.json();
  },

  async checkPortDiagnostic(port = 80): Promise<{
    success: boolean;
    currentServerPort: number;
    diagnostic: {
      port: number;
      available: boolean;
      canBind: boolean;
      occupantProcess?: string;
      isPrivilegedPort: boolean;
      isRootOrAdmin: boolean;
      error?: string;
      recommendations: string[];
    };
  }> {
    const res = await fetch(`${API_BASE}/admin/diagnostic/port?port=${port}`);
    if (!res.ok) throw new Error('Falha ao executar diagnóstico de porta');
    return res.json();
  },
};
