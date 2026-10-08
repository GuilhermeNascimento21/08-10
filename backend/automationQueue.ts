import { db } from './database';
import { playwrightAutomation } from '../automation/playwrightRunner';
import { emailService } from './emailService';
import { AutomationJob, IptvAccess } from '../src/types';

class AutomationQueueManager {
  private isProcessing: boolean = false;
  private queue: string[] = []; // Job IDs
  private listeners: ((job: AutomationJob) => void)[] = [];

  constructor() {
    // Check queue periodically
    setInterval(() => {
      this.processNext();
    }, 2000);
  }

  public addJob(jobData: {
    customerId: string;
    customerName: string;
    iptvAccessId?: string;
    accessName?: string;
    iptvUsername: string;
    renewalOrderId?: string;
    paymentId?: string;
    planId?: string;
    days?: number;
    action?: 'RENEW_30' | 'SYNC_ALL' | 'VERIFY_USER' | 'GENERATE_TEST' | 'DELETE_IPTV_USER';
  }): AutomationJob {
    const customer = db.getCustomerById(jobData.customerId);
    const plan = jobData.planId ? db.getPlanById(jobData.planId) : null;
    const days = jobData.days || (plan ? plan.days : 30);
    const action = jobData.action || 'RENEW_30';

    const job = db.createAutomationJob({
      customerId: jobData.customerId,
      customerName: jobData.customerName || (customer ? customer.name : 'Cliente'),
      iptvAccessId: jobData.iptvAccessId,
      accessName: jobData.accessName,
      iptvUsername: jobData.iptvUsername || (customer ? customer.iptvUsername : ''),
      renewalOrderId: jobData.renewalOrderId,
      paymentId: jobData.paymentId,
      planId: jobData.planId,
      action,
      days,
      status: 'WAITING',
      attempts: 0,
      maxAttempts: 3,
    });

    if (action === 'DELETE_IPTV_USER') {
      db.addLog(
        'INFO',
        `[FILA] Nova tarefa #${job.id.slice(-6)}: EXCLUSÃO de usuário IPTV ${job.iptvUsername} (${job.customerName} - ${job.accessName || 'Ponto'})`,
        job.id
      );
    } else {
      db.addLog(
        'INFO',
        `[FILA] Nova tarefa #${job.id.slice(-6)} enfileirada: Renovação para ${job.customerName} (${job.accessName ? job.accessName + ' - ' : ''}${job.iptvUsername}) - ${days} dias`,
        job.id
      );
    }

    this.queue.push(job.id);
    this.notifyListeners(job);
    this.processNext();

    return job;
  }

  public retryJob(jobId: string): AutomationJob | null {
    const job = db.getAutomationJobs().find((j) => j.id === jobId);
    if (!job) return null;

    const updatedJob = db.updateAutomationJob(jobId, {
      status: 'WAITING',
      errorMessage: undefined,
      startedAt: undefined,
      finishedAt: undefined,
    });

    if (updatedJob) {
      this.queue.push(jobId);
      this.notifyListeners(updatedJob);
      this.processNext();
      return updatedJob;
    }
    return null;
  }

  public onJobUpdate(listener: (job: AutomationJob) => void) {
    this.listeners.push(listener);
  }

  private notifyListeners(job: AutomationJob) {
    for (const listener of this.listeners) {
      try {
        listener(job);
      } catch {
        // ignore
      }
    }
  }

  public async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    const jobId = this.queue.shift();
    if (!jobId) return;

    const job = db.getAutomationJobs().find((j) => j.id === jobId);
    if (!job || job.status !== 'WAITING') return;

    this.isProcessing = true;

    // Update job to PROCESSING
    const startedJob = db.updateAutomationJob(job.id, {
      status: 'PROCESSING',
      startedAt: new Date().toISOString(),
      attempts: job.attempts + 1,
    });

    if (startedJob) this.notifyListeners(startedJob);

    // If associated with a payment or renewal order, update status to RENEWING / processing
    if (job.paymentId) {
      db.updatePayment(job.paymentId, {
        status: 'RENEWING',
        renewalStatus: 'processing',
        renewalStartedAt: new Date().toISOString(),
      });
    }

