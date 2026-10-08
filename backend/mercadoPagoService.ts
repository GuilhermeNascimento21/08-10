import crypto from 'crypto';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { db } from './database';
import { automationQueue } from './automationQueue';
import { emailService } from './emailService';
import { calculatePlanPrice } from '../src/utils/pricing';
import {
  Payment as PaymentType,
  RenewalOrder,
  Customer,
  IptvAccess,
} from '../src/types';

type MercadoPagoPaymentResponse = {
  id?: number | string;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  date_approved?: string | null;
  date_created?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
  payer?: {
    email?: string;
  };
};

class MercadoPagoService {
  /**
   * Retorna o cliente oficial do Mercado Pago.
   *
   * A prioridade é:
   * 1. configuração salva no sistema
   * 2. variável de ambiente
   */
  private getClient(): {
    client: MercadoPagoConfig | null;
    token: string;
  } {
    const config = db.getConfig();

    const token =
      config.mercadoPagoAccessToken ||
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      '';

    if (!token.trim()) {
      return {
        client: null,
        token: '',
      };
    }

    return {
      client: new MercadoPagoConfig({
        accessToken: token.trim(),
        options: {
          timeout: 15000,
        },
      }),
      token: token.trim(),
    };
  }

  private getWebhookSecret(): string {
    const config = db.getConfig();

    return (
      config.mercadoPagoWebhookSecret ||
      process.env.MERCADO_PAGO_WEBHOOK_SECRET ||
      ''
    ).trim();
  }

  public logConfigStatus(): void {
    const { token } = this.getClient();

    if (!token) {
      console.warn(
        '[MERCADO PAGO] Access Token NÃO configurado. PIX real está desativado.'
      );
      return;
    }

    const isLive = token.startsWith('APP_USR');

    console.log(
      `[MERCADO PAGO] Configurado com sucesso (${isLive ? 'Produção' : 'Sandbox'}).`
    );

    if (!this.getWebhookSecret()) {
      console.warn(
        '[MERCADO PAGO] Webhook Secret não configurado. Configure-o antes de usar Webhooks em produção.'
      );
    }
  }

  /**
   * Gera um e-mail válido para o Mercado Pago.
   *
   * O sistema precisa enviar um e-mail do pagador.
   * Se o cadastro estiver sem e-mail válido, usamos um endereço
   * técnico exclusivo para não bloquear a criação da cobrança.
   */
  private getPayerEmail(customer: Customer): string {
    const email = String(customer.email || '').trim().toLowerCase();

    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return email;
    }

