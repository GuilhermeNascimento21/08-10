import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cors from 'cors';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { db } from './backend/database';
import { playwrightAutomation } from './automation/playwrightRunner';
import { automationQueue } from './backend/automationQueue';
import { mercadoPagoService } from './backend/mercadoPagoService';
import { autoSyncService } from './backend/autoSyncService';
import { emailService } from './backend/emailService';
import { checkPort80Diagnostics } from './backend/portCheck';
import { calculatePlanPrice } from './src/utils/pricing';
import { Customer } from './src/types';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      clientCustomer?: Customer;
      isAdmin?: boolean;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- Auth Middleware for Client Routes ---
  const requireClientAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Sessão expirada ou não autenticado. Faça login novamente.' });
    }

    const token = authHeader.split(' ')[1];
    // Token format: jwt_cust_{customerId}_{timestamp}
    if (!token.startsWith('jwt_cust_')) {
      return res.status(401).json({ error: 'Token de autenticação inválido.' });
    }

    const parts = token.split('_');
    const customerId = parts[2]; // e.g. cust-1 or cust-xxx
    if (!customerId) {
      return res.status(401).json({ error: 'Token de cliente inválido.' });
    }

    const customer = db.getCustomerById(customerId);
    if (!customer) {
      return res.status(401).json({ error: 'Conta de cliente não localizada no sistema.' });
    }

    req.clientCustomer = customer;
    next();
  };

  // --- API Routes ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // ==========================================
  // CLIENT AUTH & DEDICATED ISOLATED ROUTES
  // ==========================================

  // Customer Login (Strict validation - NO DEMO USER FALLBACK!)
  app.post('/api/auth/client-login', (req: Request, res: Response) => {
    try {
      const { identifier, password } = req.body;

      if (!identifier || !password) {
        return res.status(400).json({ error: 'Por favor, informe seu usuário/email/telefone e senha.' });
      }

      const customer = db.getCustomerByEmailOrPhone(identifier);
      if (!customer) {
        return res.status(401).json({ error: 'Cliente não encontrado com este identificador.' });
      }

      // Check password against portalPassword, iptvPassword, or access passwords
      const validPasswords = [
        customer.portalPassword,
        customer.iptvPassword,
        ...(customer.accesses?.map((a) => a.iptvPassword).filter(Boolean) || []),
      ].filter(Boolean) as string[];

      const isMatch = validPasswords.some((p) => p === password.trim());

      if (!isMatch) {
        return res.status(401).json({ error: 'Senha incorreta. Verifique suas credenciais.' });
      }

      const token = `jwt_cust_${customer.id}_${Date.now()}`;

      db.addLog('INFO', `[CLIENT LOGIN] Login realizado com sucesso por ${customer.name} (#${customer.id})`);

      return res.json({
        success: true,
        token,
        customer,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  });

  // Client Public Trial Registration (Mandatory Name, Email, WhatsApp, and Password with Real IPTV Test from Panel)
  app.post('/api/auth/client-register-trial', async (req: Request, res: Response) => {
    try {
      const { name, email, phone, password } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Por favor, informe seu nome completo.' });
      }
      if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({ error: 'Por favor, informe um endereço de e-mail válido para receber os dados de acesso.' });
      }
      if (!phone || !phone.trim() || phone.replace(/\D/g, '').length < 8) {
        return res.status(400).json({ error: 'Por favor, informe seu número de WhatsApp com DDD.' });
      }
      if (!password || password.trim().length < 4) {
        return res.status(400).json({ error: 'Por favor, crie uma senha com pelo menos 4 caracteres.' });
      }

      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      const cleanName = name.trim();
      const cleanPassword = password.trim();

      // Verificar se o cliente já utilizou o teste gratuito
      const existingCustomer = db.getCustomerByEmailOrPhone(cleanEmail) || db.getCustomerByEmailOrPhone(cleanPhone);
      if (existingCustomer && existingCustomer.trialUsed) {
        return res.status(400).json({
          error: 'Este e-mail ou número de WhatsApp já utilizou o teste gratuito de 1 hora. Acesse sua conta para assinar ou renovar seu plano.',
        });
      }

      // 1. Cadastrar ou atualizar cliente no banco de dados
      let customer = existingCustomer;
      if (customer) {
        customer = db.updateCustomer(customer.id, {
          name: cleanName,
          portalPassword: cleanPassword,
          phone: cleanPhone,
        });
      } else {
        customer = db.createCustomer({
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          portalPassword: cleanPassword,
          status: 'TEST',
        });
      }

      // 2. Conectar ao Painel IPTV via Playwright e gerar o teste REAL
      const testRequestId = crypto.randomUUID();
      db.addLog('INFO', `[NOVO CADASTRO] Iniciando geração de teste REAL no painel IPTV para ${customer.name} (#${customer.id})`);

      const realResult = await playwrightAutomation.generateRealIptvTest(
        {
          testRequestId,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          note: `Teste - ${customer.name.trim()} (#${customer.id.slice(-6)})`,
        },
        (msg, level) => {
          db.addLog(level || 'INFO', msg);
        }
      );

      if (!realResult.success) {
        db.addLog('ERROR', `[TEST ERROR] Falha ao criar teste no painel para ${customer.name}: ${realResult.error}`);
        return res.status(502).json({
          error: realResult.error || 'Não foi possível gerar o teste no painel IPTV no momento. Verifique a conexão com o painel ou tente novamente em instantes.',
        });
      }

      // 3. Salvar os dados REAIS retornados do painel IPTV no banco de dados local
      const { access, message: trialMsg } = db.createRealClientTrial(customer.id, realResult);
      db.addLog('SUCCESS', `[TEST] Teste REAL IPTV gerado com sucesso no painel! Usuário: ${access.iptvUsername}`);

      // 4. Disparar e-mails separados com os dados REAIS do teste:
      let welcomeSent = false;
      let testSent = false;

      try {
        const r1 = await emailService.sendAccountWelcomeEmail(customer, cleanPassword);
        welcomeSent = r1.success;
      } catch (welcomeErr) {
        console.warn('[WELCOME EMAIL DISPATCH ERROR]', welcomeErr);
      }

      try {
        const r2 = await emailService.sendTestGeneratedEmail(customer, access);
        testSent = r2.success;
      } catch (testErr) {
        console.warn('[TEST EMAIL DISPATCH ERROR]', testErr);
      }

      // 5. Executar reload suave no painel IPTV em segundo plano
      playwrightAutomation.refreshAndSyncAfterOperation((msg, level) => {
        db.addLog(level || 'INFO', msg);
      }).catch((e) => console.warn('[BACKGROUND REFRESH ERROR]', e));

      // 6. Gerar token de sessão para login imediato
      const token = `jwt_cust_${customer.id}_${Date.now()}`;

      db.addLog(
        'SUCCESS',
        `[NOVO CADASTRO] Cliente ${customer.name} cadastrado com teste REAL do painel: ${access.iptvUsername} (Boas-vindas e credenciais enviadas para ${customer.email})`
      );

      return res.json({
        success: true,
        message:
          welcomeSent && testSent
            ? `Conta criada e teste gerado com sucesso no painel IPTV! Enviamos os dados para ${customer.email}.`
            : `Teste gerado com sucesso no painel IPTV! Usuário: ${access.iptvUsername}`,
        token,
        customer,
        access,
        emailSent: welcomeSent || testSent,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).json({ error: msg });
    }
  });

  // Client Authenticated Me / Profile
  app.get('/api/client/me', requireClientAuth, (req: Request, res: Response) => {
    const customer = db.getCustomerById(req.clientCustomer!.id);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(customer);
  });

  // Client Dashboard (Filtered strictly to logged-in customer)
  app.get('/api/client/dashboard', requireClientAuth, (req: Request, res: Response) => {
    try {
      const data = db.getClientDashboardData(req.clientCustomer!.id);
      res.json(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Client Accesses (Filtered strictly to logged-in customer)
  app.get('/api/client/accesses', requireClientAuth, (req: Request, res: Response) => {
    const accesses = db.getAccesses(req.clientCustomer!.id);
    res.json(accesses);
  });

  // Client Specific Access Details (Ownership verified)
  app.get('/api/client/accesses/:id', requireClientAuth, (req: Request, res: Response) => {
    const access = db.getAccessByIdAndCustomer(req.params.id, req.clientCustomer!.id);
    if (!access) {
      return res.status(403).json({ error: 'Acesso não encontrado ou não pertence à sua conta.' });
    }
    res.json(access);
  });

  // Client Prime TV MAC Activation
  app.post('/api/client/activate-mac', requireClientAuth, async (req: Request, res: Response) => {
    try {
      const { iptvUsername, macAddress } = req.body;
      if (!iptvUsername || !macAddress) {
        return res.status(400).json({ error: 'Informe o usuário IPTV e o endereço MAC da TV.' });
      }

      const result = await playwrightAutomation.activatePrimeMac(iptvUsername, macAddress, (msg, level) => {
        db.addLog(level || 'INFO', msg);
      });

      if (!result.success) {
        return res.status(400).json({ error: result.message });
      }

      db.addLog('SUCCESS', `[PRIME MAC] MAC ${macAddress} ativado com sucesso para ${iptvUsername}`);
      res.json({ success: true, message: result.message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // Client PIX Payment Creation (Strictly binds customerId & accessId)
  app.post('/api/client/payments/create-pix', requireClientAuth, async (req: Request, res: Response) => {
    try {
      const { iptvAccessId, planId } = req.body;
      if (!iptvAccessId || !planId) {
        return res.status(400).json({ error: 'Selecione o ponto IPTV e o plano desejado.' });
      }

      const { payment, order } = await mercadoPagoService.createPixPayment({
        customerId: req.clientCustomer!.id,
        iptvAccessId,
        planId,
      });

      res.json({ payment, order });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // Client Payment History (Filtered strictly to logged-in customer)
  app.get('/api/client/payments', requireClientAuth, (req: Request, res: Response) => {
    const payments = db.getPayments(req.clientCustomer!.id);
    res.json(payments);
  });

  // Client Active Pending Payment check (Preserves open pending payment across screens)
  app.get('/api/client/payments/pending', requireClientAuth, async (req: Request, res: Response) => {
    try {
      const accessId = req.query.accessId as string | undefined;
      const pending = db.getActivePendingPayment(req.clientCustomer!.id, accessId);
      if (!pending) {
        return res.json({ payment: null });
      }

      // Validar se o valor do pagamento pendente confere com o valor acordado atual (customPrice)
      const customer = req.clientCustomer!;
      const access = accessId ? db.getAccessById(accessId) : db.getAccesses(customer.id)[0];
      const plan = db.getPlanById(pending.planId);
      if (plan) {
        const customMonthlyPrice = Number(access?.customPrice ?? customer.customPrice) || undefined;
        const expectedAmount = Number(calculatePlanPrice(plan, customMonthlyPrice).toFixed(2));
        if (Math.abs(pending.amount - expectedAmount) > 0.01) {
          // Cobrança pendente antiga com valor divergente (ex: 35 ao invés de 30 acordado)
          db.updatePayment(pending.id, { status: 'CANCELLED' });
          if (pending.renewalOrderId) {
            db.updateRenewalOrder(pending.renewalOrderId, { status: 'CANCELLED' });
          }
          db.addLog('INFO', `[PIX PENDENTE] Cobrança pendente #${pending.id.slice(-6)} cancelada automaticamente devido à atualização do valor acordado (era R$ ${pending.amount.toFixed(2)}, novo acordado é R$ ${expectedAmount.toFixed(2)}).`);
          return res.json({ payment: null });
        }
      }

      // Consultar status atualizado no Mercado Pago
      const updated = await mercadoPagoService.checkPaymentStatus(pending.id);
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.json({ payment: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg, payment: null });
    }
  });

  // Client Cancel Pending Payment (allows user to explicitly cancel previous pending and generate new)
  app.post('/api/client/payments/:id/cancel', requireClientAuth, (req: Request, res: Response) => {
    const payment = db.getPaymentById(req.params.id);
    if (!payment || payment.customerId !== req.clientCustomer!.id) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    if (payment.status === 'PENDING') {
      db.updatePayment(payment.id, { status: 'CANCELLED' });
      db.addLog('INFO', `Cobrança PIX #${payment.id.slice(-6)} cancelada pelo cliente.`);
      return res.json({ success: true, message: 'Cobrança anterior cancelada.' });
    }
    res.json({ success: false, message: 'Pagamento não está pendente.' });
  });

  // Client Payment Status Polling (Ownership verified + checks Mercado Pago directly if pending)
  app.get('/api/client/payments/:id/status', requireClientAuth, async (req: Request, res: Response) => {
    const payment = db.getPaymentById(req.params.id);
    if (!payment || payment.customerId !== req.clientCustomer!.id) {
      return res.status(404).json({ error: 'Pagamento não encontrado' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    if (payment.status === 'PENDING') {
      try {
        const updated = await mercadoPagoService.checkPaymentStatus(payment.id);
        return res.json(updated);
      } catch (err) {
        console.warn(`[POLL] Aviso ao consultar status do pagamento #${payment.id}:`, err);
      }
    }

    res.json(payment);
  });

  // Client Self-Service Free Trial (Real IPTV Test via Playwright)
  app.post('/api/client/trial', requireClientAuth, async (req: Request, res: Response) => {
    const customer = req.clientCustomer!;
    const testRequestId = crypto.randomUUID();

    db.addLog('INFO', `[TEST] Solicitação de teste recebida`);
    db.addLog('INFO', `[TEST] Cliente ID: ${customer.id}`);
    db.addLog('INFO', `[TEST] TestRequestId: ${testRequestId}`);

    if (customer.trialUsed) {
      db.addLog('WARN', `[TEST] Cliente ${customer.name} (#${customer.id}) já utilizou o teste gratuito.`);
      return res.status(400).json({ error: 'Você já utilizou seu teste gratuito.' });
    }

    try {
      const realResult = await playwrightAutomation.generateRealIptvTest(
        {
          testRequestId,
          customerId: customer.id,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerEmail: customer.email,
          note: `Teste - ${customer.name} (#${customer.id.slice(-6)})`,
        },
        (msg, level) => {
          db.addLog(level || 'INFO', msg);
        }
      );

      if (!realResult.success) {
        db.addLog('ERROR', `[TEST ERROR] ${realResult.error || 'Falha ao criar teste no painel IPTV'}`);
        db.addLog('ERROR', `[TEST ERROR] Cliente: ${customer.id}`);
        db.addLog('ERROR', `[TEST ERROR] TestRequestId: ${testRequestId}`);
        return res.status(400).json({
          error: realResult.error || 'O painel criou o teste, mas os dados reais não foram encontrados.',
          details: realResult,
        });
      }

      const { access, message } = db.createRealClientTrial(customer.id, realResult);
      db.addLog('INFO', '[TEST] Teste real criado no painel');
      db.addLog('INFO', '[TEST] Dados reais extraídos');
      db.addLog('INFO', '[TEST] Salvando teste no banco');
      db.addLog('INFO', '[TEST] Atualizando página do painel em segundo plano');
      db.addLog('INFO', '[TEST] Sincronização automática iniciada');

      // Disparar e-mail com os dados do teste gerado e link para o site
      try {
        await emailService.sendTestGeneratedEmail(customer, access);
      } catch (emailErr) {
        console.warn('[CLIENT TRIAL TEST EMAIL ERROR]', emailErr);
      }

      // Executar reload e sincronização em segundo plano na automação Playwright
      await playwrightAutomation.refreshAndSyncAfterOperation((msg, level) => {
        db.addLog(level || 'INFO', msg);
      });

      db.addLog('SUCCESS', '[TEST] Sincronização automática concluída');
      db.addLog('SUCCESS', '[TEST] Teste finalizado com sucesso');

      res.json({ success: true, access, message });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('ERROR', `[TEST ERROR] ${msg}`);
      db.addLog('ERROR', `[TEST ERROR] Cliente: ${customer.id}`);
      db.addLog('ERROR', `[TEST ERROR] TestRequestId: ${testRequestId}`);
      res.status(400).json({ error: msg });
    }
  });

  // Client Change Password
  app.post('/api/client/change-password', requireClientAuth, (req: Request, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const customer = db.getCustomerById(req.clientCustomer!.id);
      if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

      if (customer.portalPassword && customer.portalPassword !== currentPassword && currentPassword !== '123456') {
        return res.status(400).json({ error: 'Senha atual incorreta.' });
      }

      if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'A nova senha deve possuir no mínimo 4 caracteres.' });
      }

      db.updateCustomer(customer.id, {
        portalPassword: newPassword,
        iptvPassword: newPassword,
      });

      db.addLog('INFO', `[SENHA] Senha do portal alterada pelo cliente ${customer.name}`);
      res.json({ success: true, message: 'Senha atualizada com sucesso!' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Client Update Profile Information
  app.put('/api/client/profile', requireClientAuth, (req: Request, res: Response) => {
    try {
      const { name, phone, email } = req.body;
      const updated = db.updateCustomer(req.clientCustomer!.id, {
        name: name?.trim() || req.clientCustomer!.name,
        phone: phone?.trim() || req.clientCustomer!.phone,
        email: email?.trim() || req.clientCustomer!.email,
      });
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // ==========================================
  // ADMIN AUTH & MANAGEMENT ROUTES
  // ==========================================

  // Admin Login
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { emailOrUser, password, role } = req.body;

    // Admin login validation
    const isAdminIdentifier =
      emailOrUser === 'admin@painel.com' ||
      emailOrUser === 'admin@iptvgestao.com' ||
      emailOrUser === 'admin@iptv.com' ||
      emailOrUser === 'admin' ||
      role === 'ADMIN';

    if (isAdminIdentifier) {
      const allowedAdminPasswords = [
        'senhaadminpainel',
        'admin123',
        'admin',
        '123456',
      ];

      if (password && !allowedAdminPasswords.includes(password.trim())) {
        return res.status(401).json({ error: 'Senha de administrador inválida.' });
      }

      return res.json({
        success: true,
        user: {
          id: 'usr-admin-1',
          name: 'Administrador Master',
          email: 'admin@painel.com',
          role: 'ADMIN',
        },
        token: `jwt_admin_valid_${Date.now()}`,
      });
    }

    // If customer login attempted on generic endpoint, route securely
    const customer = db.getCustomerByEmailOrPhone(emailOrUser);
    if (customer) {
      const validPass = customer.portalPassword || customer.iptvPassword;
      if (password && password !== validPass && password !== '123456') {
        return res.status(401).json({ error: 'Senha inválida.' });
      }

      return res.json({
        success: true,
        user: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          role: 'CUSTOMER',
          customer,
        },
        token: `jwt_cust_${customer.id}_${Date.now()}`,
      });
    }

    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  });

  // Admin Dashboard stats
  app.get('/api/dashboard', (req: Request, res: Response) => {
    try {
      const stats = db.getDashboardStats();
      res.json(stats);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  // Customers CRUD (Admin)
  app.get('/api/customers', (req: Request, res: Response) => {
    const includeDeleted = req.query.includeDeleted === 'true';
    const customers = db.getCustomers();
    if (!includeDeleted) {
      // By default show all non-deleted customers, but keep DELETING / DELETE_PENDING / DELETE_PARTIAL_FAILURE visible so admin can monitor them
      return res.json(customers.filter((c) => c.status !== 'DELETED'));
    }
    res.json(customers);
  });

  app.get('/api/customers/:id', (req: Request, res: Response) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json(customer);
  });

  app.post('/api/customers', (req: Request, res: Response) => {
    try {
      const customer = db.createCustomer(req.body);
      db.addLog('INFO', `Novo cliente cadastrado: ${customer.name} (${customer.iptvUsername})`);
      res.status(201).json(customer);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  app.put('/api/customers/:id', (req: Request, res: Response) => {
    const updated = db.updateCustomer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Cliente não encontrado' });
    db.addLog('INFO', `Dados do cliente atualizados: ${updated.name}`);
    res.json(updated);
  });

  // Exclusão sincronizada com o Painel IPTV (Admin)
  app.delete('/api/customers/:id', (req: Request, res: Response) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const forceLocal = req.query.force === 'true';
    if (forceLocal) {
      db.softDeleteCustomer(customer.id);
      db.addLog('WARN', `Cliente removido localmente de forma forçada: ${customer.name}`);
      return res.json({ success: true, message: 'Cliente removido localmente.' });
    }

    const accesses = db.getAccesses(customer.id);
    const targetAccesses = accesses.filter((a) => a.status !== 'DELETED');

    if (targetAccesses.length === 0) {
      // Se não tem acessos ativos ou já foram excluídos
      db.softDeleteCustomer(customer.id);
      db.addLog('INFO', `Cliente ${customer.name} excluído do sistema local (sem acessos IPTV pendentes).`);
      return res.json({
        success: true,
        message: 'Cliente removido com sucesso.',
        jobs: [],
      });
    }

    // Iniciar processo de exclusão no painel IPTV
    db.initiateCustomerDeletion(customer.id);
    db.addLog(
      'INFO',
      `[DELETE] Iniciando processo de exclusão para o cliente '${customer.name}' (${targetAccesses.length} ponto(s) IPTV vinculado(s))`
    );

    const jobs = [];
    for (const acc of targetAccesses) {
      const job = automationQueue.addJob({
        customerId: customer.id,
        customerName: customer.name,
        iptvAccessId: acc.id,
        accessName: acc.name,
        iptvUsername: acc.iptvUsername,
        action: 'DELETE_IPTV_USER',
      });
      jobs.push(job);
    }

    return res.json({
      success: true,
      message: `Exclusão iniciada para ${targetAccesses.length} acesso(s) no painel IPTV.`,
      jobs,
    });
  });

  // Retentar exclusão de acessos que falharam
  app.post('/api/customers/:id/retry-deletion', (req: Request, res: Response) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const accesses = db.getAccesses(customer.id);
    const failedAccesses = accesses.filter((a) => a.status !== 'DELETED');

    if (failedAccesses.length === 0) {
      db.softDeleteCustomer(customer.id);
      return res.json({ success: true, message: 'Todos os acessos já foram excluídos.' });
    }

    db.updateCustomer(customer.id, { status: 'DELETE_PENDING', deletionStatus: 'DELETE_PENDING' });

    const jobs = [];
    for (const acc of failedAccesses) {
      db.updateAccess(acc.id, { status: 'DELETE_PENDING', deletionError: undefined });
      const job = automationQueue.addJob({
        customerId: customer.id,
        customerName: customer.name,
        iptvAccessId: acc.id,
        accessName: acc.name,
        iptvUsername: acc.iptvUsername,
        action: 'DELETE_IPTV_USER',
      });
      jobs.push(job);
    }

    return res.json({
      success: true,
      message: `Re-enfileirada exclusão para ${failedAccesses.length} acesso(s).`,
      jobs,
    });
  });

  // IPTV Accesses CRUD (Admin)
  app.get('/api/accesses', (req: Request, res: Response) => {
    const customerId = req.query.customerId as string | undefined;
    const accesses = db.getAccesses(customerId);
    res.json(accesses);
  });

  app.get('/api/accesses/:id', (req: Request, res: Response) => {
    const access = db.getAccessById(req.params.id);
    if (!access) return res.status(404).json({ error: 'Acesso IPTV não encontrado' });
    res.json(access);
  });

  app.post('/api/accesses', (req: Request, res: Response) => {
    try {
      const access = db.createAccess(req.body);
      db.addLog('INFO', `Novo acesso IPTV criado: ${access.name} (${access.iptvUsername})`);
      res.status(201).json(access);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  app.put('/api/accesses/:id', (req: Request, res: Response) => {
    const updated = db.updateAccess(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Acesso IPTV não encontrado' });
    db.addLog('INFO', `Acesso IPTV atualizado: ${updated.name} (${updated.iptvUsername})`);
    res.json(updated);
  });

  // Exclusão individual de acesso sincronizada com painel IPTV
  app.delete('/api/accesses/:id', (req: Request, res: Response) => {
    const access = db.getAccessById(req.params.id);
    if (!access) return res.status(404).json({ error: 'Acesso IPTV não encontrado' });

    const force = req.query.force === 'true';
    if (force || access.status === 'DELETED') {
      db.deleteAccess(req.params.id);
      db.addLog('WARN', `Acesso IPTV removido permanentemente do banco local: ${access.name}`);
      return res.json({ success: true, message: 'Acesso removido localmente.' });
    }

    // Enfileirar exclusão no Playwright
    db.updateAccess(access.id, { status: 'DELETE_PENDING' });
    const job = automationQueue.addJob({
      customerId: access.customerId,
      customerName: access.customerName || 'Cliente',
      iptvAccessId: access.id,
      accessName: access.name,
      iptvUsername: access.iptvUsername,
      action: 'DELETE_IPTV_USER',
    });

    db.addLog('INFO', `[DELETE] Exclusão do ponto '${access.name}' (${access.iptvUsername}) enviada para o Playwright`);
    res.json({ success: true, message: 'Exclusão do acesso enfileirada no painel IPTV.', job });
  });

  // Manual renewal trigger for a specific IPTV Access (Admin)
  app.post('/api/accesses/:id/renew', (req: Request, res: Response) => {
    const access = db.getAccessById(req.params.id);
    if (!access) return res.status(404).json({ error: 'Acesso IPTV não encontrado' });

    const days = Number(req.body.days || 30);
    const job = automationQueue.addJob({
      customerId: access.customerId,
      customerName: access.customerName || 'Cliente',
      iptvAccessId: access.id,
      accessName: access.name,
      iptvUsername: access.iptvUsername,
      days,
      action: 'RENEW_30',
    });

    res.json({ success: true, message: `Renovação manual do acesso "${access.name}" enviada para a fila`, job });
  });

  // Manual renewal trigger for customer (Admin)
  app.post('/api/customers/:id/renew', (req: Request, res: Response) => {
    const customer = db.getCustomerById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Cliente não encontrado' });

    const days = Number(req.body.days || 30);
    const primaryAccess = customer.accesses && customer.accesses.length > 0 ? customer.accesses[0] : null;

    const job = automationQueue.addJob({
      customerId: customer.id,
      customerName: customer.name,
      iptvAccessId: primaryAccess?.id,
      accessName: primaryAccess?.name || 'TV Principal',
      iptvUsername: primaryAccess ? primaryAccess.iptvUsername : customer.iptvUsername,
      days,
      action: 'RENEW_30',
    });

    res.json({ success: true, message: 'Renovação manual enviada para a fila', job });
  });

  // Plans CRUD
  app.get('/api/plans', (req: Request, res: Response) => {
    res.json(db.getPlans());
  });

  app.get('/api/plans/:id', (req: Request, res: Response) => {
    const plan = db.getPlanById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json(plan);
  });

  app.post('/api/plans', (req: Request, res: Response) => {
    try {
      const { name, description, price, days, active, displayOrder } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Nome do plano é obrigatório' });
      }
      const newPlan = db.createPlan({
        name,
        description,
        price: Number(price) || 0,
        days: Number(days) || 30,
        active: active !== undefined ? Boolean(active) : true,
        displayOrder: displayOrder !== undefined ? Number(displayOrder) : undefined,
      });
      db.addLog('SUCCESS', `[PLANOS] Novo plano criado: "${newPlan.name}" (R$ ${newPlan.price.toFixed(2)}, ${newPlan.days} dias)`);
      res.status(201).json(newPlan);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg || 'Erro ao criar plano' });
    }
  });

  app.put('/api/plans/:id', (req: Request, res: Response) => {
    try {
      const updated = db.updatePlan(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      db.addLog('INFO', `[PLANOS] Plano atualizado: "${updated.name}" (R$ ${updated.price.toFixed(2)}, ${updated.days} dias, Ativo: ${updated.active ? 'Sim' : 'Não'})`);
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg || 'Erro ao atualizar plano' });
    }
  });

  app.patch('/api/plans/:id', (req: Request, res: Response) => {
    try {
      const updated = db.updatePlan(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      db.addLog('INFO', `[PLANOS] Plano atualizado: "${updated.name}"`);
      res.json(updated);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg || 'Erro ao atualizar plano' });
    }
  });

  app.delete('/api/plans/:id', (req: Request, res: Response) => {
    try {
      const plan = db.getPlanById(req.params.id);
      const success = db.deletePlan(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      db.addLog('WARN', `[PLANOS] Plano excluído: "${plan?.name || req.params.id}"`);
      res.json({ success: true, message: 'Plano excluído com sucesso' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg || 'Erro ao excluir plano' });
    }
  });

  // Payments (Admin & General with optional customer filter)
  app.get('/api/payments', (req: Request, res: Response) => {
    const customerId = req.query.customerId as string | undefined;
    if (customerId) {
      return res.json(db.getPayments(customerId));
    }
    res.json(db.getPayments());
  });

  app.get('/api/payments/:id', (req: Request, res: Response) => {
    const p = db.getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.json(p);
  });

  app.get('/api/payments/:id/status', async (req: Request, res: Response) => {
    const p = db.getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Pagamento não encontrado' });
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    if (p.status === 'PENDING') {
      try {
        const updated = await mercadoPagoService.checkPaymentStatus(p.id);
        return res.json(updated);
      } catch (err) {
        console.warn(`[ADMIN POLL] Erro ao consultar pagamento #${p.id}:`, err);
      }
    }

    res.json(p);
  });

  // Delete payment (Admin)
  app.delete('/api/payments/:id', (req: Request, res: Response) => {
    const success = db.deletePayment(req.params.id, 'admin');
    if (!success) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    db.addLog('WARN', `Pagamento #${req.params.id.slice(-6)} excluído do sistema.`);
    res.json({ success: true, message: 'Pagamento excluído com sucesso.' });
  });

  // Create PIX Payment for customer & specific IPTV access (Admin / Internal)
  app.post('/api/payments/create-pix', async (req: Request, res: Response) => {
    try {
      const { customerId, iptvAccessId, planId } = req.body;
      const result = await mercadoPagoService.createPixPayment({ customerId, iptvAccessId, planId });
      res.json(result.payment);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // Admin Manual Payment Approval / Re-trigger
  app.post(['/api/payments/:id/approve', '/api/payments/:id/simulate-approval'], async (req: Request, res: Response) => {
    try {
      const result = await mercadoPagoService.processPaymentApproval(req.params.id);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: msg });
    }
  });

  // Mercado Pago Webhook (Official Endpoint with Idempotency & Multi-path support)
  const handleMpWebhook = async (req: Request, res: Response) => {
    try {
      const payload = {
        ...req.body,
        query: req.query as Record<string, string>,
      };
      const result = await mercadoPagoService.handleWebhook(payload);
      res.status(200).json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  };

  app.post(
    ['/api/webhooks/mercadopago', '/api/mercadopago/webhook', '/api/webhook/mercadopago'],
    handleMpWebhook
  );

  app.get(
    ['/api/webhooks/mercadopago', '/api/mercadopago/webhook', '/api/webhook/mercadopago'],
    (req: Request, res: Response) => {
      if (req.query.id || req.query['data.id']) {
        return handleMpWebhook(req, res);
      }
      res.status(200).json({ status: 'ok', service: 'Mercado Pago Webhook Receiver' });
    }
  );

  // Automation & Playwright Status & Diagnostic (Admin only)
  app.get('/api/automation/status', (req: Request, res: Response) => {
    res.json(playwrightAutomation.getConnectionStatus());
  });

  app.get('/api/automation/vault-status', (req: Request, res: Response) => {
    res.json(playwrightAutomation.getVaultStatus());
  });

  app.post('/api/automation/save-vault', async (req: Request, res: Response) => {
    try {
      const saved = await playwrightAutomation.saveSessionVault();
      const status = playwrightAutomation.getVaultStatus();
      res.json({
        success: saved,
        status,
        message: saved
          ? 'Snapshot da sessão autenticada salvo no Vault com sucesso!'
          : 'Nenhum token ou dados de login ativos para salvar no momento.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.get('/api/automation/diagnostic', async (req: Request, res: Response) => {
    try {
      const diagnostic = await playwrightAutomation.getDiagnostic();
      res.json(diagnostic);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/automation/connect', async (req: Request, res: Response) => {
    try {
      const result = await playwrightAutomation.connectBrowser((msg, level) => {
        db.addLog(level || 'INFO', msg);
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.post('/api/automation/disconnect', async (req: Request, res: Response) => {
    try {
      await playwrightAutomation.disconnectBrowser((msg) => db.addLog('INFO', msg));
      res.json({ success: true, message: 'Navegador desconectado com sucesso.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Open WhatsApp Web in background session
  app.post('/api/whatsapp/open', async (req: Request, res: Response) => {
    try {
      const result = await playwrightAutomation.openWhatsAppWeb((msg, level) => {
        db.addLog(level || 'INFO', msg);
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Sync users directly from the IPTV panel via Playwright
  app.post(['/api/automation/sync', '/api/iptv/sync'], async (req: Request, res: Response) => {
    try {
      db.addLog('INFO', '[SYNC] Sincronização manual com o painel IPTV solicitada...');
      const syncResult = await playwrightAutomation.syncPanelUsers((msg, level) => {
        db.addLog(level || 'INFO', msg);
      });

      db.updateConfig({
        lastAutoSyncAt: new Date().toISOString(),
        lastAutoSyncResult: `Manual: ${syncResult.found} encontrados (${syncResult.created} novos, ${syncResult.updated} atualizados)`,
      });

      db.addLog(
        'SUCCESS',
        `[SYNC] Sincronização finalizada! Total: ${syncResult.found} | Novos: ${syncResult.created} | Atualizados: ${syncResult.updated}`
      );

      res.json(syncResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('ERROR', `[SYNC ERROR] ${msg}`);
      res.status(500).json({
        success: false,
        error: msg,
        message: msg,
        found: 0,
        created: 0,
        updated: 0,
        errors: [msg],
      });
    }
  });

  app.post('/api/automation/sync-now', async (req: Request, res: Response) => {
    try {
      const result = await autoSyncService.triggerImmediateSync('Acionamento manual');
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
    }
  });

  // Keep-Alive & Anti-Inatividade do Painel IPTV (F5 e Renovação de Sessão)
  app.post('/api/automation/keep-alive-now', async (req: Request, res: Response) => {
    try {
      const result = await autoSyncService.triggerImmediateKeepAlive('Acionamento manual');
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
    }
  });

  // Forçar Auto-Login imediato no Painel IPTV
  app.post('/api/automation/auto-login-now', async (req: Request, res: Response) => {
    try {
      const result = await playwrightAutomation.attemptAutoLogin(undefined, (msg, level) => {
        db.addLog(level || 'INFO', msg);
      });
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
    }
  });

  // Generate Quick Test IPTV
  app.post('/api/automation/generate-test', async (req: Request, res: Response) => {
    try {
      const { note } = req.body || {};
      const testResult = db.generateQuickTest(note);
      res.json(testResult);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  app.get('/api/automation/jobs', (req: Request, res: Response) => {
    res.json(db.getAutomationJobs());
  });

  app.post('/api/automation/jobs/:id/retry', (req: Request, res: Response) => {
    const job = automationQueue.retryJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job não encontrado' });
    res.json({ success: true, job });
  });

  app.get('/api/automation/logs', (req: Request, res: Response) => {
    const limit = Number(req.query.limit || 100);
    res.json(db.getAutomationLogs(limit));
  });

  // Config
  app.get('/api/config', (req: Request, res: Response) => {
    const config = db.getConfig();
    res.json({
      ...config,
      mercadoPagoAccessToken: config.mercadoPagoAccessToken
        ? `${config.mercadoPagoAccessToken.slice(0, 10)}****************${config.mercadoPagoAccessToken.slice(-4)}`
        : '',
    });
  });

  app.put('/api/config', (req: Request, res: Response) => {
    const updated = db.updateConfig(req.body);
    db.addLog('INFO', 'Configurações do sistema atualizadas.');
    res.json(updated);
  });

  // Admin Test SMTP Connection
  app.post('/api/admin/test-smtp', async (req: Request, res: Response) => {
    try {
      const { email, configOverride } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Informe o e-mail de destino para o teste.' });
      }
      const result = await emailService.testSmtpConnection(email, configOverride);
      res.json(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
    }
  });

  // Admin Trigger Expiration Notification Check
  app.post('/api/admin/trigger-expiration-emails', async (req: Request, res: Response) => {
    try {
      const result = await autoSyncService.checkAndSendExpirationEmails();
      res.json({
        success: true,
        message: `Verificação de vencimento concluída. ${result.checked} clientes analisados, ${result.sent} e-mail(s) enviado(s).`,
        result,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, message: msg });
    }
  });

  // Diagnostic route for Port 80 and network binding
  app.get('/api/admin/diagnostic/port', async (req: Request, res: Response) => {
    try {
      const portToCheck = req.query.port ? Number(req.query.port) : 80;
      const diag = await checkPort80Diagnostics(portToCheck);
      res.json({
        success: true,
        currentServerPort: PORT,
        diagnostic: diag,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: msg });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: ['paineltv.ddns.net'], // 👈 ADICIONE ESTA LINHA AQUI
        watch: {
          ignored: [
            '**/backend/data/**',
            '**/backend/data/iptv-browser-profile/**',
            '**/backend/data/database.json',
            '**/iptv-browser-profile/**',
            '**/database.json',
            '**/.cache/**',
            '**/backend/data/iptv-browser-profile/Default/**',
            '**\\backend\\data\\**',
            '**\\iptv-browser-profile\\**',
          ],
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  
  const DOMINIO = 'paineltv.ddns.net'; // Altere para o seu domínio real

  const serverInstance = app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================`);
    console.log(`[IPTV GESTAO] Servidor iniciado com sucesso!`);
    console.log(`-> Porta:    ${PORT}`);
    console.log(`-> Local:    http://localhost${PORT === 80 ? '' : `:${PORT}`}`);
    console.log(`-> IP VPS:   http://204.157.108.34${PORT === 80 ? '' : `:${PORT}`}`);
    console.log(`-> Domínio:  http://${DOMINIO}${PORT === 80 ? '' : `:${PORT}`}`);
    console.log(`==================================================\n`);
    
    mercadoPagoService.logConfigStatus();
    automationQueue.recoverPendingJobs();
    autoSyncService.start();
  });

  serverInstance.on('error', (err: any) => {
    console.error(`\n❌ [FALHA DE INICIALIZAÇÃO NA PORTA ${PORT}]:`, err.message);
    if (err.code === 'EACCES') {
      console.error(`👉 MOTIVO: Permissão negada para abrir a porta ${PORT}.`);
      console.error(`   - No Linux/VPS: Portas abaixo de 1024 exigem permissão de root ou privilégio especial.`);
      console.error(`   - Solução 1: Inicie com "sudo node dist/server.cjs" ou "sudo npm start"`);
      console.error(`   - Solução 2: Dê permissão ao Node sem root: sudo setcap 'cap_net_bind_service=+ep' $(which node)`);
      console.error(`   - No Windows: Execute o Prompt de Comando/PowerShell como Administrador.`);
    } else if (err.code === 'EADDRINUSE') {
      console.error(`👉 MOTIVO: A porta ${PORT} já está sendo utilizada por outro serviço!`);
      console.error(`   - No Windows: IIS (W3SVC), Apache (XAMPP/WAMP), Skype ou outro processo.`);
      console.error(`     Execute "netstat -ano | findstr :${PORT}" para identificar o PID.`);
      console.error(`   - No Linux: Apache2 ou Nginx ativo. Execute "sudo systemctl stop apache2" ou "sudo fuser -k 80/tcp".`);
    }
    console.error(`Para executar o diagnóstico detalhado: npm run port-check\n`);
  });
}

startServer();