    db.addLog(
      'INFO',
      `[FILA] Iniciando processamento do Job #${job.id.slice(-6)} (Tentativa ${job.attempts + 1}/${job.maxAttempts}) - Usuário: ${job.iptvUsername}`,
      job.id
    );

    if (job.action === 'DELETE_IPTV_USER') {
      // EXCLUSÃO REAL DE USUÁRIO IPTV
      if (job.iptvAccessId) {
        db.updateAccess(job.iptvAccessId, { status: 'DELETING' });
      }

      const currentCust = db.getCustomerById(job.customerId);
      const isWholeCustomerDeletion =
        currentCust?.status === 'DELETING' ||
        currentCust?.status === 'DELETE_PENDING' ||
        currentCust?.deletionStatus === 'DELETING' ||
        currentCust?.deletionStatus === 'DELETE_PENDING';

      if (isWholeCustomerDeletion) {
        db.updateCustomer(job.customerId, { status: 'DELETING', deletionStatus: 'DELETING' });
      }

      db.addLog(
        'INFO',
        `[DELETE] Iniciando exclusão de usuário IPTV ${job.iptvUsername} (Cliente: ${job.customerName})`,
        job.id
      );

      try {
        const deleteResult = await playwrightAutomation.deleteUser(job.iptvUsername, (msg, level) => {
          db.addLog(level || 'INFO', msg, job.id);
        });

        if (deleteResult.success) {
          // Remover permanentemente o acesso IPTV local do banco de dados
          if (job.iptvAccessId) {
            db.deleteAccess(job.iptvAccessId);
          } else {
            const access = db.getAccessByUsername(job.iptvUsername);
            if (access) {
              db.deleteAccess(access.id);
            }
          }

          // Verificar todos os acessos restantes do cliente
          const customerAccesses = db.getAccesses(job.customerId);
          const remainingAccesses = customerAccesses.filter((a) => a.status !== 'DELETED' && a.id !== job.iptvAccessId);
          const hasFailed = customerAccesses.some((a) => a.status === 'DELETE_FAILED');
          const remainingJobs = db.getAutomationJobs().filter(
            (j) =>
              j.customerId === job.customerId &&
              j.action === 'DELETE_IPTV_USER' &&
              (j.status === 'WAITING' || j.status === 'PROCESSING') &&
              j.id !== job.id
          );

          if (isWholeCustomerDeletion) {
            if (remainingAccesses.length === 0 && remainingJobs.length === 0) {
              // Todos os acessos deste cliente foram excluídos com sucesso do painel!
              db.updateCustomer(job.customerId, {
                status: 'DELETED',
                deletedAt: new Date().toISOString(),
                deletedBy: 'ADMIN',
                deletionStatus: 'DELETED',
                deletionSummary: 'Todos os acessos IPTV foram excluídos com sucesso do painel.',
              });

              db.addLog(
                'SUCCESS',
                `[DELETE] ✅ Cliente ${job.customerName} e todos os seus acessos foram excluídos com sucesso do painel IPTV e do banco de dados local!`,
                job.id
              );
            } else if (hasFailed && remainingJobs.length === 0) {
              db.updateCustomer(job.customerId, {
                status: 'DELETE_PARTIAL_FAILURE',
                deletionStatus: 'DELETE_PARTIAL_FAILURE',
                deletionSummary: 'Exclusão parcial: restam acessos não excluídos ou com falha.',
              });
            }
          } else {
            // Exclusão de ponto/acesso individual concluída com sucesso:
            // Restaura o status ativo normal do cliente baseado nos acessos restantes
            const cust = db.getCustomerById(job.customerId);
            if (cust) {
              const activeAcc = remainingAccesses.find((a) => a.status === 'ACTIVE' || a.status === 'EXPIRING');
              const targetExp = activeAcc?.expirationDate || cust.expirationDate;
              const newStatus = targetExp ? db.calculateCustomerStatus(targetExp) : 'ACTIVE';
              db.updateCustomer(job.customerId, {
                status: newStatus,
                deletionStatus: undefined,
                deletionSummary: undefined,
              });
            }
          }

          // Concluir Job com Sucesso
          const successJob = db.updateAutomationJob(job.id, {
            status: 'SUCCESS',
            finishedAt: new Date().toISOString(),
          });
          if (successJob) this.notifyListeners(successJob);

          db.addLog(
            'SUCCESS',
            `[DELETE] Job #${job.id.slice(-6)}: Usuário ${job.iptvUsername} excluído do painel IPTV com sucesso.`,
            job.id
          );
        } else {
          throw new Error(deleteResult.error || 'Falha na exclusão do painel IPTV');
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        db.addLog('ERROR', `[DELETE ERROR] Falha no Job #${job.id.slice(-6)}: ${errMsg}`, job.id);

        if (job.iptvAccessId) {
          db.updateAccess(job.iptvAccessId, {
            status: 'DELETE_FAILED',
            deletionError: errMsg,
          });
        }

        if (isWholeCustomerDeletion) {
          db.updateCustomer(job.customerId, {
            status: 'DELETE_PARTIAL_FAILURE',
            deletionStatus: 'DELETE_PARTIAL_FAILURE',
            deletionSummary: `Falha ao excluir usuário ${job.iptvUsername}: ${errMsg}`,
          });
        } else {
          const cust = db.getCustomerById(job.customerId);
          if (cust && (cust.status === 'DELETING' || cust.status === 'DELETE_PENDING')) {
            db.updateCustomer(job.customerId, {
              status: db.calculateCustomerStatus(cust.expirationDate),
              deletionStatus: undefined,
            });
          }
        }

        const failedJob = db.updateAutomationJob(job.id, {
          status: 'FAILED',
          errorMessage: errMsg,
          finishedAt: new Date().toISOString(),
        });
        if (failedJob) this.notifyListeners(failedJob);
      } finally {
        this.isProcessing = false;
        this.processNext();
      }
      return;
    }

    try {
      // Execute via Playwright Automation for this specific iptvUsername
      const result = await playwrightAutomation.renewUser(
        job.iptvUsername,
        job.days,
        (msg, level) => {
          db.addLog(level || 'INFO', msg, job.id);
        }
      );

      if (result.success) {
        // Update specific IPTV Access in database
        if (job.iptvAccessId) {
          db.updateAccess(job.iptvAccessId, {
            expirationDate: result.afterDate,
            status: 'ACTIVE',
          });
        } else {
          // Fallback locate by username
          const access = db.getAccessByUsername(job.iptvUsername);
          if (access) {
            db.updateAccess(access.id, {
              expirationDate: result.afterDate,
              status: 'ACTIVE',
            });
          }
        }

        // Update customer expiration date in DB
        const customer = db.getCustomerById(job.customerId);
        if (customer) {
          db.updateCustomer(customer.id, {
            expirationDate: result.afterDate,
            status: 'ACTIVE',
          });
        }

        // Finish Job
        const successJob = db.updateAutomationJob(job.id, {
          status: 'SUCCESS',
          finishedAt: new Date().toISOString(),
        });
        if (successJob) this.notifyListeners(successJob);

        // Update RenewalOrder & Payment to RENEWED
        if (job.renewalOrderId) {
          db.updateRenewalOrder(job.renewalOrderId, {
            status: 'RENEWED',
            processedAt: new Date().toISOString(),
          });
        }

        if (job.paymentId) {
          db.updatePayment(job.paymentId, {
            status: 'RENEWED',
            renewalStatus: 'completed',
            renewalCompletedAt: new Date().toISOString(),
          });
        }

        db.addLog(
          'SUCCESS',
          `[FILA] Job #${job.id.slice(-6)} CONCLUÍDO COM SUCESSO! Nova data registrada para ${job.iptvUsername}: ${result.afterDate}`,
          job.id
        );

        // Notificar cliente por e-mail sobre a renovação concluída
        if (customer && customer.email && customer.email.includes('@')) {
          const paymentRecord = job.paymentId ? db.getPaymentById(job.paymentId) : null;
          const planRecord = job.planId ? db.getPlanById(job.planId) : null;
          const accessObj = (job.iptvAccessId ? db.getAccessById(job.iptvAccessId) : null) || {
            id: job.iptvAccessId || `acc-${customer.id}`,
            customerId: customer.id,
            customerName: customer.name,
            name: job.accessName || 'Ponto Principal',
            iptvUsername: job.iptvUsername,
            iptvPassword: customer.iptvPassword || customer.portalPassword || '',
            iptvUrl: customer.iptvUrl,
            expirationDate: result.afterDate,
            status: 'ACTIVE',
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
          };
          emailService.sendPaymentApprovedEmail(customer, accessObj as IptvAccess, {
            id: paymentRecord?.id || `ren-${job.id}`,
            customerId: customer.id,
            customerName: customer.name,
            iptvUsername: job.iptvUsername,
            planName: paymentRecord?.planName || planRecord?.name || 'Plano IPTV',
            amount: paymentRecord?.amount || customer.customPrice || 30.0,
            status: 'APPROVED',
            paymentMethod: 'PIX',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any).catch((e) => console.warn('[RENEWAL EMAIL NOTIFY ERROR]', e));
        }
      } else {
        throw new Error(result.error || 'Falha na verificação de vencimento pelo Playwright');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      db.addLog('ERROR', `[FILA] Falha ao executar Job #${job.id.slice(-6)}: ${errMsg}`, job.id);

      const failedJob = db.updateAutomationJob(job.id, {
        status: 'FAILED',
        errorMessage: errMsg,
        finishedAt: new Date().toISOString(),
      });
      if (failedJob) this.notifyListeners(failedJob);

      if (job.renewalOrderId) {
        db.updateRenewalOrder(job.renewalOrderId, {
          status: 'APPROVED', // O pedido foi pago; sincronização com painel pendente
        });
      }

      if (job.paymentId) {
        // O pagamento continua APROVADO pois o cliente efetuou o PIX!
        // Apenas sinalizamos que a sincronização no painel externo teve pendência
        db.updatePayment(job.paymentId, {
          status: 'APPROVED',
          renewalStatus: 'failed',
          renewalError: errMsg,
        });
      }
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  /**
   * Recupera jobs pendentes ou pagamentos aprovados não concluídos após reinício do servidor
   */
  public recoverPendingJobs() {
    const pendingJobs = db.getAutomationJobs().filter(
      (j) => j.status === 'WAITING' || j.status === 'PROCESSING'
    );

    for (const job of pendingJobs) {
      if (!this.queue.includes(job.id)) {
        this.queue.push(job.id);
      }
    }

    // Verificar pagamentos aprovados que ficaram com renewalStatus = waiting ou processing
    const approvedPayments = db.getPayments().filter(
      (p) => p.status === 'APPROVED' && (p.renewalStatus === 'waiting' || p.renewalStatus === 'processing')
    );

    for (const payment of approvedPayments) {
      const existingJob = db.getAutomationJobs().find(
        (j) => j.paymentId === payment.id && j.status !== 'FAILED'
      );
      if (!existingJob) {
        const customer = db.getCustomerById(payment.customerId);
        const plan = db.getPlanById(payment.planId);
        const days = plan ? plan.days : 30;
        const job = this.addJob({
          customerId: payment.customerId,
          customerName: payment.customerName || customer?.name || 'Cliente',
          iptvAccessId: payment.iptvAccessId,
          accessName: payment.accessName,
          iptvUsername: payment.iptvUsername || customer?.iptvUsername || '',
          paymentId: payment.id,
          planId: payment.planId,
          days,
          action: 'RENEW_30',
        });
        console.log(`[QUEUE RECOVERY] Pagamento aprovado recuperado: #${payment.id} -> Job #${job.id}`);
      }
    }

    if (this.queue.length > 0) {
      console.log(`[QUEUE RECOVERY] ${this.queue.length} job(s) em fila de processamento.`);
      this.processNext();
    }
  }
}

export const automationQueue = new AutomationQueueManager();