    const safeId = String(customer.id || 'cliente')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 50);

    return `cliente-${safeId}@pagamento.local`;
  }

  /**
   * Cria um PIX REAL no Mercado Pago.
   */
  public async createPixPayment(params: {
    customerId: string;
    iptvAccessId?: string;
    planId: string;
  }): Promise<{
    payment: PaymentType;
    order: RenewalOrder;
  }> {
    const customer = db.getCustomerById(params.customerId);

    if (!customer) {
      throw new Error('Cliente não encontrado.');
    }

    const plan = db.getPlanById(params.planId);

    if (!plan) {
      throw new Error('Plano não encontrado.');
    }

    const targetAccess = params.iptvAccessId
      ? db.getAccessById(params.iptvAccessId)
      : db.getAccesses(customer.id)[0];

    if (params.iptvAccessId && !targetAccess) {
      throw new Error('Ponto IPTV não encontrado.');
    }

    if (targetAccess && targetAccess.customerId !== customer.id) {
      throw new Error('O ponto IPTV não pertence a este cliente.');
    }

    const previousPending = db.getActivePendingPayment(
      customer.id,
      targetAccess?.id
    );

    if (previousPending) {
      db.updatePayment(previousPending.id, {
        status: 'CANCELLED',
        errorMessage: 'Cobrança substituída por uma nova cobrança PIX.',
      });

      if (previousPending.renewalOrderId) {
        db.updateRenewalOrder(previousPending.renewalOrderId, {
          status: 'CANCELLED',
        });
      }
    }

    const customMonthlyPrice =
      Number(targetAccess?.customPrice ?? customer.customPrice) || undefined;

    const amount = Number(
      calculatePlanPrice(plan, customMonthlyPrice).toFixed(2)
    );

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Valor do plano inválido para gerar o PIX.');
    }

    const externalRef = `renewal-${customer.id}-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')}`;

    const idempotencyKey = crypto.randomUUID();

    const payerEmail = this.getPayerEmail(customer);

    const { client } = this.getClient();

    if (!client) {
      throw new Error(
        'Mercado Pago não configurado. Informe o Access Token nas configurações do sistema.'
      );
    }

    /**
     * IMPORTANTE:
     * A cobrança é criada primeiro no Mercado Pago.
     *
     * Só depois que o Mercado Pago responder com sucesso
     * criamos o pagamento local.
     */
    const mercadoPago = new Payment(client);

    let mercadoPagoPayment: MercadoPagoPaymentResponse;

    try {
      mercadoPagoPayment = (await mercadoPago.create({
        body: {
          transaction_amount: amount,
          description: `Renovação ${plan.name} - ${customer.name}`,
          payment_method_id: 'pix',
          payer: {
            email: payerEmail,
          },
          external_reference: externalRef,
        },
        requestOptions: {
          idempotencyKey,
        },
      })) as unknown as MercadoPagoPaymentResponse;
    } catch (error: any) {
      console.error(
        '[MERCADO PAGO] Erro ao criar pagamento PIX:',
        error?.message || error
      );

      const apiMessage =
        error?.cause?.[0]?.description ||
        error?.cause?.[0]?.message ||
        error?.message ||
        'Não foi possível criar o pagamento PIX no Mercado Pago.';

      throw new Error(`Mercado Pago: ${apiMessage}`);
    }

    if (!mercadoPagoPayment?.id) {
      throw new Error(
        'Mercado Pago não retornou o ID do pagamento.'
      );
    }

    const transactionData =
      mercadoPagoPayment.point_of_interaction?.transaction_data;

    const pixCopyPaste = transactionData?.qr_code;
    const pixQrCodeBase64 = transactionData?.qr_code_base64;
    const ticketUrl = transactionData?.ticket_url;

    if (!pixCopyPaste || !pixQrCodeBase64) {
      console.error(
        '[MERCADO PAGO] Resposta sem dados PIX:',
        JSON.stringify(mercadoPagoPayment, null, 2)
      );

      throw new Error(
        'Mercado Pago criou o pagamento, mas não retornou o QR Code PIX.'
      );
    }

    const order = db.createRenewalOrder({
      customerId: customer.id,
      customerName: customer.name,
      iptvAccessId: targetAccess?.id || '',
      accessName: targetAccess?.name || 'Ponto Principal',
      iptvUsername:
        targetAccess?.iptvUsername || customer.iptvUsername,
      planId: plan.id,
      planName: plan.name,
      amount,
      status: 'PENDING',
      externalReference: externalRef,
      mercadoPagoPaymentId: String(mercadoPagoPayment.id),
    });

    const payment = db.createPayment({
      customerId: customer.id,
      customerName: customer.name,
      iptvAccessId: targetAccess?.id,
      accessName: targetAccess?.name,
      iptvUsername:
        targetAccess?.iptvUsername || customer.iptvUsername,
      planId: plan.id,
      planName: plan.name,
      amount,
      status: 'PENDING',
      paymentMethod: 'PIX',
      renewalOrderId: order.id,
      externalReference: externalRef,
      idempotencyKey,
      mercadoPagoPaymentId: String(mercadoPagoPayment.id),
      pixQrCode: pixCopyPaste,
      pixCopyPaste,
      pixQrCodeBase64,
      ticketUrl,
      renewalStatus: 'waiting',
    });

    db.updateRenewalOrder(order.id, {
      paymentId: payment.id,
    });

    db.addLog(
      'SUCCESS',
      `[PIX] Cobrança criada no Mercado Pago. Pagamento local #${payment.id.slice(
        -6
      )} / MP #${mercadoPagoPayment.id}`
    );

    return {
      payment,
      order: db.getRenewalOrderById(order.id) || order,
    };
  }

  /**
   * Consulta o pagamento REAL no Mercado Pago.
   */
  public async checkPaymentStatus(
    paymentId: string
  ): Promise<PaymentType> {
    const payment = db.getPaymentById(paymentId);

    if (!payment) {
      throw new Error('Pagamento não encontrado.');
    }

    /**
     * Se não houver ID do Mercado Pago, não podemos consultar
     * a API externa.
     */
    if (!payment.mercadoPagoPaymentId) {
      throw new Error(
        'Este pagamento não possui ID do Mercado Pago.'
      );
    }

    const { client } = this.getClient();

    if (!client) {
      throw new Error(
        'Mercado Pago não configurado.'
      );
    }

    const mercadoPago = new Payment(client);

    let mpPayment: MercadoPagoPaymentResponse;

    try {
      mpPayment = (await mercadoPago.get({
        id: String(payment.mercadoPagoPaymentId),
      })) as unknown as MercadoPagoPaymentResponse;
    } catch (error: any) {
      console.error(
        `[MERCADO PAGO] Erro ao consultar #${payment.mercadoPagoPaymentId}:`,
        error?.message || error
      );

      throw new Error(
        'Não foi possível consultar o status no Mercado Pago.'
      );
    }

    return this.syncMercadoPagoStatus(payment, mpPayment);
  }

  /**
   * Converte o status do Mercado Pago para o status interno.
   */
  private mapMercadoPagoStatus(
    status?: string
  ): PaymentType['status'] {
    switch (String(status || '').toLowerCase()) {
      case 'approved':
        return 'APPROVED';

      case 'rejected':
        return 'REJECTED';

      case 'cancelled':
        return 'CANCELLED';

      case 'refunded':
      case 'charged_back':
        return 'REFUNDED';

      case 'expired':
        return 'EXPIRED';

      case 'in_process':
      case 'in_mediation':
      case 'pending':
        return 'PENDING';

      default:
        return 'PROCESSING';
    }
  }

  /**
   * Sincroniza o pagamento local com a resposta do Mercado Pago.
   */
  private async syncMercadoPagoStatus(
    localPayment: PaymentType,
    mpPayment: MercadoPagoPaymentResponse
  ): Promise<PaymentType> {
    const newStatus = this.mapMercadoPagoStatus(mpPayment.status);

    const updates: Partial<PaymentType> = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };

    if (mpPayment.date_approved) {
      updates.approvedAt = mpPayment.date_approved;
      updates.paidAt = mpPayment.date_approved;
    }

    if (
      mpPayment.status === 'rejected' ||
      mpPayment.status === 'cancelled' ||
      mpPayment.status === 'expired'
    ) {
      updates.errorMessage =
        mpPayment.status_detail ||
        `Pagamento ${mpPayment.status}.`;
    }

    /**
     * Nunca altera para APPROVED usando apenas dados enviados
     * pelo frontend. A confirmação vem da consulta oficial.
     */
    if (
      newStatus === 'APPROVED' &&
      localPayment.status !== 'APPROVED' &&
      localPayment.status !== 'RENEWED' &&
      localPayment.status !== 'RENEWING'
    ) {
      const processed = await this.processPaymentApprovalFromMercadoPago(
        localPayment.id,
        mpPayment
      );

      return processed.payment;
    }

    return db.updatePayment(localPayment.id, updates);
  }

  /**
   * Aprovação automática após confirmação REAL do Mercado Pago.
   */
  private async processPaymentApprovalFromMercadoPago(
    paymentId: string,
    mpPayment: MercadoPagoPaymentResponse
  ): Promise<{
    payment: PaymentType;
    customer: Customer;
    access?: IptvAccess;
  }> {
    const payment = db.getPaymentById(paymentId);

    if (!payment) {
      throw new Error('Pagamento não encontrado.');
    }

    /**
     * Proteção contra processamento duplicado.
     */
    if (
      payment.status === 'APPROVED' ||
      payment.status === 'RENEWING' ||
      payment.status === 'RENEWED'
    ) {
      const customer = db.getCustomerById(payment.customerId);

      if (!customer) {
        throw new Error('Cliente não encontrado.');
      }

      const access = payment.iptvAccessId
        ? db.getAccessById(payment.iptvAccessId) || undefined
        : undefined;

      return {
        payment,
        customer,
        access,
      };
    }

    /**
     * Segurança:
     * o valor pago pelo Mercado Pago precisa bater com o valor
     * da cobrança local.
     */
    const confirmedAmount = Number(
      mpPayment.transaction_amount
    );

    if (
      Number.isFinite(confirmedAmount) &&
      Math.abs(confirmedAmount - payment.amount) > 0.01
    ) {
      db.updatePayment(payment.id, {
        status: 'FAILED',
        errorMessage:
          `Valor divergente. Esperado R$ ${payment.amount.toFixed(
            2
          )}, recebido R$ ${confirmedAmount.toFixed(2)}.`,
      });

      throw new Error(
        'Pagamento aprovado pelo Mercado Pago, mas o valor recebido é diferente do valor da cobrança.'
      );
    }

    /**
     * Usa a função existente do banco para iniciar a aprovação.
     */
    const approvalResult = db.applyPaymentApproval(
      payment.id,
      Number.isFinite(confirmedAmount)
        ? confirmedAmount
        : payment.amount
    );

    const customer = approvalResult.customer;
    const access = approvalResult.access;

    const plan = payment.planId
      ? db.getPlanById(payment.planId)
      : null;

    const daysToAdd = plan?.days || 30;

    const currentExpiry =
      access?.expirationDate || customer.expirationDate;

    let baseDate = new Date();

    if (currentExpiry && currentExpiry.includes('/')) {
      const parts = currentExpiry
        .split(' ')[0]
        .split('/');

      if (parts.length === 3) {
        const parsed = new Date(
          Number(parts[2]),
          Number(parts[1]) - 1,
          Number(parts[0])
        );

        if (
          !Number.isNaN(parsed.getTime()) &&
          parsed.getTime() > baseDate.getTime()
        ) {
          baseDate = parsed;
        }
      }
    } else if (currentExpiry) {
      const parsed = new Date(currentExpiry);

      if (
        !Number.isNaN(parsed.getTime()) &&
        parsed.getTime() > baseDate.getTime()
      ) {
        baseDate = parsed;
      }
    }

    baseDate.setDate(baseDate.getDate() + daysToAdd);

    const pad = (n: number) =>
      String(n).padStart(2, '0');

    const newExpiryStr =
      `${pad(baseDate.getDate())}/` +
      `${pad(baseDate.getMonth() + 1)}/` +
      `${baseDate.getFullYear()} 23:59:59`;

    if (access) {
      db.updateAccess(access.id, {
        expirationDate: newExpiryStr,
        status: 'ACTIVE',
      });
    }

    db.updateCustomer(customer.id, {
      expirationDate: newExpiryStr,
      status: 'ACTIVE',
    });

    db.updatePayment(payment.id, {
      status: 'APPROVED',
      approvedAt:
        mpPayment.date_approved ||
        new Date().toISOString(),
      paidAt:
        mpPayment.date_approved ||
        new Date().toISOString(),
      renewalStatus: 'processing',
      errorMessage: undefined,
    });

    try {
      const job = automationQueue.addJob({
        customerId: customer.id,
        customerName: customer.name,
        iptvAccessId: access?.id,
        accessName: access?.name,
        iptvUsername:
          access?.iptvUsername ||
          customer.iptvUsername,
        paymentId: payment.id,
        planId: payment.planId,
        days: daysToAdd,
        action: 'RENEW_30',
      });

      db.updatePayment(payment.id, {
        automationJobId: job.id,
      });

      if (payment.renewalOrderId) {
        db.updateRenewalOrder(
          payment.renewalOrderId,
          {
            status: 'APPROVED',
            automationJobId: job.id,
            mercadoPagoPaymentId:
              payment.mercadoPagoPaymentId,
            processedAt:
              new Date().toISOString(),
          }
        );
      }
    } catch (error) {
      console.error(
        '[MERCADO PAGO] Erro ao enfileirar renovação:',
        error
      );

      db.updatePayment(payment.id, {
        renewalStatus: 'failed',
        renewalError:
          error instanceof Error
            ? error.message
            : String(error),
      });
    }

    const accessForEmail: IptvAccess =
      access || {
        id:
          payment.iptvAccessId ||
          `acc-${customer.id}`,
        customerId: customer.id,
        customerName: customer.name,
        name:
          payment.accessName ||
          'Ponto Principal',
        iptvUsername:
          payment.iptvUsername ||
          customer.iptvUsername,
        iptvPassword:
          customer.iptvPassword ||
          customer.portalPassword ||
          '',
        iptvUrl: customer.iptvUrl,
        expirationDate: newExpiryStr,
        status: 'ACTIVE',
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      };

    emailService
      .sendPaymentApprovedEmail(
        customer,
        accessForEmail,
        payment
      )
      .catch((error) => {
        console.warn(
          '[EMAIL CONFIRMATION ERROR]',
          error
        );
      });

    db.addLog(
      'SUCCESS',
      `[PIX] Pagamento #${payment.id.slice(
        -6
      )} confirmado pelo Mercado Pago. MP #${
        payment.mercadoPagoPaymentId
      }`
    );

    return {
      payment:
        db.getPaymentById(payment.id) ||
        payment,
      customer,
      access,
    };
  }

  /**
   * Aprovação manual administrativa.
   *
   * Mantida porque o sistema já possui essa funcionalidade.
   */
  public async processPaymentApproval(
    paymentId: string
  ): Promise<{
    success: boolean;
    payment: PaymentType;
    customer: Customer;
    access?: IptvAccess;
  }> {
    const payment = db.getPaymentById(paymentId);

    if (!payment) {
      throw new Error(
        'Pagamento não encontrado.'
      );
    }

    if (
      payment.status === 'APPROVED' ||
      payment.status === 'RENEWED' ||
      payment.status === 'RENEWING'
    ) {
      const customer =
        db.getCustomerById(
          payment.customerId
        )!;

      const access = payment.iptvAccessId
        ? db.getAccessById(
            payment.iptvAccessId
          ) || undefined
        : undefined;

      return {
        success: true,
        payment,
        customer,
        access,
      };
    }

    /**
     * A função administrativa continua podendo
     * aprovar manualmente, como já acontecia.
     */
    const fakeMpPayment: MercadoPagoPaymentResponse = {
      id:
        payment.mercadoPagoPaymentId ||
        payment.id,
      status: 'approved',
      transaction_amount: payment.amount,
      date_approved:
        new Date().toISOString(),
    };

    const result =
      await this.processPaymentApprovalFromMercadoPago(
        payment.id,
        fakeMpPayment
      );

    return {
      success: true,
      payment: result.payment,
      customer: result.customer,
      access: result.access,
    };
  }

  /**
   * Valida a assinatura x-signature do Mercado Pago.
   *
   * Manifest:
   * id:<data.id>;request-id:<x-request-id>;ts:<ts>;
   */
  private validateWebhookSignature(params: {
    signature: string;
    requestId: string;
    dataId: string;
  }): boolean {
    const secret = this.getWebhookSecret();

    /**
     * Se não configurou secret, recusamos em produção.
     * Isso evita aceitar qualquer pessoa simulando um pagamento.
     */
    if (!secret) {
      console.error(
        '[MERCADO PAGO WEBHOOK] Secret não configurado.'
      );
      return false;
    }

    const signatureParts =
      params.signature.split(',');

    let ts = '';
    let v1 = '';

    for (const part of signatureParts) {
      const [key, value] =
        part.split('=');

      if (key === 'ts') {
        ts = value || '';
      }

      if (key === 'v1') {
        v1 = value || '';
      }
    }

    if (!ts || !v1) {
      return false;
    }

    const manifest =
      `id:${params.dataId};` +
      `request-id:${params.requestId};` +
      `ts:${ts};`;

    const generated = crypto
      .createHmac(
        'sha256',
        secret
      )
      .update(manifest)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(generated, 'hex'),
        Buffer.from(v1, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Processa Webhook do Mercado Pago.
   */
  public async handleWebhook(
    payload: any
  ): Promise<{
    success: boolean;
    message: string;
    processed?: boolean;
  }> {
    const headers =
      payload?.headers || {};

    const signature =
      headers['x-signature'] ||
      headers['X-Signature'] ||
      '';

    const requestId =
      headers['x-request-id'] ||
      headers['X-Request-Id'] ||
      '';

    const dataId =
      String(
        payload?.data?.id ||
          payload?.query?.['data.id'] ||
          payload?.query?.id ||
          payload?.id ||
          ''
      );

    if (!dataId) {
      return {
        success: true,
        message:
          'Webhook recebido sem ID de pagamento.',
        processed: false,
      };
    }

    /**
     * Validar assinatura antes de processar qualquer pagamento.
     */
    if (
      !this.validateWebhookSignature({
        signature,
        requestId,
        dataId,
      })
    ) {
      console.warn(
        '[MERCADO PAGO WEBHOOK] Assinatura inválida.'
      );

      throw new Error(
        'Assinatura do webhook inválida.'
      );
    }

    const webhookEventId =
      String(
        payload?.id ||
          `${payload?.type || 'payment'}-${dataId}-${payload?.action || 'update'}`
      );

    /**
     * Idempotência do webhook.
     */
    if (
      db.isWebhookProcessed(
        webhookEventId
      )
    ) {
      return {
        success: true,
        message:
          'Webhook já processado anteriormente.',
        processed: false,
      };
    }

    /**
     * Procurar pagamento local pelo ID do Mercado Pago.
     */
    const allPayments =
      db.getPayments();

    let localPayment =
      allPayments.find(
        (p) =>
          p.mercadoPagoPaymentId ===
          dataId
      ) || null;

    /**
     * Se não encontrou pelo ID, tenta localizar
     * através do external_reference consultando
     * diretamente o Mercado Pago.
     */
    const { client } =
      this.getClient();

    if (!client) {
      throw new Error(
        'Mercado Pago não configurado.'
      );
    }

    const mercadoPago =
      new Payment(client);

    let mpPayment:
      | MercadoPagoPaymentResponse
      | null = null;

    try {
      mpPayment =
        (await mercadoPago.get({
          id: dataId,
        })) as unknown as MercadoPagoPaymentResponse;
    } catch (error) {
      console.error(
        `[MERCADO PAGO WEBHOOK] Erro ao consultar pagamento ${dataId}:`,
        error
      );

      throw new Error(
        'Não foi possível consultar o pagamento recebido pelo webhook.'
      );
    }

    if (!localPayment && mpPayment.external_reference) {
      const order =
        db.getRenewalOrderByExternalReference(
          mpPayment.external_reference
        );

      if (order?.paymentId) {
        localPayment =
          db.getPaymentById(
            order.paymentId
          );
      }
    }

    /**
     * Se não pertence ao nosso sistema, apenas registra
     * o webhook sem processar renovação.
     */
    if (!localPayment) {
      db.markWebhookProcessed(
        webhookEventId
      );

      db.addLog(
        'INFO',
        `[PIX WEBHOOK] Pagamento MP #${dataId} recebido, mas não pertence a nenhum pagamento local.`
      );

      return {
        success: true,
        message:
          'Pagamento não pertence ao sistema.',
        processed: false,
      };
    }

    /**
     * Garantir que o ID do Mercado Pago esteja salvo.
     */
    if (
      localPayment.mercadoPagoPaymentId !==
      dataId
    ) {
      localPayment =
        db.updatePayment(
          localPayment.id,
          {
            mercadoPagoPaymentId:
              dataId,
          }
        );
    }

    /**
     * Sincronizar status.
     */
    await this.syncMercadoPagoStatus(
      localPayment,
      mpPayment
    );

    /**
     * Só marcar como processado depois que conseguimos
     * consultar e sincronizar corretamente.
     */
    db.markWebhookProcessed(
      webhookEventId
    );

    return {
      success: true,
      message:
        'Webhook processado com sucesso.',
      processed: true,
    };
  }
}

export const mercadoPagoService =
  new MercadoPagoService();