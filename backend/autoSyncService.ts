import { db } from './database';
import { playwrightAutomation } from '../automation/playwrightRunner';
import { mercadoPagoService } from './mercadoPagoService';
import { emailService } from './emailService';

class AutoSyncService {
  private timer: NodeJS.Timeout | null = null;
  private paymentTimer: NodeJS.Timeout | null = null;
  private emailTimer: NodeJS.Timeout | null = null;
  private keepAliveTimer: NodeJS.Timeout | null = null;
  private isRunningSync: boolean = false;
  private isCheckingPayments: boolean = false;
  private isCheckingEmails: boolean = false;
  private isRunningKeepAlive: boolean = false;
  private sentNotificationsToday: Set<string> = new Set();
  private lastNotificationDay: string = '';

  public start() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.paymentTimer) {
      clearInterval(this.paymentTimer);
    }
    if (this.emailTimer) {
      clearInterval(this.emailTimer);
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
    }

    console.log('[AUTO-SYNC] Serviço de sincronização, anti-inatividade e notificações automáticas iniciado.');

    // Verificar periodicamente a cada 30 segundos se chegou o momento de sincronizar usuários do painel
    this.timer = setInterval(() => {
      this.checkAndSync();
    }, 30 * 1000);

    // Keep-Alive periódico anti-inatividade (F5 suave e auto-login) a cada 45 segundos
    this.keepAliveTimer = setInterval(() => {
      this.checkAndKeepAlive();
    }, 45 * 1000);

    // Verificar cobranças PIX pendentes a cada 15 segundos para auto-aprovação/renovação mesmo se cliente fechar a tela
    this.paymentTimer = setInterval(() => {
      this.checkPendingPayments();
    }, 15 * 1000);

    // Verificar e disparar notificações de vencimento por e-mail a cada 10 minutos
    this.emailTimer = setInterval(() => {
      this.checkAndSendExpirationEmails();
    }, 10 * 60 * 1000);

    // Executar verificações iniciais escalonadas após o boot do servidor para evitar concorrência
    setTimeout(async () => {
      try {
        await this.triggerImmediateKeepAlive('Inicialização do servidor');
        setTimeout(async () => {
          await this.triggerImmediateSync('Inicialização do servidor');
        }, 8000);
      } catch {
        // ignore
      }
      this.checkPendingPayments();
      this.checkAndSendExpirationEmails();
    }, 15 * 1000);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.paymentTimer) {
      clearInterval(this.paymentTimer);
      this.paymentTimer = null;
    }
    if (this.emailTimer) {
      clearInterval(this.emailTimer);
      this.emailTimer = null;
    }
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /**
   * Varre periodicamente clientes com e-mail e verifica vencimento em 7 dias, 3 dias ou Hoje (0 dias).
   * Envia os lembretes por e-mail com as credenciais e o link para pagamento/renovação no portal.
   */
  public async checkAndSendExpirationEmails(): Promise<{ checked: number; sent: number }> {
    if (this.isCheckingEmails) return { checked: 0, sent: 0 };
    this.isCheckingEmails = true;

    let checked = 0;
    let sent = 0;

    try {
      const config = db.getConfig();
      const todayStr = new Date().toISOString().split('T')[0];

      // Reset do cache de envios diários ao virar o dia
      if (this.lastNotificationDay !== todayStr) {
        this.sentNotificationsToday.clear();
        this.lastNotificationDay = todayStr;
      }

      const customers = db.getCustomers();

      for (const customer of customers) {
        if (!customer.email || !customer.email.includes('@')) continue;
        if (customer.status === 'DELETED' || customer.status === 'SUSPENDED') continue;

        checked++;
        const accesses = customer.accesses && customer.accesses.length > 0
          ? customer.accesses
          : [
              {
                id: `acc-${customer.id}`,
                customerId: customer.id,
                name: 'Ponto Principal',
                iptvUsername: customer.iptvUsername,
                iptvPassword: customer.iptvPassword || customer.portalPassword || '',
                iptvUrl: customer.iptvUrl,
                expirationDate: customer.expirationDate,
                status: customer.status as any,
                createdAt: customer.createdAt,
                updatedAt: customer.updatedAt,
              },
            ];

        for (const access of accesses) {
          if (!access.expirationDate || access.status === 'DELETED') continue;

          const daysRemaining = db.calculateDaysRemaining(access.expirationDate);

          // 1. Notificação de 7 Dias Antes
          if (daysRemaining === 7 && config.emailNotify7Days !== false) {
            const key = `${customer.id}_${access.id}_7DAYS_${todayStr}`;
            if (!this.sentNotificationsToday.has(key)) {
              this.sentNotificationsToday.add(key);
              const res = await emailService.sendExpirationReminderEmail(customer, access, '7_DAYS');
              if (res.success) {
                db.recordEmailNotification(customer.id, '7_DAYS');
                sent++;
              }
            }
          }

          // 2. Notificação de 3 Dias Antes
          if (daysRemaining === 3 && config.emailNotify3Days !== false) {
            const key = `${customer.id}_${access.id}_3DAYS_${todayStr}`;
            if (!this.sentNotificationsToday.has(key)) {
              this.sentNotificationsToday.add(key);
              const res = await emailService.sendExpirationReminderEmail(customer, access, '3_DAYS');
              if (res.success) {
                db.recordEmailNotification(customer.id, '3_DAYS');
                sent++;
              }
            }
          }

          // 3. Notificação no Dia do Vencimento (Hoje / 0 Dias)
          if (daysRemaining === 0 && config.emailNotify0Days !== false) {
            const key = `${customer.id}_${access.id}_0DAYS_${todayStr}`;
            if (!this.sentNotificationsToday.has(key)) {
              this.sentNotificationsToday.add(key);
              const res = await emailService.sendExpirationReminderEmail(customer, access, '0_DAYS');
              if (res.success) {
                db.recordEmailNotification(customer.id, '0_DAYS');
                sent++;
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('[AUTO-SYNC EMAIL ERROR]', err);
    } finally {
      this.isCheckingEmails = false;
    }

    return { checked, sent };
  }

  /**
   * Varre periodicamente cobranças com status PENDING criadas nas últimas 2 horas
   * e consulta o status na API do Mercado Pago.
   * Se o cliente pagou e saiu da tela, o sistema renova e aprova automaticamente!
   */
  private async checkPendingPayments() {
    if (this.isCheckingPayments) return;
    this.isCheckingPayments = true;
    try {
      const pendingList = db.getPendingPayments();
      if (pendingList.length === 0) return;

      const now = Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      for (const p of pendingList) {
        const createdTime = p.createdAt ? new Date(p.createdAt).getTime() : 0;
        // Não checar pagamentos muito antigos (mais de 2 horas)
        if (now - createdTime > twoHoursMs) continue;

        if (p.mercadoPagoPaymentId) {
          try {
            await mercadoPagoService.checkPaymentStatus(p.id);
          } catch {
            // Silencioso
          }
        }
      }
    } catch {
      // Silencioso
    } finally {
      this.isCheckingPayments = false;
    }
  }

  public async triggerImmediateSync(reason: string = 'Disparo manual'): Promise<{ success: boolean; message: string }> {
    if (this.isRunningSync) {
      return { success: false, message: 'Uma sincronização já está em andamento.' };
    }

    try {
      this.isRunningSync = true;
      db.addLog('INFO', `[AUTO-SYNC] Iniciando sincronização com o painel IPTV (${reason})...`);

      const result = await playwrightAutomation.syncPanelUsers((msg, level) => {
        // Apenas logs relevantes
        if (level === 'ERROR' || level === 'WARN') {
          db.addLog(level, msg);
        }
      });

      const now = new Date().toISOString();
      const statusText = `Sucesso: ${result.found} encontrados (${result.created} novos, ${result.updated} atualizados)`;

      db.updateConfig({
        lastAutoSyncAt: now,
        lastAutoSyncResult: statusText,
      });

      db.addLog(
        'SUCCESS',
        `[AUTO-SYNC] Painel IPTV sincronizado automaticamente: ${result.found} usuários verificados (${result.created} novos, ${result.updated} atualizados).`
      );

      return { success: true, message: statusText };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      const statusText = `Falha: ${errMsg}`;

      db.updateConfig({
        lastAutoSyncAt: now,
        lastAutoSyncResult: statusText,
      });

      db.addLog('WARN', `[AUTO-SYNC] Aviso na sincronização automática do painel: ${errMsg}`);
      return { success: false, message: statusText };
    } finally {
      this.isRunningSync = false;
    }
  }

  /**
   * Dispara imediatamente a rotina de Anti-Inatividade / F5 e Auto-Login no painel IPTV
   */
  public async triggerImmediateKeepAlive(reason: string = 'Disparo manual'): Promise<{
    success: boolean;
    message: string;
    autoLoggedIn: boolean;
  }> {
    if (this.isRunningKeepAlive) {
      return { success: false, message: 'Uma verificação de sessão já está em andamento.', autoLoggedIn: false };
    }

    try {
      this.isRunningKeepAlive = true;
      const result = await playwrightAutomation.keepAliveAndVerifySession((msg, level) => {
        if (level === 'ERROR' || level === 'WARN') {
          db.addLog(level, msg);
        }
      });

      const now = new Date().toISOString();
      const statusText = result.autoLoggedIn
        ? `Auto-Login realizado com sucesso: ${result.message}`
        : result.success
        ? `Sessão ativa e mantida com Vault: ${result.message}`
        : `Aviso na sessão: ${result.message}`;

      db.updateConfig({
        lastIptvKeepAliveAt: now,
        lastIptvKeepAliveResult: statusText,
      });

      return {
        success: result.success,
        message: statusText,
        autoLoggedIn: result.autoLoggedIn,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const now = new Date().toISOString();
      const statusText = `Falha no Keep-Alive: ${errMsg}`;

      db.updateConfig({
        lastIptvKeepAliveAt: now,
        lastIptvKeepAliveResult: statusText,
      });

      return { success: false, message: statusText, autoLoggedIn: false };
    } finally {
      this.isRunningKeepAlive = false;
    }
  }

  private async checkAndKeepAlive() {
    const config = db.getConfig();

    // Se anti-inatividade estiver desabilitado explicitamente
    if (config.iptvAutoKeepAlive === false) {
      return;
    }

    // Intervalo de Keep-Alive (padrão: 3 minutos)
    const intervalMinutes = Math.max(1, config.iptvKeepAliveIntervalMinutes || 3);
    const intervalMs = intervalMinutes * 60 * 1000;

    const lastKeepAliveTime = config.lastIptvKeepAliveAt ? new Date(config.lastIptvKeepAliveAt).getTime() : 0;
    const now = Date.now();

    if (now - lastKeepAliveTime >= intervalMs) {
      await this.triggerImmediateKeepAlive(`Anti-Inatividade (${intervalMinutes} min)`);
    }
  }

  private async checkAndSync() {
    const config = db.getConfig();

    // Se estiver explicitamente desabilitado
    if (config.autoSyncEnabled === false) {
      return;
    }

    // Intervalo em minutos (padrão: 5 minutos)
    const intervalMinutes = Math.max(1, config.autoSyncIntervalMinutes || 5);
    const intervalMs = intervalMinutes * 60 * 1000;

    const lastSyncTime = config.lastAutoSyncAt ? new Date(config.lastAutoSyncAt).getTime() : 0;
    const now = Date.now();

    // Checar se já decorreu o tempo do intervalo
    if (now - lastSyncTime >= intervalMs) {
      await this.triggerImmediateSync(`Intervalo de ${intervalMinutes} min`);
    }
  }
}

export const autoSyncService = new AutoSyncService();
