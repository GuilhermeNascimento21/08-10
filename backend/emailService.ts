import nodemailer from 'nodemailer';
import { db } from './database';
import { Customer, IptvAccess, Payment, SystemConfig } from '../src/types';

export class EmailService {
  private sentApprovalEmails = new Set<string>();

  /**
   * Cria um transportador nodemailer baseado na configuração ativa do banco de dados ou variáveis de ambiente.
   */
  private getTransporter(configOverride?: Partial<SystemConfig>) {
    const config = { ...db.getConfig(), ...configOverride };

    const host = config.smtpHost || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(config.smtpPort || process.env.SMTP_PORT || 587);
    const user = config.smtpUser || process.env.SMTP_USER || '';
    const pass = config.smtpPass || process.env.SMTP_PASS || '';
    const secure = config.smtpSecure !== undefined ? config.smtpSecure : port === 465;

    const isConfigured = Boolean(user && pass && host);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: isConfigured
        ? {
            user,
            pass,
          }
        : undefined,
      tls: {
        rejectUnauthorized: false,
      },
    });

    const fromEmail = config.smtpFromEmail || process.env.SMTP_FROM || user || 'suporte@paineltv.ddns.net';
    const fromName = config.smtpFromName || 'Painel TV Oficial';

    return {
      transporter,
      isConfigured,
      from: `"${fromName}" <${fromEmail}>`,
      serverUrl: config.clientPortalUrl || config.serverUrl || 'http://paineltv.ddns.net',
      config,
    };
  }

  /**
   * E-MAIL 1: Mensagem de Boas-Vindas ao Criar Login / Conta no Portal
   * Enviado imediatamente quando a pessoa se cadastra no site
   */
  public async sendAccountWelcomeEmail(
    customer: Customer,
    plainPassword?: string
  ): Promise<{ success: boolean; message: string }> {
    if (!customer.email || !customer.email.includes('@')) {
      return { success: false, message: 'Cliente não possui e-mail válido cadastrado.' };
    }

    const { transporter, isConfigured, from, serverUrl, config } = this.getTransporter();
    if (config.emailNotifyWelcomeAccount === false) {
      return { success: true, message: 'Notificação de boas-vindas desativada nas configurações.' };
    }
    const loginUrl = serverUrl.startsWith('http') ? serverUrl : `http://paineltv.ddns.net`;
    const passwordToShow = plainPassword || customer.portalPassword || 'Sua senha cadastrada';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; color: #f4f4f5; }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); padding: 36px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0 0; color: #e0e7ff; font-size: 14px; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 18px; color: #f4f4f5; margin-bottom: 16px; font-weight: bold; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; background-color: #6366f120; border: 1px solid #6366f150; color: #a5b4fc; font-size: 12px; font-weight: bold; margin-bottom: 20px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #27272a; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: #a1a1aa; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .value { color: #ffffff; font-family: monospace; font-size: 13px; font-weight: bold; }
    .btn { display: block; text-align: center; background-color: #6366f1; color: #ffffff !important; text-decoration: none; font-weight: bold; font-size: 15px; padding: 14px 28px; border-radius: 12px; margin: 24px 0; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }
    .features-card { background-color: #1c1917; border: 1px solid #44403c; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px; color: #d6d3d1; }
    .features-card strong { color: #fafaf9; }
    .footer { background-color: #09090b; padding: 20px 24px; text-align: center; font-size: 11px; color: #71717a; border-top: 1px solid #27272a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Bem-vindo ao Portal IPTV!</h1>
      <p>Sua conta foi criada com sucesso</p>
    </div>
    
    <div class="body">
      <div class="greeting">
        Olá, ${customer.name}! 👋
      </div>

      <div class="badge">
        ✨ Cadastro Confirmado no Portal
      </div>

      <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
        Seja muito bem-vindo à nossa plataforma! Sua conta de acesso exclusivo ao portal do assinante já está ativa.
      </p>

      <div class="card">
        <div style="font-size: 13px; font-weight: bold; color: #818cf8; margin-bottom: 12px; text-transform: uppercase;">
          🔐 Seus Dados de Login no Portal:
        </div>
        <div class="row">
          <span class="label">Site do Portal:</span>
          <a href="${loginUrl}" target="_blank" style="color: #818cf8; font-weight: bold; font-family: monospace; text-decoration: underline;">${loginUrl}</a>
        </div>
        <div class="row">
          <span class="label">Seu E-mail / Login:</span>
          <span class="value" style="color: #38bdf8;">${customer.email}</span>
        </div>
        <div class="row">
          <span class="label">Sua Senha de Acesso:</span>
          <span class="value" style="color: #34d399;">${passwordToShow}</span>
        </div>
      </div>

      <a href="${loginUrl}" target="_blank" class="btn">
        👉 Acessar Meu Portal do Assinante
      </a>

      <div class="features-card">
        <strong style="font-size: 14px; display: block; margin-bottom: 10px; color: #ffffff;">
          🌟 O que você pode fazer na sua Área do Assinante:
        </strong>
        <ul style="margin: 0; padding-left: 20px; line-height: 1.7;">
          <li><strong>Consultar Pontos de TV:</strong> Veja todos os seus usuários, senhas e status em tempo real.</li>
          <li><strong>Renovação Automática via PIX:</strong> Assine ou renove seu plano a qualquer momento sem precisar esperar atendentes no WhatsApp.</li>
          <li><strong>Lembretes Inteligentes:</strong> Receba notificações de vencimento por e-mail para não perder seus programas favoritos.</li>
          <li><strong>Tutoriais de Instalação:</strong> Acesse o guia completo para configurar na sua Smart TV, Celular ou Computador.</li>
        </ul>
      </div>

      <div style="background-color: #1e1b4b25; border: 1px solid #4338ca40; border-radius: 12px; padding: 14px; margin-top: 20px; font-size: 12px; color: #c7d2fe; text-align: center;">
        ℹ️ <em>Também enviamos em um <strong>outro e-mail separado</strong> os dados específicos do seu Teste IPTV com usuário, senha e instruções completas para assistir agora!</em>
      </div>
    </div>

    <div class="footer">
      Portal Oficial IPTV • Todos os direitos reservados.<br>
      Acesse o site: <a href="${loginUrl}" style="color: #818cf8;">${loginUrl}</a>
    </div>
  </div>
</body>
</html>
    `;

    try {
      if (!isConfigured) {
        db.addLog(
          'INFO',
          `[E-MAIL SIMULADO] Boas-vindas da conta enviado para ${customer.email} (SMTP desativado)`
        );
        return { success: true, message: 'Boas-vindas registradas (SMTP desativado)' };
      }

      await transporter.sendMail({
        from,
        to: customer.email,
        subject: `🎉 Bem-vindo ao Portal ! Sua conta foi criada com sucesso`,
        html,
      });

      db.addLog('SUCCESS', `[E-MAIL] Mensagem de boas-vindas da conta enviada para ${customer.email} (${customer.name})`);
      return { success: true, message: `E-mail de boas-vindas enviado para ${customer.email}!` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('WARN', `[E-MAIL ERRO] Falha ao enviar boas-vindas para ${customer.email}: ${msg}`);
      return { success: false, message: `Erro no envio de boas-vindas: ${msg}` };
    }
  }

  /**
   * E-MAIL 2: Mensagem com os Dados do Teste IPTV Gerado e Link para o Site
   * Enviado em um e-mail separado quando o teste é gerado
   */
  public async sendTestGeneratedEmail(
    customer: Customer,
    access: IptvAccess
  ): Promise<{ success: boolean; message: string }> {
    if (!customer.email || !customer.email.includes('@')) {
      return { success: false, message: 'Cliente não possui e-mail válido cadastrado.' };
    }

    const { transporter, isConfigured, from, serverUrl, config } = this.getTransporter();
    if (config.emailNotifyTestCreated === false) {
      return { success: true, message: 'Notificação de teste gerado desativada nas configurações.' };
    }
    const loginUrl = serverUrl.startsWith('http') ? serverUrl : `http://paineltv.ddns.net`;
    const serverHost = config.defaultServerHost || 'http://anverif.top';
    const dnsHost = config.defaultDnsHost || 'http://satq.top';
    const webPlayerUrl = config.webPlayerUrl || 'http://navegauni.top/';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; color: #f4f4f5; }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #1e40af 100%); padding: 36px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0 0; color: #e0f2fe; font-size: 14px; }
    .body { padding: 32px 24px; }
    .greeting { font-size: 18px; color: #f4f4f5; margin-bottom: 16px; font-weight: bold; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; background-color: #10b98125; border: 1px solid #10b98150; color: #34d399; font-size: 12px; font-weight: bold; margin-bottom: 20px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #27272a; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .label { color: #a1a1aa; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .value { color: #ffffff; font-family: monospace; font-size: 14px; font-weight: bold; }
    .btn { display: block; text-align: center; background-color: #0284c7; color: #ffffff !important; text-decoration: none; font-weight: bold; font-size: 15px; padding: 14px 28px; border-radius: 12px; margin: 24px 0; box-shadow: 0 4px 14px rgba(2, 132, 199, 0.4); }
    .instruction-card { background-color: #18181b; border: 1px solid #38bdf840; border-radius: 12px; padding: 18px; margin: 20px 0; font-size: 13px; color: #e2e8f0; }
    .instruction-card strong { color: #38bdf8; }
    .footer { background-color: #09090b; padding: 20px 24px; text-align: center; font-size: 11px; color: #71717a; border-top: 1px solid #27272a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📺 Seu Teste está Pronto!</h1>
      <p>Dados de Acesso & Instruções para Assistir</p>
    </div>
    
    <div class="body">
      <div class="greeting">
        Olá, ${customer.name}! 🎉
      </div>

      <div class="badge">
        ✨ Teste TV de Alta Definição Liberado
      </div>

      <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
        Seu teste foi gerado e já está totalmente ativo em nosso servidor. Você pode configurar agora mesmo no seu aplicativo ou Smart TV para conferir a qualidade sem travamentos de toda a grade com canais em 4K, filmes, séries e esportes ao vivo.
      </p>

      <!-- Card com Dados do Teste -->
      <div class="card">
        <div style="font-size: 13px; font-weight: bold; color: #38bdf8; margin-bottom: 12px; text-transform: uppercase;">
          🔑 Dados de Acesso do Teste IPTV:
        </div>
        <div class="row">
          <span class="label">Usuário IPTV:</span>
          <span class="value" style="color: #38bdf8;">${access.iptvUsername}</span>
        </div>
        <div class="row">
          <span class="label">Senha do Teste:</span>
          <span class="value" style="color: #34d399;">${access.iptvPassword || '123456'}</span>
        </div>
        <div class="row">
          <span class="label">Servidor / DNS:</span>
          <span class="value">${dnsHost}</span>
        </div>
        <div class="row">
          <span class="label">Válido até:</span>
          <span class="value" style="color: #fbbf24;">${access.expirationDate}</span>
        </div>
        <div class="row">
          <span class="label">Link do Site:</span>
          <a href="${loginUrl}" target="_blank" style="color: #38bdf8; font-family: monospace; font-weight: bold; text-decoration: underline;">${loginUrl}</a>
        </div>
      </div>

      <!-- Botão para o site -->
      <a href="${loginUrl}" target="_blank" class="btn">
        👉 Entrar no Site & Ativar Plano via PIX
      </a>

      <!-- Guia Rápido de Instalação -->
      <div class="instruction-card">
        <strong style="font-size: 14px; display: block; margin-bottom: 10px;">
          📱 Como Começar a Assistir Agora Mesmo:
        </strong>
        <ul style="margin: 0; padding-left: 20px; line-height: 1.7;">
          <li>
            <strong>Smart TV (Samsung ou LG):</strong> Baixe na loja de aplicativos da TV o app <em>Pixel Player</em>, <em>Prime IPTV</em> ou <em>IBO Player</em> e informe seu usuário e senha.
          </li>
          <li>
            <strong>TV Box / Android / Fire Stick:</strong> Baixe o aplicativo <em>XCIPTV</em> ou <em>IPTV Smarters Pro</em>, selecione "Entrar com Xtream Codes API", insira seu usuário e senha e no campo URL informe: <code>${dnsHost}</code>
          </li>
          <li>
            <strong>No Computador via Navegador (Web):</strong> Assista diretamente pelo web player oficial: <a href="${webPlayerUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline;">${webPlayerUrl}</a>
          </li>
        </ul>
      </div>

      <!-- Aviso de Renovação Direta no Site -->
      <div style="background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 16px; margin-top: 20px; font-size: 13px; color: #a1a1aa; line-height: 1.5;">
        ⚡ <strong>Gostou do Teste?</strong><br>
        Acesse nosso site em <a href="${loginUrl}" target="_blank" style="color: #38bdf8;">${loginUrl}</a>, faça login com seu e-mail e ative sua assinatura mensal, trimestral ou anual com liberação imediata via PIX automático!
      </div>
    </div>

    <div class="footer">
      Painel Oficial • Link do Site: <a href="${loginUrl}" style="color: #38bdf8;">${loginUrl}</a><br>
      Aproveite seu teste sem compromisso!
    </div>
  </div>
</body>
</html>
    `;

    try {
      if (!isConfigured) {
        db.addLog(
          'INFO',
          `[E-MAIL SIMULADO] Dados do teste IPTV enviados para ${customer.email} (Usuário: ${access.iptvUsername}, Validade: ${access.expirationDate})`
        );
        return { success: true, message: 'Dados do teste registrados (SMTP desativado)' };
      }

      await transporter.sendMail({
        from,
        to: customer.email,
        subject: `📺 Seu Teste TV está Liberado! Dados de Acesso e Link do Site`,
        html,
      });

      db.addLog('SUCCESS', `[E-MAIL] Dados do teste IPTV enviados para ${customer.email} (${customer.name} - ${access.iptvUsername})`);
      return { success: true, message: `Dados do teste enviados para ${customer.email}!` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('WARN', `[E-MAIL ERRO] Falha ao enviar dados do teste para ${customer.email}: ${msg}`);
      return { success: false, message: `Erro no envio dos dados do teste: ${msg}` };
    }
  }

  /**
   * Método de conveniência para enviar ambos os e-mails (Boas-Vindas da Conta + Dados do Teste)
   */
  public async sendTestWelcomeEmail(
    customer: Customer,
    access: IptvAccess,
    plainPassword?: string
  ): Promise<{ success: boolean; message: string }> {
    // Dispara o e-mail 1 de boas-vindas da conta
    const r1 = await this.sendAccountWelcomeEmail(customer, plainPassword);
    // Dispara o e-mail 2 com os dados do teste e link do site
    const r2 = await this.sendTestGeneratedEmail(customer, access);

    return {
      success: r1.success || r2.success,
      message: `${r1.message} | ${r2.message}`,
    };
  }
  public async testSmtpConnection(targetEmail: string, configOverride?: Partial<SystemConfig>): Promise<{ success: boolean; message: string }> {
    try {
      const { transporter, isConfigured, from, serverUrl } = this.getTransporter(configOverride);

      if (!isConfigured) {
        return {
          success: false,
          message: 'Credenciais de SMTP (Usuário e Senha) não estão preenchidas nas Configurações.',
        };
      }

      await transporter.verify();

      const html = `
        <div style="font-family: Arial, sans-serif; background-color: #09090b; color: #f4f4f5; padding: 24px; border-radius: 12px; max-width: 600px; margin: 0 auto; border: 1px solid #27272a;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #6366f1; margin: 0;">Painel de TV</h2>
            <p style="color: #a1a1aa; font-size: 13px;">Teste de Conexão SMTP</p>
          </div>
          <div style="background-color: #18181b; border: 1px solid #3f3f46; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="color: #10b981; font-weight: bold; margin-top: 0;">✅ Conexão estabelecida com sucesso!</p>
            <p style="color: #d4d4d8; font-size: 13px; line-height: 1.5;">
              Este é um e-mail de teste para validar o envio automático de credenciais de novos clientes e notificações de vencimento (7 dias, 3 dias e hoje).
            </p>
            <p style="color: #a1a1aa; font-size: 12px;"><strong>URL do Sistema:</strong> ${serverUrl}</p>
          </div>
          <p style="font-size: 11px; color: #71717a; text-align: center;">Enviado pelo sistema de automação IPTV em ${new Date().toLocaleString('pt-BR')}</p>
        </div>
      `;

      await transporter.sendMail({
        from,
        to: targetEmail,
        subject: '✅ Teste de Envio de E-mail - Painel TV',
        html,
      });

      return {
        success: true,
        message: `E-mail de teste enviado com sucesso para ${targetEmail}!`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Falha ao conectar ao servidor SMTP: ${msg}`,
      };
    }
  }

  /**
   * Envia e-mail de aviso de vencimento (7 dias, 3 dias ou Hoje)
   */
  public async sendExpirationReminderEmail(
    customer: Customer,
    access: IptvAccess,
    reminderType: '7_DAYS' | '3_DAYS' | '0_DAYS'
  ): Promise<{ success: boolean; message: string }> {
    if (!customer.email || !customer.email.includes('@')) {
      return { success: false, message: 'Cliente sem e-mail cadastrado.' };
    }

    const { transporter, isConfigured, from, serverUrl } = this.getTransporter();
    const loginUrl = serverUrl.startsWith('http') ? serverUrl : `http://paineltv.ddns.net`;

    let badgeColor = '#f59e0b';
    let badgeText = '⚠️ Faltam 7 dias para vencer';
    let subject = `⚠️ Seu Plano IPTV vence em 7 dias! Renove com facilidade via PIX`;
    let urgencyMessage = `Seu acesso TV está próximo da data de vencimento (faltam 7 dias). Garanta a continuidade do seu sinal renovando com antecedência de forma 100% automática!`;

    if (reminderType === '3_DAYS') {
      badgeColor = '#f97316';
      badgeText = '🚨 Faltam apenas 3 dias';
      subject = `🚨 ATENÇÃO: Faltam 3 dias para o vencimento da TV`;
      urgencyMessage = `Faltam apenas 3 dias para o término da validade do seu ponto de TV. Evite interrupções no fim de semana ou jogos ao vivo gerando seu PIX instantâneo no portal.`;
    } else if (reminderType === '0_DAYS') {
      badgeColor = '#ef4444';
      badgeText = '🔴 Vence HOJE!';
      subject = `🔴 URGENTE: Seu plano TV vence HOJE (${access.expirationDate.split(' ')[0]})`;
      urgencyMessage = `Hoje é a data de vencimento do seu plano TV! Renove agora mesmo pelo portal com ativação automática via PIX para não ficar sem seus canais favoritos.`;
    }

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; color: #f4f4f5; }
    .header { background: #18181b; padding: 28px 24px; text-align: center; border-bottom: 1px solid #27272a; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; }
    .body { padding: 32px 24px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; background-color: ${badgeColor}25; border: 1px solid ${badgeColor}50; color: ${badgeColor}; font-size: 13px; font-weight: bold; margin-bottom: 16px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #27272a; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .btn { display: block; text-align: center; background-color: #10b981; color: #ffffff !important; text-decoration: none; font-weight: bold; font-size: 16px; padding: 15px 28px; border-radius: 12px; margin: 24px 0; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
    .footer { background-color: #09090b; padding: 20px 24px; text-align: center; font-size: 11px; color: #71717a; border-top: 1px solid #27272a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📺 Painel do Assinante </h1>
      <p style="margin: 6px 0 0 0; color: #a1a1aa; font-size: 13px;">Aviso de Vencimento de Assinatura</p>
    </div>

    <div class="body">
      <div class="badge">${badgeText}</div>

      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #ffffff;">Olá, ${customer.name}!</h2>
      <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0;">
        ${urgencyMessage}
      </p>

      <div class="card">
        <div style="font-size: 12px; font-weight: bold; color: #a1a1aa; text-transform: uppercase; margin-bottom: 10px;">
          📋 Dados do Seu Acesso IPTV:
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Ponto / Tela:</span>
          <strong style="color: #ffffff;">${access.name || 'TV Principal'}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Usuário:</span>
          <strong style="color: #38bdf8; font-family: monospace;">${access.iptvUsername}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Data de Vencimento:</span>
          <strong style="color: ${badgeColor}; font-family: monospace;">${access.expirationDate}</strong>
        </div>
      </div>

      <div style="background-color: #1e1b4b20; border: 1px solid #4338ca50; border-radius: 12px; padding: 16px; margin-bottom: 20px;">
        <div style="font-size: 13px; font-weight: bold; color: #a5b4fc; margin-bottom: 6px;">
          ⚡ Renovação Imediata via PIX:
        </div>
        <p style="color: #c7d2fe; font-size: 12px; line-height: 1.5; margin: 0;">
          Você não precisa esperar ninguém responder no WhatsApp! Entre no portal, selecione seu ponto, gere o código PIX Copia e Cola e seu acesso é renovado em segundos após o pagamento.
        </p>
      </div>

      <a href="${loginUrl}" target="_blank" class="btn">
        ⚡ Renovar Meu Acesso com PIX no Portal
      </a>

      <p style="font-size: 12px; color: #a1a1aa; text-align: center; margin: 0;">
        Login com seu e-mail: <strong style="color: #ffffff;">${customer.email}</strong>
      </p>
    </div>

    <div class="footer">
      Painel TV • Acesse seu portal em <a href="${loginUrl}" style="color: #818cf8;">${loginUrl}</a>
    </div>
  </div>
</body>
</html>
    `;

    try {
      if (!isConfigured) {
        db.addLog(
          'INFO',
          `[E-MAIL SIMULADO] Notificação ${reminderType} para ${customer.email} (Usuário: ${access.iptvUsername}, Vence em: ${access.expirationDate})`
        );
        return { success: true, message: 'Notificação registrada (SMTP desativado)' };
      }

      await transporter.sendMail({
        from,
        to: customer.email,
        subject,
        html,
      });

      db.addLog(
        'SUCCESS',
        `[E-MAIL] Notificação de vencimento (${reminderType}) enviada para ${customer.email} (${customer.name} - ${access.iptvUsername})`
      );
      return { success: true, message: `E-mail enviado para ${customer.email}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('WARN', `[E-MAIL ERRO] Falha ao enviar lembrete de vencimento para ${customer.email}: ${msg}`);
      return { success: false, message: `Erro ao enviar e-mail: ${msg}` };
    }
  }

  /**
   * Envia confirmação de pagamento PIX e renovação de acesso com sucesso
   */
  public async sendPaymentApprovedEmail(
    customer: Customer,
    access: IptvAccess,
    payment: Payment
  ): Promise<{ success: boolean; message: string }> {
    if (!customer.email || !customer.email.includes('@')) {
      return { success: false, message: 'Cliente sem e-mail cadastrado.' };
    }

    const { transporter, isConfigured, from, serverUrl, config } = this.getTransporter();
    if (config.emailNotifyPaymentApproved === false) {
      return { success: true, message: 'Notificação de renovação/pagamento desativada nas configurações.' };
    }

    // Deduplicação: evitar envios repetidos da mesma renovação dentro da mesma sessão
    const deduplicationKey = `${customer.id}_${access.id}_${payment.id}_${access.expirationDate}`;
    if (this.sentApprovalEmails.has(deduplicationKey)) {
      return { success: true, message: 'E-mail de confirmação já enviado anteriormente.' };
    }
    this.sentApprovalEmails.add(deduplicationKey);

    const loginUrl = serverUrl.startsWith('http') ? serverUrl : `http://paineltv.ddns.net`;
    const dnsHost = config.defaultDnsHost || 'http://satq.top';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .container { max-width: 600px; margin: 20px auto; background-color: #121215; border: 1px solid #27272a; border-radius: 16px; overflow: hidden; color: #f4f4f5; }
    .header { background: linear-gradient(135deg, #10b981 0%, #047857 100%); padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: bold; }
    .body { padding: 32px 24px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 9999px; background-color: #10b98125; border: 1px solid #10b98150; color: #34d399; font-size: 12px; font-weight: bold; margin-bottom: 20px; }
    .card { background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; padding: 20px; margin: 20px 0; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #27272a; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .btn { display: block; text-align: center; background-color: #6366f1; color: #ffffff !important; text-decoration: none; font-weight: bold; font-size: 15px; padding: 14px 28px; border-radius: 12px; margin: 24px 0; }
    .footer { background-color: #09090b; padding: 20px 24px; text-align: center; font-size: 11px; color: #71717a; border-top: 1px solid #27272a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎉 Plano Renovado com Sucesso!</h1>
      <p style="margin: 6px 0 0 0; color: #d1fae5; font-size: 14px;">Seu Acesso foi Renovado e já está Ativo</p>
    </div>

    <div class="body">
      <div class="badge">
        ✅ Assinatura Renovada com Sucesso
      </div>

      <h2 style="margin: 0 0 12px 0; font-size: 18px; color: #ffffff;">Olá, ${customer.name}! 👋</h2>
      <p style="color: #d4d4d8; font-size: 14px; line-height: 1.6; margin: 0;">
        Confirmamos o seu pagamento de <strong>R$ ${payment.amount.toFixed(2)}</strong>! A renovação do seu plano foi aplicada e o seu sinal continua <strong>100% liberado</strong> sem interrupções.
      </p>

      <div class="card">
        <div style="font-size: 12px; font-weight: bold; color: #10b981; text-transform: uppercase; margin-bottom: 10px;">
          📺 Detalhes da Renovação Aplicada:
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Ponto:</span>
          <strong style="color: #ffffff;">${access.name || 'Ponto Principal'}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Usuário IPTV:</span>
          <strong style="color: #38bdf8; font-family: monospace;">${access.iptvUsername}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Nova Data de Vencimento:</span>
          <strong style="color: #10b981; font-family: monospace; font-size: 14px;">${access.expirationDate}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Plano:</span>
          <strong style="color: #ffffff;">${payment.planName || 'Mensal'}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Valor Pago:</span>
          <strong style="color: #34d399;">R$ ${payment.amount.toFixed(2)}</strong>
        </div>
        <div class="row">
          <span style="color: #a1a1aa;">Servidor / DNS:</span>
          <span style="color: #d4d4d8;">${dnsHost}</span>
        </div>
      </div>

      <div style="background-color: #064e3b25; border: 1px solid #05966940; border-radius: 12px; padding: 14px; margin-top: 16px; font-size: 13px; color: #a7f3d0;">
        💡 <strong>Precisa configurar algo na TV?</strong><br>
        Não! Seu acesso é atualizado automaticamente no servidor. Você pode continuar assistindo normalmente a todos os seus canais, filmes e séries favoritos.
      </div>

      <a href="${loginUrl}" target="_blank" class="btn">
        👉 Acessar Meu Portal do Assinante
      </a>
    </div>

    <div class="footer">
      Painel TV • Acesse seu portal em <a href="${loginUrl}" style="color: #818cf8;">${loginUrl}</a>
    </div>
  </div>
</body>
</html>
    `;

    try {
      if (!isConfigured) {
        db.addLog('INFO', `[E-MAIL SIMULADO] Confirmação de renovação enviada para ${customer.email} (R$ ${payment.amount.toFixed(2)}, Vencimento: ${access.expirationDate})`);
        return { success: true, message: 'Confirmação registrada (SMTP desativado)' };
      }

      await transporter.sendMail({
        from,
        to: customer.email,
        subject: `🎉 Plano Renovado com Sucesso! Vencimento estendido até ${access.expirationDate.split(' ')[0]}`,
        html,
      });

      db.addLog('SUCCESS', `[E-MAIL] Confirmação de renovação enviada com sucesso para ${customer.email} (${customer.name} - R$ ${payment.amount.toFixed(2)})`);
      return { success: true, message: `E-mail enviado para ${customer.email}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      db.addLog('WARN', `[E-MAIL ERRO] Falha ao enviar confirmação de renovação para ${customer.email}: ${msg}`);
      return { success: false, message: `Erro ao enviar e-mail: ${msg}` };
    }
  }
}

export const emailService = new EmailService();
