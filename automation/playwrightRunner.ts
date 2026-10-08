import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import { chromium, BrowserContext, Page } from 'playwright';
import { IptvConnectionStatus, AutomationDiagnostic, SyncResult } from '../src/types';
import { db } from '../backend/database';

export interface RenewalStepResult {
  step: number;
  totalSteps: number;
  action: string;
  beforeDate: string;
  afterDate: string;
  success: boolean;
  message: string;
}

export interface PlaywrightRunOptions {
  panelUrl?: string;
  profileDir?: string;
  headless?: boolean;
}

export interface ExtractedIptvUser {
  iptvUsername: string;
  password?: string;
  statusText: string;
  notes?: string;
  expirationDate: string;
  createdAt?: string;
}

export interface RealTestGenerationRequest {
  testRequestId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  note?: string;
}

export interface RealTestGenerationResult {
  success: boolean;
  testRequestId: string;
  customerId: string;
  username: string;
  password: string;
  expirationDate: string;
  statusText?: string;
  note?: string;
  rawModalText?: string;
  rawModalHtml?: string;
  error?: string;
}

export const IPTV_REAL_KEYS = {
  TOKEN: '372a8eb9ccd066d576409eead9568a13',
  EXPIRES_IN: '95034f28425eff7cb764d5e43350a3be',
  USER_ID: '5f763196fb33bbd9799e135c3dd1c6fc',
  USER_NAME: '9d04a835c47e29b98a9c4f390aa6d16a',
  USER_ROLE: '35bbdc7b0c20170105b9127ca39aad64',
  USER_PERMISSIONS: '70D2F040B31328EEEF461C0758EA82FB',
  REG_PASS: '120asidj0sad0912j90d12',
  MASTER_ID: 'paosdkp1230980aisjdljn123nnasid',
  WHATSAPP: 'aiasduh182736ausygdg1khb872',
  DARK_MODE: 'true',
};

export const AUTH_KEYS_LIST = [
  IPTV_REAL_KEYS.TOKEN,
  IPTV_REAL_KEYS.EXPIRES_IN,
  IPTV_REAL_KEYS.USER_ID,
  IPTV_REAL_KEYS.USER_NAME,
  IPTV_REAL_KEYS.USER_ROLE,
  IPTV_REAL_KEYS.USER_PERMISSIONS,
  IPTV_REAL_KEYS.REG_PASS,
  IPTV_REAL_KEYS.MASTER_ID,
  IPTV_REAL_KEYS.WHATSAPP,
  'AUTH_TOKEN',
  'AUTH_USER_ID',
  'AUTH_USER_NAME',
  'AUTH_MASTER_ID',
  'AUTH_REG_PASS',
  'AUTH_WHATSAPP',
  'AUTH_USER_ROLE',
  'AUTH_USER_PERMISSIONS',
];

export interface IptvSessionVault {
  savedAt: string;
  panelUrl: string;
  username?: string;
  password?: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: any[];
  hasAuthToken: boolean;
  userId?: string;
}

export class IptvAutomationService {
  private panelUrl: string;
  private profileDir: string;
  private vaultPath: string;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private connectionStatus: IptvConnectionStatus = 'DESCONECTADO';
  private lastError: string | null = null;
  private operationMutex: Promise<void> = Promise.resolve();
  private lockStorage = new AsyncLocalStorage<symbol>();
  private activeLockSymbol: symbol | null = null;
  private intentionalDisconnect: boolean = false;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private lastAnalyticsPing: number = 0;

  constructor(options?: PlaywrightRunOptions) {
    this.panelUrl =
      options?.panelUrl ||
      process.env.IPTV_PANEL_URL ||
      'https://searchdefense.top/#/users-iptv';

    this.profileDir =
      options?.profileDir ||
      process.env.IPTV_PROFILE_DIR ||
      path.join(process.cwd(), 'backend', 'data', 'iptv-browser-profile');

    this.vaultPath = path.join(process.cwd(), 'backend', 'data', 'iptv-session-vault.json');

    // Garantir que o diretório persistente e isolado existe
    try {
      if (!fs.existsSync(this.profileDir)) {
        fs.mkdirSync(this.profileDir, { recursive: true });
      }
      const dataDir = path.dirname(this.vaultPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
    } catch (e) {
      console.error('[IPTV ERROR] Falha ao criar diretório de perfil persistente:', e);
    }

    // Iniciar watchdog para garantir permanência 24/7 do navegador
    this.startWatchdog();
  }

  public startWatchdog() {
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(async () => {
      // Se não houve desconexão manual intencional e o status deveria estar ativo/conectando
      if (!this.intentionalDisconnect && this.connectionStatus !== 'DESCONECTADO') {
        if (!this.context || !this.page || this.page.isClosed()) {
          console.log('[WATCHDOG] Navegador inativo ou encerrado inesperadamente. Reabrindo sessão persistente...');
          try {
            await this.connectBrowser();
          } catch (e) {
            console.error('[WATCHDOG ERROR] Falha ao reabrir navegador:', e);
          }
        }
      }
    }, 15000);
  }

  public getVaultPath(): string {
    return this.vaultPath;
  }

  public loadSessionVault(): IptvSessionVault | null {
    try {
      if (fs.existsSync(this.vaultPath)) {
        const raw = fs.readFileSync(this.vaultPath, 'utf8');
        return JSON.parse(raw) as IptvSessionVault;
      }
    } catch {
      // ignore
    }
    return null;
  }

  public getVaultStatus(): {
    exists: boolean;
    savedAt?: string;
    hasAuthToken: boolean;
    userId?: string;
    username?: string;
    cookieCount: number;
    storageKeyCount: number;
  } {
    const vault = this.loadSessionVault();
    if (!vault) {
      return {
        exists: false,
        hasAuthToken: false,
        cookieCount: 0,
        storageKeyCount: 0,
      };
    }
    const hasAuth = vault.hasAuthToken || !!(
      vault.localStorage && (
        vault.localStorage[IPTV_REAL_KEYS.USER_ID] ||
        vault.localStorage[IPTV_REAL_KEYS.TOKEN] ||
        vault.localStorage['AUTH_USER_ID']
      )
    );

    return {
      exists: true,
      savedAt: vault.savedAt,
      hasAuthToken: hasAuth,
      userId: vault.userId || vault.localStorage?.[IPTV_REAL_KEYS.USER_ID],
      username: vault.username,
      cookieCount: vault.cookies ? vault.cookies.length : 0,
      storageKeyCount: vault.localStorage ? Object.keys(vault.localStorage).length : 0,
    };
  }

  /**
   * Salva o snapshot completo da sessão ativa (tokens, localStorage, sessionStorage, cookies)
   * em um arquivo json seguro e persistente.
   */
  public async saveSessionVault(page?: Page, context?: BrowserContext): Promise<boolean> {
    try {
      const p = page || this.page;
      const ctx = context || this.context;
      if (!p || p.isClosed()) return false;

      const pageUrl = p.url();
      if (!pageUrl.includes('searchdefense.top')) return false;

      const storageData = await p.evaluate(() => {
        const local: Record<string, string> = {};
        const session: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k) local[k] = localStorage.getItem(k) || '';
        }
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k) session[k] = sessionStorage.getItem(k) || '';
        }

        // Tentar capturar campos preenchidos na tela
        const uInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Usuário"], input[name="username"], input[name="login"], input[name="user"], input#username, input[type="text"]'
        );
        const pInput = document.querySelector<HTMLInputElement>(
          'input[placeholder="Senha"], input[name="password"], input#password, input[type="password"]'
        );

        return {
          local,
          session,
          typedUser: uInput?.value?.trim() || '',
          typedPass: pInput?.value?.trim() || '',
        };
      }).catch(() => null);

      if (!storageData) return false;

      const cookies = ctx ? await ctx.cookies().catch(() => []) : [];
      const hasAuthToken = !!(
        (storageData.local[IPTV_REAL_KEYS.USER_ID] && storageData.local[IPTV_REAL_KEYS.USER_ID] !== '') ||
        (storageData.local[IPTV_REAL_KEYS.TOKEN] && storageData.local[IPTV_REAL_KEYS.TOKEN] !== '') ||
        (storageData.local['AUTH_TOKEN'] && storageData.local['AUTH_TOKEN'] !== '') ||
        (storageData.local['AUTH_USER_ID'] && storageData.local['AUTH_USER_ID'] !== '')
      );

      // Se usuário digitou credenciais na tela, gravar no banco local imediatamente!
      if (storageData.typedUser && storageData.typedPass) {
        const cfg = db.getConfig();
        if (
          cfg.iptvPanelUsername !== storageData.typedUser ||
          cfg.iptvPanelPassword !== storageData.typedPass
        ) {
          db.updateConfig({
            iptvPanelUsername: storageData.typedUser,
            iptvPanelPassword: storageData.typedPass,
          });
          console.log(`[VAULT] Credenciais capturadas e salvas automaticamente para '${storageData.typedUser}'`);
        }
      }

      const existingVault = this.loadSessionVault();
      const config = db.getConfig();

      // PROTEÇÃO CRÍTICA CONTRA WIPE DO VAULT:
      // Se a página atual NÃO tem token no momento (ex: recarregando ou na tela de login),
      // mas o vault já possuía tokens autenticados, manter os tokens anteriores e não apagá-los!
      let mergedLocal = { ...storageData.local };
      if (!hasAuthToken && existingVault?.hasAuthToken) {
        mergedLocal = { ...existingVault.localStorage, ...mergedLocal };
        for (const authKey of AUTH_KEYS_LIST) {
          if (existingVault.localStorage[authKey] && (!mergedLocal[authKey] || mergedLocal[authKey] === '')) {
            mergedLocal[authKey] = existingVault.localStorage[authKey];
          }
        }
      }

      const effectiveHasAuth = hasAuthToken || !!(existingVault?.hasAuthToken);

      const vault: IptvSessionVault = {
        savedAt: new Date().toISOString(),
        panelUrl: pageUrl,
        username: config.iptvPanelUsername || storageData.typedUser || existingVault?.username || '',
        password: config.iptvPanelPassword || storageData.typedPass || existingVault?.password || '',
        localStorage: mergedLocal,
        sessionStorage: { ...(existingVault?.sessionStorage || {}), ...storageData.session },
        cookies: cookies.length > 0 ? cookies : (existingVault?.cookies || []),
        hasAuthToken: effectiveHasAuth,
        userId: mergedLocal[IPTV_REAL_KEYS.USER_ID] || mergedLocal['AUTH_USER_ID'] || existingVault?.userId,
      };

      if (effectiveHasAuth || Object.keys(mergedLocal).length > 0) {
        fs.writeFileSync(this.vaultPath, JSON.stringify(vault, null, 2), 'utf8');
      }

      return effectiveHasAuth;
    } catch (e) {
      console.error('[VAULT SAVE ERROR]', e);
      return false;
    }
  }

  /**
   * Instala script init no contexto do Playwright para garantir que:
   * 1. localStorage e sessionStorage sejam sempre populados antes da execução de qualquer script (IMUNIDADE A F5);
   * 2. O interceptor do axios ou router não consiga apagar as credenciais com erro transitório (Anti-Wipe);
   * 3. Os campos de login sejam pré-preenchidos e configurados para o gerenciador de senhas do Chromium salvar;
   * 4. O submit/login capture as credenciais digitadas em tempo real.
   */
  private async setupSessionVaultProtection(context: BrowserContext) {
    const vault = this.loadSessionVault();
    const config = db.getConfig();
    const username = config.iptvPanelUsername || vault?.username || '';
    const password = config.iptvPanelPassword || vault?.password || '';

    try {
      await context.exposeFunction('__saveCapturedCredsToBackend', (user: string, pass: string) => {
        if (user && pass) {
          const cfg = db.getConfig();
          if (cfg.iptvPanelUsername !== user || cfg.iptvPanelPassword !== pass) {
            db.updateConfig({ iptvPanelUsername: user, iptvPanelPassword: pass });
            console.log(`[VAULT REALTIME] Credenciais salvas no banco: '${user}'`);
          }
        }
      });
    } catch {
      // Já exposta
    }

    try {
      await context.exposeFunction('__onTokenSavedRealtime', async () => {
        if (this.page && !this.page.isClosed()) {
          await this.saveSessionVault(this.page, context);
        }
      });
    } catch {
      // Já exposta
    }

    await context.addInitScript(
      ({ vaultStorage, savedUser, savedPass, realKeys, authKeysList }) => {
        try {
          // 1. Restaurar localStorage antes de qualquer outro script carregar (IMUNIDADE TOTAL A F5 / RELOAD)
          if (vaultStorage) {
            for (const [key, val] of Object.entries(vaultStorage)) {
              if (val && typeof val === 'string' && val !== '') {
                try {
                  localStorage.setItem(key, val);
                } catch {}
              }
            }
          }

          // 2. Anti-Wipe Reforçado: interceptar removeItem, setItem e clear
          const origRemoveItem = localStorage.removeItem.bind(localStorage);
          const origSetItem = localStorage.setItem.bind(localStorage);
          const origClear = localStorage.clear.bind(localStorage);

          const isProtectedKey = (key: string) => {
            if (!key) return false;
            if (authKeysList.includes(key)) return true;
            if (Object.values(realKeys).includes(key)) return true;
            const lower = key.toLowerCase();
            return lower.includes('auth_') || lower.includes('token');
          };

          localStorage.removeItem = function (key: string) {
            if (isProtectedKey(key)) {
              console.warn('[SESSION VAULT] Remoção bloqueada para manter login permanente:', key);
              return;
            }
            return origRemoveItem(key);
          };

          localStorage.setItem = function (key: string, value: string) {
            if (isProtectedKey(key)) {
              if (!value || value === '' || value === 'null' || value === 'undefined') {
                console.warn('[SESSION VAULT] Limpeza de chave com valor vazio bloqueada:', key);
                return;
              }
              // Notificar salvamento de token válido em tempo real
              try {
                if (typeof (window as any).__onTokenSavedRealtime === 'function') {
                  setTimeout(() => (window as any).__onTokenSavedRealtime(), 200);
                }
              } catch {}
            }
            return origSetItem(key, value);
          };

          localStorage.clear = function () {
            console.warn('[SESSION VAULT] localStorage.clear interceptado! Preservando chaves de autenticação.');
            const backup: Record<string, string> = {};
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && isProtectedKey(k)) {
                backup[k] = localStorage.getItem(k) || '';
              }
            }
            origClear();
            for (const [k, v] of Object.entries(backup)) {
              if (v) origSetItem(k, v);
            }
          };

          // 3. Captura e Auto-preenchimento contínuo de credenciais com suporte a gerenciador de senhas do Chromium
          const setupLoginCaptureAndAutofill = () => {
            try {
              const userInput = document.querySelector<HTMLInputElement>(
                'input[placeholder="Usuário"], input[name="username"], input[name="login"], input[name="user"], input#username, input[type="text"]'
              );
              const passInput = document.querySelector<HTMLInputElement>(
                'input[placeholder="Senha"], input[name="password"], input#password, input[type="password"]'
              );

              // Adicionar atributos padrão para o navegador reconhecer como formulário de login e salvar senha
              if (userInput) {
                userInput.setAttribute('autocomplete', 'username');
                userInput.setAttribute('name', 'username');
              }
              if (passInput) {
                passInput.setAttribute('autocomplete', 'current-password');
                passInput.setAttribute('name', 'password');
              }

              // Auto-preenchimento se houver credenciais salvas
              if (userInput && savedUser && (!userInput.value || userInput.value === '')) {
                userInput.value = savedUser;
                userInput.dispatchEvent(new Event('input', { bubbles: true }));
                userInput.dispatchEvent(new Event('change', { bubbles: true }));
              }

              if (passInput && savedPass && (!passInput.value || passInput.value === '')) {
                passInput.value = savedPass;
                passInput.dispatchEvent(new Event('input', { bubbles: true }));
                passInput.dispatchEvent(new Event('change', { bubbles: true }));
              }

              // Capturar o que o usuário digita na hora e enviar ao backend
              const captureCurrent = () => {
                const u = userInput?.value?.trim();
                const p = passInput?.value?.trim();
                if (u && p) {
                  try {
                    if (typeof (window as any).__saveCapturedCredsToBackend === 'function') {
                      (window as any).__saveCapturedCredsToBackend(u, p);
                    }
                  } catch {}
                }
              };

              if (userInput && !(userInput as any).__hasCaptureListener) {
                (userInput as any).__hasCaptureListener = true;
                userInput.addEventListener('input', captureCurrent);
                userInput.addEventListener('change', captureCurrent);
              }
              if (passInput && !(passInput as any).__hasCaptureListener) {
                (passInput as any).__hasCaptureListener = true;
                passInput.addEventListener('input', captureCurrent);
                passInput.addEventListener('change', captureCurrent);
              }

              // Captura no botão de submeter
              const submitBtn = document.querySelector<HTMLButtonElement>(
                'button:has-text("Logar"), button:has-text("Entrar"), button[type="submit"]'
              );
              if (submitBtn && !(submitBtn as any).__hasSubmitListener) {
                (submitBtn as any).__hasSubmitListener = true;
                submitBtn.addEventListener('click', captureCurrent);
              }
            } catch {}
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupLoginCaptureAndAutofill);
          } else {
            setupLoginCaptureAndAutofill();
          }
          setInterval(setupLoginCaptureAndAutofill, 700);
        } catch (e) {
          console.error('[VAULT INIT ERROR]', e);
        }
      },
      {
        vaultStorage: vault ? vault.localStorage : null,
        savedUser: username,
        savedPass: password,
        realKeys: IPTV_REAL_KEYS,
        authKeysList: AUTH_KEYS_LIST,
      }
    );
  }

  /**
   * Mutex reentrante para serializar todas as operações assíncronas do Playwright
   * e prevenir qualquer condição de corrida ou concorrência na mesma sessão,
   * sem gerar auto-travamento (deadlock) em chamadas aninhadas (ex: keepAlive -> connectBrowser).
   */
  public async withLock<T>(task: () => Promise<T>): Promise<T> {
    const currentContextSymbol = this.lockStorage.getStore();
    if (currentContextSymbol && currentContextSymbol === this.activeLockSymbol) {
      // Reentrante: O contexto de execução assíncrona atual já possui a trava
      return await task();
    }

    const lockSymbol = Symbol('playwright-lock');
    const previousMutex = this.operationMutex;
    let releaseLock: () => void = () => {};
    this.operationMutex = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    try {
      await previousMutex;
      this.activeLockSymbol = lockSymbol;
      return await this.lockStorage.run(lockSymbol, () => task());
    } finally {
      this.activeLockSymbol = null;
      releaseLock();
    }
  }

  public getConnectionStatus(): {
    status: IptvConnectionStatus;
    panelUrl: string;
    profileDir: string;
    lastError: string | null;
  } {
    return {
      status: this.connectionStatus,
      panelUrl: this.panelUrl,
      profileDir: path.resolve(this.profileDir),
      lastError: this.lastError,
    };
  }

  public setPanelUrl(url: string) {
    this.panelUrl = url;
  }

  public setProfileDir(dir: string) {
    this.profileDir = dir;
    try {
      if (!fs.existsSync(this.profileDir)) {
        fs.mkdirSync(this.profileDir, { recursive: true });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Garante que o binário do Chromium esteja presente no sistema,
   * buscando caminhos conhecidos ou executando a instalação automática do Playwright caso necessário.
   */
  private ensureChromiumInstalled(log: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void): string | undefined {
    try {
      const defaultExec = chromium.executablePath();
      if (defaultExec && fs.existsSync(defaultExec)) {
        return defaultExec;
      }
    } catch {
      // ignore
    }

    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    // Checar caminhos conhecidos em Linux, Windows e containers
    const candidatePaths = [
      process.env.CHROME_BIN,
      process.env.CHROMIUM_PATH,
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      // Windows Google Chrome
      path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      localAppData ? path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      // Windows Microsoft Edge (presente em 100% dos Windows 10/11/Server)
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      localAppData ? path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe') : '',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      // Linux
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/root/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
      '/root/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell',
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
      try {
        if (p && fs.existsSync(p)) {
          log(`[IPTV] Executável do navegador localizado em: ${p}`, 'INFO');
          return p;
        }
      } catch {
        // ignore
      }
    }

    // Se nenhum binário foi encontrado, efetuar a instalação automática
    log('[IPTV] Binário do Chromium não encontrado. Executando instalação automática com Playwright...', 'WARN');
    try {
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      execSync(`${npxCmd} playwright install chromium`, { stdio: 'pipe' });
      try {
        execSync(`${npxCmd} playwright install-deps chromium`, { stdio: 'pipe' });
      } catch {}
      log('[IPTV] Instalação do Chromium Playwright concluída com sucesso!', 'SUCCESS');
      const newExec = chromium.executablePath();
      if (newExec && fs.existsSync(newExec)) {
        return newExec;
      }
    } catch (installErr) {
      log(`[IPTV] Aviso na instalação do Chromium: ${installErr}`, 'WARN');
    }

    return undefined;
  }

  /**
   * Inicializa o contexto persistente com cascata de fallbacks automáticos
   * garantindo funcionamento em Windows Server, VPS Linux, Docker e Desktop.
   */
  private async launchPersistentContextWithFallback(
    fullProfilePath: string,
    headlessMode: boolean,
    launchArgs: string[],
    log: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<BrowserContext> {
    const errors: string[] = [];
    const executablePath = this.ensureChromiumInstalled(log);

    // Tentativa 1: Se detectou executável físico no disco (Chrome, Edge ou Chromium)
    if (executablePath) {
      try {
        log(`[IPTV] 🚀 Tentando iniciar com executável: ${executablePath}`, 'INFO');
        return await chromium.launchPersistentContext(fullProfilePath, {
          headless: headlessMode,
          executablePath,
          viewport: headlessMode ? { width: 1920, height: 1080 } : null,
          args: launchArgs,
          acceptDownloads: true,
          ignoreHTTPSErrors: true,
        });
      } catch (err: any) {
        log(`[IPTV AVISO] Falha com executável direto (${executablePath}): ${err.message}`, 'WARN');
        errors.push(`Executável direto: ${err.message}`);
      }
    }

    // Tentativa 2: Channel 'chrome' (Google Chrome nativo)
    try {
      log('[IPTV] 🚀 Tentando iniciar com channel "chrome" (Google Chrome instalado)...', 'INFO');
      return await chromium.launchPersistentContext(fullProfilePath, {
        channel: 'chrome',
        headless: headlessMode,
        viewport: headlessMode ? { width: 1920, height: 1080 } : null,
        args: launchArgs,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
      });
    } catch (err: any) {
      log(`[IPTV AVISO] Falha com channel "chrome": ${err.message}`, 'WARN');
      errors.push(`Channel chrome: ${err.message}`);
    }

    // Tentativa 3: Channel 'msedge' (Microsoft Edge pré-instalado em todo Windows)
    try {
      log('[IPTV] 🚀 Tentando iniciar com channel "msedge" (Microsoft Edge)...', 'INFO');
      return await chromium.launchPersistentContext(fullProfilePath, {
        channel: 'msedge',
        headless: headlessMode,
        viewport: headlessMode ? { width: 1920, height: 1080 } : null,
        args: launchArgs,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
      });
    } catch (err: any) {
      log(`[IPTV AVISO] Falha com channel "msedge": ${err.message}`, 'WARN');
      errors.push(`Channel msedge: ${err.message}`);
    }

    // Tentativa 4: Chromium padrão embutido do Playwright
    try {
      log('[IPTV] 🚀 Tentando iniciar com Chromium padrão do Playwright...', 'INFO');
      return await chromium.launchPersistentContext(fullProfilePath, {
        headless: headlessMode,
        viewport: headlessMode ? { width: 1920, height: 1080 } : null,
        args: launchArgs,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
      });
    } catch (err: any) {
      log(`[IPTV AVISO] Falha com Chromium padrão: ${err.message}`, 'WARN');
      errors.push(`Chromium padrão: ${err.message}`);
    }

    // Tentativa 5: Instalação sob demanda via Playwright
    log('[IPTV] 📥 Baixando binário do Chromium para execução...', 'WARN');
    try {
      const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      execSync(`${npxCmd} playwright install chromium`, { stdio: 'pipe' });
      try {
        execSync(`${npxCmd} playwright install-deps chromium`, { stdio: 'pipe' });
      } catch {}
      return await chromium.launchPersistentContext(fullProfilePath, {
        headless: headlessMode,
        viewport: headlessMode ? { width: 1920, height: 1080 } : null,
        args: launchArgs,
        acceptDownloads: true,
        ignoreHTTPSErrors: true,
      });
    } catch (finalErr: any) {
      errors.push(`Instalação sob demanda: ${finalErr.message}`);
    }

    throw new Error(`Não foi possível iniciar o navegador em segundo plano. Detalhes: ${errors.join(' | ')}`);
  }

  /**
   * Conecta ao painel IPTV iniciando o navegador Chromium com perfil persistente.
   * Abre janela visível (headless: false) no Windows 11 sem colidir com o Chrome do usuário.
   */
  public async connectBrowser(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    message: string;
    diagnostic?: AutomationDiagnostic;
  }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      try {
        this.connectionStatus = 'CONECTANDO';
        this.lastError = null;

        log('[IPTV] Solicitação de conexão recebida', 'INFO');
        const platform = process.platform;
        log(`[IPTV] Sistema operacional detectado: ${platform}`, 'INFO');
        log('[IPTV] Criando/verificando diretório persistente', 'INFO');

        const fullProfilePath = path.resolve(this.profileDir);
        if (!fs.existsSync(fullProfilePath)) {
          fs.mkdirSync(fullProfilePath, { recursive: true });
        }
        log(`[IPTV] Diretório: ${fullProfilePath}`, 'INFO');

        // 1. Verificar se já existe contexto ativo para reutilizar (Singleton estrito)
        if (this.context) {
          try {
            const pages = this.context.pages();
            if (!this.page || this.page.isClosed()) {
              this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
            }

            if (this.page && !this.page.isClosed()) {
              const currentUrl = this.page.url();
              log(`[IPTV] Navegador já está em execução. URL atual: ${currentUrl}`, 'INFO');

              if (!currentUrl.includes('#/users-iptv') && !currentUrl.includes('searchdefense.top')) {
                log(`[IPTV] Navegando para painel IPTV: ${this.panelUrl}`, 'INFO');
                await this.page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
              }

              // Validar login / status
              await this.updateStatusFromPage();

              // Salvar snapshot da sessão no vault se autenticado
              await this.saveSessionVault(this.page, this.context);

              log(`[IPTV] Título da página: ${await this.page.title().catch(() => 'Painel')}`, 'INFO');
              log('[IPTV] Conexão ativa reutilizada com sucesso', 'SUCCESS');

              const diag = await this.getDiagnostic();
              return {
                success: true,
                message: 'Navegador já conectado e pronto para uso.',
                diagnostic: diag,
              };
            }
          } catch (reuseErr) {
            log(`[IPTV] Instância anterior inativa. Limpando referência...`, 'WARN');
            this.context = null;
            this.page = null;
          }
        }

        // 2. Limpar possíveis arquivos de trava deixados por encerramentos abruptos
        for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
          try {
            const lockFile = path.join(fullProfilePath, lockName);
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile);
            }
          } catch {
            // ignore
          }
        }

        // 3. Determinar modo headless:
        let headlessMode = false;
        if (process.env.HEADLESS === 'true') {
          headlessMode = true;
        } else if (platform === 'win32') {
          headlessMode = false;
        } else if (!process.env.DISPLAY && platform !== 'darwin') {
          headlessMode = true;
          log(`[IPTV] Ambiente container sem DISPLAY detectado. Executando em modo headless para o sandbox.`, 'INFO');
        }

        log('[IPTV] Iniciando navegador Playwright com proteção permanente de sessão', 'INFO');
        log(`[IPTV] Headless: ${headlessMode}`, 'INFO');

        this.intentionalDisconnect = false;

        const launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-ipc-flooding-protection',
          '--password-store=basic',
          '--enable-features=PasswordManager,AutofillServerCommunication,ShowAutofillTypePredictions',
          '--enable-save-password-bubble',
          '--start-maximized',
          '--window-size=1920,1080',
        ];

        // Inicia com cascata de fallback automático (executável local -> channel chrome -> channel msedge -> playwright bundled)
        this.context = await this.launchPersistentContextWithFallback(
          fullProfilePath,
          headlessMode,
          launchArgs,
          log
        );

        // Registrar proteção de sessão no contexto
        await this.setupSessionVaultProtection(this.context);

        // Restaurar cookies do vault se existirem
        const vault = this.loadSessionVault();
        if (vault?.cookies && vault.cookies.length > 0) {
          try {
            await this.context.addCookies(vault.cookies);
            log(`[IPTV] ${vault.cookies.length} cookies restaurados do vault de sessão.`, 'INFO');
          } catch {
            // ignore
          }
        }

        // Monitorar fechamento do contexto com auto-recuperação 24/7
        this.context.on('close', () => {
          log('[IPTV] Contexto do navegador finalizado.');
          this.context = null;
          this.page = null;
          this.connectionStatus = 'DESCONECTADO';

          // Se não foi um encerramento manual intencional, reviver o navegador
          if (!this.intentionalDisconnect) {
            log('[IPTV] Encerramento inesperado detectado. Reabrindo navegador em 3s para permanência contínua...', 'WARN');
            setTimeout(() => {
              if (!this.intentionalDisconnect && !this.context) {
                this.connectBrowser().catch((err) => {
                  console.error('[IPTV RECONNECT ERROR]', err);
                });
              }
            }, 3000);
          }
        });

        log('[IPTV] Navegador iniciado com sucesso', 'SUCCESS');

        // 4. Obter ou criar página ativa
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
        log('[IPTV] Página criada', 'INFO');

        this.page.setDefaultTimeout(35000);
        this.page.setDefaultNavigationTimeout(45000);

        // Diagnóstico de Rede (Requisições, Respostas, Status e Set-Cookie)
        this.page.on('request', (req) => {
          const url = req.url();
          if (url.includes('searchdefense.top')) {
            console.log(`[NET REQ] ${new Date().toLocaleTimeString('pt-BR')} | ${req.method()} ${url.split('?')[0]}`);
          }
        });

        this.page.on('response', async (res) => {
          const url = res.url();
          if (url.includes('searchdefense.top')) {
            const status = res.status();
            const headers = res.headers();
            const setCookie = headers['set-cookie'];
            if ([401, 403, 419, 440, 429, 500, 502, 503].includes(status)) {
              console.warn(`[NET RESP ERROR] Status ${status} em ${url}`);
            }
            if (setCookie) {
              console.log(`[NET SET-COOKIE] Recebido em ${url.split('?')[0]} (Validade/Atributos atualizados pelo servidor)`);
            }
          }
        });

        // Monitorar fechamento da página e auto-reabrir se o contexto ainda existe
        this.page.on('close', () => {
          log('[IPTV] Página principal fechada.');
          this.page = null;
          if (this.context && !this.intentionalDisconnect) {
            setTimeout(async () => {
              try {
                if (this.context && (!this.page || this.page.isClosed())) {
                  log('[IPTV] Reabrindo aba do painel IPTV...', 'INFO');
                  this.page = await this.context.newPage();
                  await this.page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
                  await this.updateStatusFromPage();
                }
              } catch (e) {
                console.error('[IPTV TAB REOPEN ERROR]', e);
              }
            }, 1000);
          }
        });

        // 5. Navegar para a URL do painel IPTV (não bloqueante para resposta instantânea)
        log(`[IPTV] Navegando para painel IPTV: ${this.panelUrl}`, 'INFO');
        this.page.goto(this.panelUrl, { waitUntil: 'commit', timeout: 30000 }).catch((e) => {
          log(`[IPTV AVISO] Navegação em segundo plano: ${e.message}`, 'WARN');
        });
        await this.page.waitForTimeout(1500);

        const currentUrl = this.page.url();
        log(`[IPTV] URL atual: ${currentUrl}`, 'INFO');
        const pageTitle = await this.page.title().catch(() => 'Painel IPTV');
        log(`[IPTV] Título da página: ${pageTitle}`, 'INFO');

        // 6. Diagnóstico de Login
        const pageStatus = await this.updateStatusFromPage();

        // Salvar snapshot imediatamente
        await this.saveSessionVault(this.page, this.context);

        log('[IPTV] Conexão inicial concluída', 'SUCCESS');
        log('[IPTV] 🌐 Página do painel IPTV aberta e mantida em segundo plano para comandos automáticos!', 'SUCCESS');

        const diag = await this.getDiagnostic();
        return {
          success: true,
          message:
            pageStatus === 'CONECTADO'
              ? 'Navegador conectado e autenticado com sucesso no painel IPTV!'
              : 'Navegador aberto! O navegador permanecerá aberto sem fechar ou deslogar.',
          diagnostic: diag,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : '';

        console.error(`[IPTV ERROR] ${errMsg}`);
        if (stack) console.error(`[IPTV ERROR] Stack trace:\n${stack}`);

        log(`[IPTV ERROR] ${errMsg}`, 'ERROR');

        this.connectionStatus = 'ERRO';
        this.lastError = errMsg;

        throw new Error(`Falha ao conectar com o Playwright: ${errMsg}`);
      }
    });
  }

  /**
   * Abre o WhatsApp Web em segundo plano utilizando o perfil persistente do Playwright.
   */
  public async openWhatsAppWeb(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{ success: boolean; message: string }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      try {
        log('[WHATSAPP] Abrindo WhatsApp Web em segundo plano...', 'INFO');
        const platform = process.platform;
        const fullProfilePath = path.resolve(this.profileDir);
        if (!fs.existsSync(fullProfilePath)) {
          fs.mkdirSync(fullProfilePath, { recursive: true });
        }

        if (!this.context) {
          let headlessMode = false;
          if (process.env.HEADLESS === 'true') {
            headlessMode = true;
          } else if (platform === 'win32') {
            headlessMode = false;
          } else if (!process.env.DISPLAY && platform !== 'darwin') {
            headlessMode = true;
          }

          const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--start-maximized',
          ];
          // Inicia com cascata de fallback automático
          this.context = await this.launchPersistentContextWithFallback(
            fullProfilePath,
            headlessMode,
            launchArgs,
            log
          );

          await this.setupSessionVaultProtection(this.context);
        }

        const pages = this.context.pages();
        let wpPage = pages.find((p) => p.url().includes('whatsapp.com'));
        if (!wpPage) {
          wpPage = await this.context.newPage();
        }

        log('[WHATSAPP] Navegando para https://web.whatsapp.com', 'INFO');
        wpPage.goto('https://web.whatsapp.com', { waitUntil: 'commit', timeout: 30000 }).catch(() => {});
        await wpPage.waitForTimeout(1000);

        log('[WHATSAPP] WhatsApp Web aberto com sucesso em segundo plano!', 'SUCCESS');
        return {
          success: true,
          message: 'WhatsApp Web aberto em segundo plano com sucesso! Caso seja o primeiro acesso, escaneie o QR Code na janela do navegador.',
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[WHATSAPP] Erro ao abrir WhatsApp Web: ${errMsg}`, 'ERROR');
        return { success: false, message: `Erro ao abrir WhatsApp Web: ${errMsg}` };
      }
    });
  }

  /**
   * Avalia a página atual para definir o status de conexão correto
   */
  private async updateStatusFromPage(): Promise<IptvConnectionStatus> {
    if (!this.page || this.page.isClosed()) {
      this.connectionStatus = 'DESCONECTADO';
      return this.connectionStatus;
    }

    try {
      await this.page.waitForTimeout(1000);

      const usersCount = await this.page.locator('.iptv-username').count().catch(() => 0);
      if (usersCount > 0) {
        this.connectionStatus = 'CONECTADO';
        await this.saveSessionVault(this.page, this.context || undefined);
        return this.connectionStatus;
      }

      // Verificar se há tabela ou linhas
      const hasTable = (await this.page.locator('table, .table-responsive, tr').count().catch(() => 0)) > 0;
      const isUsersUrl = this.page.url().includes('users-iptv');

      if (hasTable && isUsersUrl) {
        this.connectionStatus = 'CONECTADO';
        await this.saveSessionVault(this.page, this.context || undefined);
        return this.connectionStatus;
      }

      // Verificar se está na tela de login
      const isLogin = await this.page
        .$('input[type="password"], input[name="password"], form.login-form, .login-box, button:has-text("Logar"), button:has-text("Entrar")')
        .catch(() => null);

      if (isLogin) {
        this.connectionStatus = 'AGUARDANDO_LOGIN';
        console.log('[IPTV] Status da sessão: AGUARDANDO_LOGIN (Formulário de login detectado)');

        // 1. Checar se o vault tem sessão salva para auto-restaurar (chaves reais)
        const vault = this.loadSessionVault();
        const hasVaultAuth = vault?.hasAuthToken || !!(
          vault?.localStorage && (
            vault.localStorage[IPTV_REAL_KEYS.USER_ID] ||
            vault.localStorage[IPTV_REAL_KEYS.TOKEN] ||
            vault.localStorage['AUTH_USER_ID']
          )
        );

        if (hasVaultAuth && vault?.localStorage) {
          console.log('[IPTV] Restaurando sessão autenticada a partir do Vault...');
          await this.page.evaluate((storage) => {
            if (!storage) return;
            for (const [k, v] of Object.entries(storage.local || {})) {
              if (v) localStorage.setItem(k, v);
            }
          }, { local: vault.localStorage }).catch(() => {});

          await this.page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          await this.page.waitForTimeout(1500);

          const afterRestoreCount = await this.page.locator('.iptv-username, table').count().catch(() => 0);
          if (afterRestoreCount > 0) {
            this.connectionStatus = 'CONECTADO';
            return this.connectionStatus;
          }
        }

        // 2. Se ainda na tela de login, tentar auto-login com credenciais configuradas
        const config = db.getConfig();
        if (config.iptvAutoLoginEnabled !== false && (config.iptvPanelUsername || vault?.username)) {
          console.log('[IPTV] Executando auto-login inteligente com credenciais salvas...');
          await this.attemptAutoLogin(this.page);
        }
      } else {
        this.connectionStatus = isUsersUrl ? 'CONECTADO' : 'AGUARDANDO_LOGIN';
      }
    } catch {
      this.connectionStatus = 'ERRO';
    }

    return this.connectionStatus;
  }

  /**
   * Executa a rotina inteligente de Auto-Login se a página estiver na tela de login
   * e houver credenciais configuradas no sistema.
   */
  public async attemptAutoLogin(
    page?: Page,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{ success: boolean; message: string; autoLoggedIn: boolean }> {
    const timestamp = () => new Date().toLocaleTimeString('pt-BR');
    const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
      console.log(msg);
      onLog?.(`[${timestamp()}] ${msg}`, level);
    };

    const targetPage = page || this.page;
    if (!targetPage || targetPage.isClosed()) {
      return { success: false, message: 'Página do navegador não inicializada.', autoLoggedIn: false };
    }

    const config = db.getConfig();
    const vault = this.loadSessionVault();
    const username = config.iptvPanelUsername?.trim() || vault?.username?.trim();
    const password = config.iptvPanelPassword?.trim() || vault?.password?.trim();

    if (!username || !password) {
      log('[AUTO-LOGIN] Credenciais do painel IPTV (usuário/senha) não configuradas. O navegador continuará aberto para login manual.', 'INFO');
      return {
        success: false,
        message: 'Usuário ou senha do painel IPTV não configurados em Configurações. Efetue login na janela aberta.',
        autoLoggedIn: false,
      };
    }

    try {
      // 1. Verificar se elementos de login estão presentes
      const passwordInput = targetPage
        .locator('input[type="password"]:visible, input[name="password"]:visible, input#password:visible')
        .first();
      const hasPasswordInput = (await passwordInput.count()) > 0;

      const usernameInput = targetPage
        .locator(
          'input[name="username"]:visible, input[name="login"]:visible, input[placeholder="Usuário"]:visible, input[name="user"]:visible, input#username:visible, input#login:visible, input[type="text"]:visible'
        )
        .first();
      const hasUsernameInput = (await usernameInput.count()) > 0;

      if (!hasPasswordInput || !hasUsernameInput) {
        return {
          success: true,
          message: 'Página já autenticada ou não está na tela de login.',
          autoLoggedIn: false,
        };
      }

      log(`[AUTO-LOGIN] Preenchendo credenciais salvas para o usuário '${username}'...`, 'INFO');

      // 2. Preencher campos de login
      await usernameInput.fill(username);
      await passwordInput.fill(password);
      await targetPage.waitForTimeout(300);

      // Checar se há captcha na tela
      const hasCaptcha = (await targetPage.locator('.g-recaptcha, iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .captcha, [id*="captcha"]').count().catch(() => 0)) > 0;

      // 3. Localizar botão de login / submeter
      const submitBtn = targetPage
        .locator(
          'button:has-text("Logar"):visible, button[type="submit"]:visible, button:has-text("Entrar"):visible, button:has-text("Login"):visible, button:has-text("Acessar"):visible, button.btn-primary:visible, input[type="submit"]:visible'
        )
        .first();

      if ((await submitBtn.count()) > 0) {
        log('[AUTO-LOGIN] Clicando no botão de login...', 'INFO');
        await submitBtn.click();
      } else {
        log('[AUTO-LOGIN] Pressionando Enter no campo de senha...', 'INFO');
        await passwordInput.press('Enter');
      }

      // 4. Aguardar resposta do login
      log('[AUTO-LOGIN] Aguardando processamento da autenticação...', 'INFO');
      await targetPage.waitForTimeout(2500);

      const currentUrl = targetPage.url();
      if (!currentUrl.includes('users-iptv') && !currentUrl.includes('#/users-iptv')) {
        await targetPage.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }

      // Aguardar surgirem os elementos da tabela
      await targetPage.waitForSelector('.iptv-username, table, .table-responsive, tr', { timeout: 12000 }).catch(() => {});

      const stillHasPassword = (await targetPage.locator('input[type="password"]:visible').count().catch(() => 0)) > 0;
      if (stillHasPassword) {
        const msg = hasCaptcha
          ? 'Credenciais preenchidas automaticamente! Resolva a verificação de segurança (captcha) na janela do navegador para concluir o acesso. O navegador permanecerá aberto.'
          : 'Tentativa de login enviada. Se necessário, conclua o acesso ou código na tela do navegador que permanecerá aberta.';
        log(`[AUTO-LOGIN] ${msg}`, 'INFO');
        this.connectionStatus = 'AGUARDANDO_LOGIN';
        return { success: true, message: msg, autoLoggedIn: false };
      }

      this.connectionStatus = 'CONECTADO';
      this.lastError = null;

      // Gravar sessão imediatamente no Vault
      await this.saveSessionVault(targetPage, this.context || undefined);

      log('[AUTO-LOGIN] ✅ Login automático efetuado com sucesso no painel IPTV e salvo no Vault permanente!', 'SUCCESS');
      db.addLog('SUCCESS', `[AUTO-LOGIN] Sessão do painel IPTV autenticada e gravada no Vault para '${username}'`);

      return {
        success: true,
        message: 'Login efetuado com sucesso e gravado no Vault permanente.',
        autoLoggedIn: true,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[AUTO-LOGIN ERRO] Falha ao tentar auto-login: ${msg}`, 'WARN');
      return { success: false, message: `Falha no auto-login: ${msg}`, autoLoggedIn: false };
    }
  }

  /**
   * KEEP-ALIVE E ANTI-INATIVIDADE NÃO-DESTRUTIVO DO PAINEL IPTV:
   * Mantém a sessão perfeitamente ativa SEM dar F5 destrutivo,
   * preserva tokens no Vault e impede que o navegador feche ou deslogue.
   */
  public async keepAliveAndVerifySession(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    status: IptvConnectionStatus;
    message: string;
    autoLoggedIn: boolean;
  }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      try {
        log('[KEEP-ALIVE] Verificando sessão e protegendo permanência do painel IPTV...', 'INFO');

        if (!this.context || !this.page || this.page.isClosed()) {
          log('[KEEP-ALIVE] Navegador desconectado. Iniciando sessão persistente para manter ativo...', 'INFO');
          await this.connectBrowser(onLog);
        }

        const page = this.page;
        if (!page || page.isClosed()) {
          return {
            success: false,
            status: 'DESCONECTADO',
            message: 'Não foi possível inicializar a página do painel.',
            autoLoggedIn: false,
          };
        }

        const currentUrl = page.url();

        // 1. Se estiver na tela de login, tentar restaurar do Vault ou emitir CAPTCHA_REQUIRED
        const isLogin = await page
          .$('input[type="password"]:visible, input[name="password"]:visible, form.login-form, .login-box')
          .catch(() => null);

        if (isLogin) {
          log('[SESSION] Sessão expirada ou tela de login detectada.', 'WARN');
          const vault = this.loadSessionVault();
          if (vault) {
            log('[SESSION] Sessão carregada do vault', 'INFO');
          }
          const hasVaultAuth = vault?.hasAuthToken || !!(
            vault?.localStorage && (
              vault.localStorage[IPTV_REAL_KEYS.USER_ID] ||
              vault.localStorage[IPTV_REAL_KEYS.TOKEN] ||
              vault.localStorage['AUTH_USER_ID']
            )
          );

          if (hasVaultAuth && vault?.localStorage) {
            log('[SESSION] Tentando restaurar sessão', 'INFO');
            if (vault.cookies && vault.cookies.length > 0 && this.context) {
              await this.context.addCookies(vault.cookies).catch(() => {});
              log('[SESSION] Cookies restaurados', 'INFO');
            }
            await page.evaluate((storage) => {
              if (!storage) return;
              for (const [k, v] of Object.entries(storage.local || {})) {
                if (v) localStorage.setItem(k, v);
              }
            }, { local: vault.localStorage }).catch(() => {});
            log('[SESSION] LocalStorage restaurado', 'INFO');

            await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await page.waitForTimeout(1500);

            const usersFound = await page.locator('.iptv-username, table').count().catch(() => 0);
            if (usersFound > 0) {
              this.connectionStatus = 'CONECTADO';
              log('[SESSION] Sessão validada', 'SUCCESS');
              log('[SESSION] Sessão ainda ativa', 'SUCCESS');
              return {
                success: true,
                status: 'CONECTADO',
                message: 'Sessão restabelecida pelo Vault.',
                autoLoggedIn: true,
              };
            }
          }

          // Se a sessão expirou e o painel exige CAPTCHA ou reautenticação
          log('[SESSION] CAPTCHA_REQUIRED', 'WARN');
          log('[IPTV] ⚠️ CAPTCHA ou verificação humana detectada. Pausando tentativas automáticas para evitar loops. Por favor, efetue o login manualmente na janela do navegador.', 'WARN');
          this.connectionStatus = 'AGUARDANDO_LOGIN';
          return {
            success: false,
            status: 'AGUARDANDO_LOGIN',
            message: 'CAPTCHA_REQUIRED: Efetue o login manualmente na janela aberta.',
            autoLoggedIn: false,
          };
        }

        // 2. Se já estiver na página de usuários (sessão ativa):
        // Rotação SPA Inteligente: A cada ~11 minutos, alternar para Analytics para gerar tráfego legítimo no servidor e renovar contadores de sessão
        const nowTime = Date.now();
        if (!this.lastAnalyticsPing || (nowTime - this.lastAnalyticsPing > 660000)) {
          this.lastAnalyticsPing = nowTime;
          log('[SESSION] Rotação SPA de manutenção: Navegando para Analytics para renovar sessão...', 'INFO');
          await page.evaluate(() => { window.location.hash = '#/Analytics'; }).catch(() => {});
          await page.waitForTimeout(25000); // 25 segundos na página Analytics
          await page.evaluate(() => { window.location.hash = '#/users-iptv'; }).catch(() => {});
          await page.waitForTimeout(2000);
          log('[SESSION] Retorno para users-iptv concluído com sucesso', 'SUCCESS');
        }

        if (currentUrl.includes('users-iptv') || currentUrl.includes(this.panelUrl)) {
          // Interação suave para o backend não desconectar por inatividade
          await page.evaluate(() => {
            window.dispatchEvent(new Event('mousemove'));
            window.dispatchEvent(new Event('focus'));
          }).catch(() => {});

          // Salvar snapshot atualizado no Vault
          const vaultSaved = await this.saveSessionVault(page, this.context || undefined);

          const usersCount = await page.locator('.iptv-username').count().catch(() => 0);
          this.connectionStatus = 'CONECTADO';
          this.lastError = null;

          const msg = `Sessão ativa mantida sem deslogar (${usersCount} usuários no DOM, Vault atualizado)`;
          log(`[KEEP-ALIVE] ✅ ${msg}`, 'SUCCESS');

          return {
            success: true,
            status: 'CONECTADO',
            message: msg,
            autoLoggedIn: false,
          };
        }

        // 3. Se estiver em outra página do painel, navegar de volta suavemente
        log(`[KEEP-ALIVE] Navegando suavemente para lista de usuários: ${this.panelUrl}`, 'INFO');
        await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1000);

        await this.saveSessionVault(page, this.context || undefined);
        this.connectionStatus = 'CONECTADO';

        return {
          success: true,
          status: 'CONECTADO',
          message: 'Painel IPTV mantido em execução e sincronizado.',
          autoLoggedIn: false,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[KEEP-ALIVE AVISO] Falha na verificação de sessão: ${errMsg}`, 'WARN');
        return {
          success: false,
          status: this.connectionStatus,
          message: errMsg,
          autoLoggedIn: false,
        };
      }
    });
  }

  /**
   * Desconecta o navegador e encerra o contexto
   */
  public async disconnectBrowser(onLog?: (msg: string) => void): Promise<void> {
    this.intentionalDisconnect = true;
    console.log('[IPTV] Desconectando sessão persistente do Playwright...');
    onLog?.(`[${new Date().toLocaleTimeString('pt-BR')}] [IPTV] Encerrando sessão do Playwright...`);

    try {
      if (this.context) {
        await this.context.close().catch(() => {});
      }
    } catch {
      // ignore
    } finally {
      this.context = null;
      this.page = null;
      this.connectionStatus = 'DESCONECTADO';
      console.log('[IPTV] Sessão desconectada.');
      onLog?.(`[${new Date().toLocaleTimeString('pt-BR')}] [IPTV] Navegador desconectado com sucesso.`);
    }
  }

  /**
   * Garante que a página do painel está aberta, ativa e pronta para comandos
   */
  private async ensurePageReady(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<Page> {
    if (!this.context || !this.page || this.page.isClosed()) {
      onLog?.(`[IPTV] Navegador não está ativo. Iniciando automaticamente...`, 'INFO');
      await this.connectBrowser(onLog);
    }

    if (!this.page || this.page.isClosed()) {
      throw new Error('Não foi possível obter uma página ativa no Playwright.');
    }

    const currentUrl = this.page.url();
    if (!currentUrl.includes('users-iptv') && !currentUrl.includes(this.panelUrl)) {
      onLog?.(`[IPTV] Navegando para a página de usuários: ${this.panelUrl}`, 'INFO');
      await this.page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.page.waitForTimeout(1500);
    }

    // Verificar se caiu na tela de login e tentar auto-login automaticamente
    const isLogin = await this.page
      .$('input[type="password"]:visible, input[name="username"]:visible, form.login-form, .login-box')
      .catch(() => null);

    if (isLogin) {
      onLog?.(`[IPTV] Tela de login detectada. Tentando Auto-Login antes da operação...`, 'INFO');
      const autoRes = await this.attemptAutoLogin(this.page, onLog);
      if (!autoRes.success) {
        onLog?.(`[IPTV AVISO] Não foi possível fazer auto-login automático: ${autoRes.message}`, 'WARN');
      }
    }

    return this.page;
  }

  /**
   * Extrai todos os usuários do DOM atual da tabela Vue SPA
   */
  public async extractUsersFromCurrentDom(
    page: Page,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<ExtractedIptvUser[]> {
    const rows = page.locator('tr');
    const totalRows = await rows.count();
    const extractedUsers: ExtractedIptvUser[] = [];

    for (let i = 0; i < totalRows; i++) {
      const row = rows.nth(i);
      const usernameLocator = row.locator('.iptv-username');
      const hasUsername = (await usernameLocator.count()) > 0;

      if (!hasUsername) continue;

      const iptvUsername = (await usernameLocator.textContent().catch(() => ''))?.trim() || '';
      if (!iptvUsername) continue;

      const password = (await row.locator('.iptv-col-password').textContent().catch(() => ''))?.trim() || '';
      const statusText = (await row.locator('.iptv-status-badge').textContent().catch(() => ''))?.trim() || 'Ativo';
      const notes = (await row.locator('.iptv-col-notes').textContent().catch(() => ''))?.trim() || '';

      let expirationDate = '';
      const expiryB = row.locator('.iptv-col-expiry b');
      if ((await expiryB.count()) > 0) {
        expirationDate = (await expiryB.textContent().catch(() => ''))?.trim() || '';
      } else {
        expirationDate = (await row.locator('.iptv-col-expiry').textContent().catch(() => ''))?.trim() || '';
      }

      const createdAt = (await row.locator('.iptv-col-created').textContent().catch(() => ''))?.trim() || '';

      extractedUsers.push({
        iptvUsername,
        password,
        statusText,
        notes,
        expirationDate,
        createdAt,
      });
    }

    return extractedUsers;
  }

  /**
   * ATUALIZAÇÃO F5 E SINCRONIZAÇÃO AUTOMÁTICA DO PAINEL IPTV
   * Executa a rotina centralizada de pós-operação:
   * 1. Concluir a operação principal;
   * 2. Atualizar a página do painel IPTV em segundo plano (page.reload);
   * 3. Aguardar o painel carregar;
   * 4. Aguardar a SPA Vue renderizar (.iptv-username);
   * 5. Verificar que os usuários IPTV estão novamente disponíveis;
   * 6. Executar sincronização automática com o banco local;
   * 7. Finalizar a operação.
   */
  private async _refreshAndSyncAfterOperation(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    usersCount: number;
    error?: string;
  }> {
    const timestamp = () => new Date().toLocaleTimeString('pt-BR');
    const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
      console.log(msg);
      onLog?.(`[${timestamp()}] ${msg}`, level);
    };

    const maxAttempts = 2;
    let lastErrMsg = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log(`[IPTV] Atualizando página do painel em segundo plano com proteção de sessão`, 'INFO');
        const page = await this.ensurePageReady(onLog);

        // Salvar vault antes de qualquer ação
        await this.saveSessionVault(page, this.context || undefined);

        if (!page.url().includes('users-iptv')) {
          log(`[IPTV] Navegando para lista de usuários: ${this.panelUrl}`, 'INFO');
          await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } else {
          // Atualização suave da listagem
          log(`[IPTV] Atualizando listagem de usuários...`, 'INFO');
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
        }

        // Salvar vault atualizado
        await this.saveSessionVault(page, this.context || undefined);

        log(`[IPTV] Aguardando renderização Vue`, 'INFO');
        await page.waitForSelector('.iptv-username', { state: 'visible', timeout: 30000 });

        const usersCount = await page.locator('.iptv-username').count().catch(() => 0);
        if (usersCount === 0) {
          const err = 'Painel recarregado mas usuários não foram renderizados.';
          log(`[SYNC ERROR] ${err}`, 'ERROR');
          throw new Error(err);
        }

        log(`[IPTV] .iptv-username encontrado (${usersCount} usuários)`, 'INFO');

        // Aguardar pequeno período para os dados estabilizarem
        await page.waitForTimeout(1000);

        log(`[IPTV] Iniciando sincronização automática`, 'INFO');
        const extractedUsers = await this.extractUsersFromCurrentDom(page, onLog);
        log(`[IPTV] Usuários encontrados: ${extractedUsers.length}`, 'INFO');

        const syncResult = db.syncWithExtractedUsers(extractedUsers);
        log(
          `[IPTV] Banco local atualizado (Novos: ${syncResult.created}, Atualizados: ${syncResult.updated})`,
          'INFO'
        );
        log(`[IPTV] Sincronização automática concluída`, 'SUCCESS');

        return {
          success: true,
          usersCount: extractedUsers.length,
        };
      } catch (err: unknown) {
        lastErrMsg = err instanceof Error ? err.message : String(err);
        log(`[SYNC ERROR] Operação principal concluída`, 'WARN');
        log(`[SYNC ERROR] Falha ao atualizar/sincronizar na tentativa ${attempt}/${maxAttempts}: ${lastErrMsg}`, 'WARN');

        if (attempt < maxAttempts) {
          log(`[SYNC ERROR] Tentando novamente em 2 segundos...`, 'INFO');
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    log(`[SYNC ERROR] Operação principal concluída`, 'WARN');
    log(`[SYNC ERROR] Não foi possível sincronizar automaticamente após ${maxAttempts} tentativas.`, 'WARN');

    return {
      success: false,
      usersCount: 0,
      error: lastErrMsg,
    };
  }

  /**
   * Ponto de entrada público seguro para refreshAndSyncAfterOperation
   */
  public async refreshAndSyncAfterOperation(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    usersCount: number;
    error?: string;
  }> {
    return this.withLock(async () => {
      return await this._refreshAndSyncAfterOperation(onLog);
    });
  }

  /**
   * Sincroniza os usuários do painel IPTV diretamente com o banco de dados local
   */
  public async syncPanelUsers(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<SyncResult> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      log('[IPTV] Iniciando sincronização com o painel IPTV...', 'INFO');
      const page = await this.ensurePageReady(onLog);

      if (!page.url().includes('users-iptv')) {
        log(`[IPTV] Redirecionando para ${this.panelUrl}...`, 'INFO');
        await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }

      log(`[IPTV] Aguardando renderização do Vue SPA (aguardando '.iptv-username' por até 30s)...`, 'INFO');
      await page.waitForSelector('.iptv-username', { state: 'visible', timeout: 30000 });
      await page.waitForTimeout(1000);

      const extractedUsers = await this.extractUsersFromCurrentDom(page, onLog);
      log(`[IPTV] Usuários encontrados: ${extractedUsers.length}`, 'INFO');

      const syncResult = db.syncWithExtractedUsers(extractedUsers);
      log(
        `[IPTV] Banco local atualizado (Novos: ${syncResult.created}, Atualizados: ${syncResult.updated})`,
        'SUCCESS'
      );
      return syncResult;
    });
  }

  /**
   * Sincroniza todos os usuários extraindo os elementos reais do DOM da SPA
   */
  public async syncAllUsers(
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<ExtractedIptvUser[]> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      log('[IPTV] Iniciando sincronização com o painel IPTV...', 'INFO');

      const page = await this.ensurePageReady(onLog);

      log(`[IPTV] URL atual da página: ${page.url()}`, 'INFO');
      const pageTitle = await page.title().catch(() => 'Painel');
      log(`[IPTV] Título da página: ${pageTitle}`, 'INFO');

      // 1. Navegar explicitamente para a lista de usuários se não estiver nela
      if (!page.url().includes('users-iptv')) {
        log(`[IPTV] Redirecionando para ${this.panelUrl}...`, 'INFO');
        await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }

      log(`[IPTV] Aguardando renderização do Vue SPA (aguardando '.iptv-username' por até 30s)...`, 'INFO');

      // 2. Aguardar o DOM da SPA renderizar os seletores reais
      let foundSelector = false;
      try {
        await page.waitForSelector('.iptv-username', { state: 'visible', timeout: 30000 });
        foundSelector = true;
        log(`[IPTV] Elementos '.iptv-username' localizados no DOM!`, 'SUCCESS');
      } catch {
        log(`[IPTV] Seletor '.iptv-username' não apareceu no tempo limite (30s). Analisando estado da página...`, 'WARN');
      }

      // 3. Se não encontrou o seletor .iptv-username, verificar se está no Login ou se a tabela está vazia
      if (!foundSelector) {
        const isLogin = await page
          .$('input[type="password"], input[name="username"], input[name="login"], form.login-form, .login-box, button:has-text("Entrar")')
          .catch(() => null);

        if (isLogin) {
          this.connectionStatus = 'AGUARDANDO_LOGIN';
          const errorMsg =
            'Sessão do painel IPTV expirada ou login necessário.\n' +
            'Por favor, realize o login na janela aberta do navegador e tente novamente.';
          log(`[IPTV ERROR] ${errorMsg}`, 'ERROR');
          throw new Error(errorMsg);
        }

        const emptyState = await page
          .locator('.dataTables_empty, .no-data, :has-text("Nenhum registro"), :has-text("Nenhum dado"), :has-text("No data")')
          .count()
          .catch(() => 0);

        const anyRows = await page.locator('table tbody tr, tr').count().catch(() => 0);
        if (anyRows === 0 && emptyState === 0) {
          const errorMsg =
            'Não foi possível localizar a tabela de usuários IPTV no DOM.\n' +
            'Possíveis causas: Painel não autenticado, página ainda carregando ou estrutura alterada.';
          log(`[IPTV ERROR] ${errorMsg}`, 'ERROR');
          throw new Error(errorMsg);
        }
      }

      await page.waitForTimeout(1000);
      const extractedUsers = await this.extractUsersFromCurrentDom(page, onLog);
      log(`[IPTV] Total de usuários encontrados no DOM: ${extractedUsers.length}`, 'INFO');

      const sample = extractedUsers.slice(0, 5);
      for (const u of sample) {
        log(`[IPTV] Usuário encontrado: ${u.iptvUsername} | Vencimento: ${u.expirationDate}`, 'INFO');
      }

      if (extractedUsers.length === 0) {
        log('[IPTV] Nenhum usuário com a classe .iptv-username encontrado na tabela.', 'INFO');
      }

      this.connectionStatus = 'CONECTADO';
      return extractedUsers;
    });
  }

  /**
   * Executa a rotina de renovação (+30 dias) utilizando o DOM real e confirmação no modal SweetAlert
   */
  public async renewUser(
    iptvUsername: string,
    daysToAdd: number = 30,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    beforeDate: string;
    afterDate: string;
    incrementsDone: number;
    error?: string;
  }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      log(`[IPTV] Renovação iniciada`, 'INFO');
      log(`[IPTV] Usuário localizado: ${iptvUsername}`, 'INFO');
      log(`[IPTV] Dias solicitados: ${daysToAdd}`, 'INFO');

      const cycles = Math.max(1, Math.round(daysToAdd / 30));
      log(`[IPTV] Total de ciclos (+30 dias) a executar: ${cycles}`, 'INFO');

      const page = await this.ensurePageReady(onLog);

      // 1. Garantir que estamos na tela de usuários
      if (!page.url().includes('users-iptv')) {
        log(`[IPTV] Navegando até a página de usuários: ${this.panelUrl}`, 'INFO');
        await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }

      // 2. Aguardar carregar elementos .iptv-username
      await page.waitForSelector('.iptv-username', { state: 'visible', timeout: 30000 });

      let initialBeforeDate = '';
      let currentExpiryDateStr = '';
      let incrementsDone = 0;

      for (let cycle = 1; cycle <= cycles; cycle++) {
        log(`[IPTV] [CICLO ${cycle}/${cycles}] Localizando linha do usuário '${iptvUsername}'...`, 'INFO');

        // Localizar o elemento .iptv-username exato
        const usernameLocators = page.locator('.iptv-username');
        const totalUsernames = await usernameLocators.count();
        let targetUsernameLocator = null;

        for (let i = 0; i < totalUsernames; i++) {
          const uEl = usernameLocators.nth(i);
          const text = (await uEl.textContent().catch(() => ''))?.trim();
          if (text === iptvUsername) {
            targetUsernameLocator = uEl;
            break;
          }
        }

        if (!targetUsernameLocator) {
          const err = `Usuário '${iptvUsername}' não foi encontrado na tabela do painel IPTV.`;
          log(`[IPTV ERROR] ${err}`, 'ERROR');
          return {
            success: false,
            beforeDate: initialBeforeDate,
            afterDate: currentExpiryDateStr,
            incrementsDone,
            error: err,
          };
        }

        const targetRow = targetUsernameLocator.locator('xpath=ancestor::tr');
        const rowCount = await targetRow.count();
        if (rowCount === 0) {
          const err = `Não foi possível localizar a linha <tr> correspondente ao usuário ${iptvUsername}.`;
          log(`[IPTV ERROR] ${err}`, 'ERROR');
          return {
            success: false,
            beforeDate: initialBeforeDate,
            afterDate: currentExpiryDateStr,
            incrementsDone,
            error: err,
          };
        }

        // Ler data antes do clique
        const expiryLocator = targetRow.locator('.iptv-col-expiry b, .iptv-col-expiry');
        let beforeDate = '';
        if ((await expiryLocator.count()) > 0) {
          beforeDate = (await expiryLocator.first().textContent().catch(() => ''))?.trim() || '';
        }

        if (cycle === 1) {
          initialBeforeDate = beforeDate;
        }
        currentExpiryDateStr = beforeDate;

        log(`[IPTV] [CICLO ${cycle}/${cycles}] Vencimento antes da renovação: ${beforeDate}`, 'INFO');

        // Localizar o botão +30 dentro de .iptv-row-actions da TR do usuário
        log(`[IPTV] [CICLO ${cycle}/${cycles}] Buscando botão '+30' em .iptv-row-actions...`, 'INFO');
        const actionsCell = targetRow.locator('td.iptv-row-actions');
        const actionButton = actionsCell
          .locator('button.btn-outline-warning, button')
          .filter({ hasText: '+30' })
          .first();

        if ((await actionButton.count()) === 0) {
          const err = `Botão '+30' não encontrado para o usuário ${iptvUsername}.`;
          log(`[IPTV ERROR] ${err}`, 'ERROR');
          return {
            success: false,
            beforeDate: initialBeforeDate,
            afterDate: currentExpiryDateStr,
            incrementsDone,
            error: err,
          };
        }

        log(`[IPTV] [CICLO ${cycle}/${cycles}] Clicando no botão '+30'...`, 'INFO');
        await actionButton.click();

        // Aguardar modal de confirmação (SweetAlert2)
        log(`[IPTV] [CICLO ${cycle}/${cycles}] Aguardando modal de confirmação (SweetAlert2)...`, 'INFO');
        try {
          const confirmBtn = page
            .locator('button.swal2-confirm, .swal2-actions button:has-text("Sim"), .swal2-actions button.btn-primary, .swal2-actions button:has-text("Confirmar")')
            .first();
          await confirmBtn.waitFor({ state: 'visible', timeout: 8000 });

          log(`[IPTV] [CICLO ${cycle}/${cycles}] Confirmando ação no modal (clicando em Sim)...`, 'INFO');
          await confirmBtn.click();
          log(`[IPTV] +30 confirmado`, 'SUCCESS');
        } catch (modalErr) {
          log(`[IPTV] [CICLO ${cycle}/${cycles}] Modal não apareceu ou confirmação direta: ${modalErr}`, 'WARN');
        }

        // Aguardar a requisição e a tabela atualizar
        log(`[IPTV] [CICLO ${cycle}/${cycles}] Aguardando atualização dos dados no DOM...`, 'INFO');
        await page.waitForTimeout(2500);

        // Ler nova data de vencimento
        let newDate = '';
        if ((await expiryLocator.count()) > 0) {
          newDate = (await expiryLocator.textContent().catch(() => ''))?.trim() || '';
        } else {
          newDate = (await targetRow.locator('.iptv-col-expiry').textContent().catch(() => ''))?.trim() || '';
        }

        log(`[IPTV] [CICLO ${cycle}/${cycles}] Nova data lida na tabela: ${newDate}`, 'INFO');

        incrementsDone++;
        currentExpiryDateStr = newDate || beforeDate;
        log(`[IPTV] [CICLO ${cycle}/${cycles}] ✅ Ciclo ${cycle} concluído (+30 dias computados)!`, 'SUCCESS');

        if (cycle < cycles) {
          log(`[IPTV] Aguardando intervalo de segurança antes do próximo ciclo...`, 'INFO');
          await page.waitForTimeout(1200);
        }
      }

      log(`[IPTV] Renovação concluída`, 'SUCCESS');

      // Atualizar página do painel em segundo plano e sincronizar com o banco local
      await this._refreshAndSyncAfterOperation(onLog);

      // Obter data atualizada após a sincronização
      const updatedAccess = db.getAccessByUsername(iptvUsername);
      if (updatedAccess && updatedAccess.expirationDate) {
        currentExpiryDateStr = updatedAccess.expirationDate;
      }

      log(`[IPTV] Nova data registrada: ${currentExpiryDateStr}`, 'INFO');
      log(`[IPTV] Processo completo concluído`, 'SUCCESS');

      return {
        success: true,
        beforeDate: initialBeforeDate,
        afterDate: currentExpiryDateStr,
        incrementsDone,
      };
    });
  }

  /**
   * Executa a exclusão real de um usuário no painel IPTV utilizando a estrutura real da TR
   * Ordem estrita: USERNAME -> TR -> TD .iptv-row-actions -> MENU ... -> MENU ABERTO -> DELETAR -> SWEETALERT -> SIM
   */
  public async deleteUser(
    iptvUsername: string,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{
    success: boolean;
    iptvUsername: string;
    message: string;
    error?: string;
  }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
    const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
      console.log(msg);
      onLog?.(`[${timestamp()}] ${msg}`, level);
    };

    const username = (iptvUsername || '').trim();
    log(`[DELETE] Solicitação recebida para exclusão de usuário`, 'INFO');
    log(`[DELETE] Processando usuário IPTV: ${username}`, 'INFO');

    if (!username) {
      const err = 'Nome de usuário IPTV não fornecido para exclusão.';
      log(`[DELETE ERROR] Usuário: ${username}`, 'ERROR');
      log(`[DELETE ERROR] Etapa: validação de entrada`, 'ERROR');
      log(`[DELETE ERROR] Motivo: ${err}`, 'ERROR');
      return { success: false, iptvUsername: '', message: err, error: err };
    }

    let currentStep = 'inicialização';

    try {
      currentStep = 'navegação e prontidão da página';
      const page = await this.ensurePageReady(onLog);

      // Garantir navegação na página de usuários IPTV
      if (!page.url().includes('users-iptv')) {
        log(`[DELETE] Navegando para painel IPTV: ${this.panelUrl}`, 'INFO');
        await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }

      // Aguardar carregar elementos .iptv-username
      await page.waitForSelector('.iptv-username', { timeout: 30000 });

      // ==================================================
      // PASSO 1 & 2 — LOCALIZAR A TR DO USERNAME EXATO
      // ==================================================
      currentStep = 'localização da linha do usuário';
      log(`[DELETE] Procurando linha exata do usuário: ${username}`, 'INFO');
      const rows = page.locator('tr');
      const totalRows = await rows.count();
      let targetRow = null;

      for (let i = 0; i < totalRows; i++) {
        const currentRow = rows.nth(i);
        const uText = (await currentRow.locator('.iptv-username').textContent().catch(() => null))?.trim();
        if (uText === username) {
          targetRow = currentRow;
          break;
        }
      }

      if (!targetRow) {
        log(`[DELETE] Usuário '${username}' não localizado no painel IPTV (já removido ou inexistente).`, 'WARN');
        return {
          success: true,
          iptvUsername: username,
          message: `Usuário '${username}' já não existe no painel IPTV. Exclusão confirmada.`,
        };
      }

      // ==================================================
      // PASSO 3 — VALIDAR A LINHA ENCONTRADA
      // ==================================================
      const rowText = (await targetRow.innerText().catch(() => '')) || '';
      if (!rowText.includes(username)) {
        const err = 'Usuário incorreto detectado. Operação cancelada.';
        log(`[DELETE ERROR] Usuário: ${username}`, 'ERROR');
        log(`[DELETE ERROR] Etapa: validação da linha`, 'ERROR');
        log(`[DELETE ERROR] Motivo: ${err}`, 'ERROR');
        throw new Error(err);
      }

      const note = (await targetRow.locator('.iptv-mobile-note').textContent().catch(() => ''))?.trim() || 'N/A';
      log(`[DELETE] Linha encontrada para usuário: ${username}`, 'INFO');
      log(`[DELETE] Nome/nota: ${note}`, 'INFO');

      // ==================================================
      // PASSO 4 — ENTRAR EM .iptv-row-actions (EXATAMENTE DENTRO DA TR)
      // ==================================================
      currentStep = 'localização do menu de ações';
      const actionsCell = targetRow.locator('td.iptv-row-actions, .iptv-row-actions');
      const actionsCellCount = await actionsCell.count();
      if (actionsCellCount === 0) {
        throw new Error(
          `Célula de ações '.iptv-row-actions' não encontrada na linha de ${username}. Abortando.`
        );
      }

      // ==================================================
      // PASSO 5 & 6 — IDENTIFICAR E CLICAR NO MENU CORRETO (...)
      // Ignorar completamente button.btn-outline-warning (+30) e button.iptv-details-toggle
      // ==================================================
      log(`[DELETE] Localizando menu ... dentro da linha correta`, 'INFO');
      const menuButton = actionsCell.locator(
        'li.dropdown a[role="button"], li.dropdown a[data-toggle="dropdown"], li.dropdown a:has(i.fas.fa-ellipsis-v), li.dropdown a:has(i.fa-ellipsis-v), a:has(i.fas.fa-ellipsis-v), a:has(i.fa-ellipsis-v), li.dropdown a'
      ).first();

      const menuButtonCount = await menuButton.count();
      if (menuButtonCount === 0) {
        throw new Error(`Menu de ações (...) não encontrado na célula .iptv-row-actions do usuário ${username}.`);
      }

      const isMenuVisible = await menuButton.isVisible().catch(() => false);
      if (!isMenuVisible) {
        throw new Error(`Menu de ações (...) do usuário ${username} não está visível para clique.`);
      }

      await menuButton.click();

      // ==================================================
      // PASSO 7 — CONFIRMAR O MENU ABERTO
      // ==================================================
      await page.waitForTimeout(400);
      log(`[DELETE] Menu de ações aberto para ${username}`, 'INFO');

      // ==================================================
      // PASSO 8 — LOCALIZAR O BOTÃO DELETAR DO MENU ABERTO (VISÍVEL)
      // ==================================================
      currentStep = 'localização do botão Deletar';
      log(`[DELETE] Localizando botão Deletar no menu correto`, 'INFO');
      let visibleDeleteButton = null;

      // Aguardar até 4s inspecionando elementos visíveis
      const startTime = Date.now();
      while (Date.now() - startTime < 4000 && !visibleDeleteButton) {
        // 1. Procurar na célula de ações
        const cellCandidates = actionsCell.locator('button, a, .dropdown-item, [role="menuitem"]');
        const cellCount = await cellCandidates.count();
        for (let i = 0; i < cellCount; i++) {
          const btn = cellCandidates.nth(i);
          if (await btn.isVisible().catch(() => false)) {
            const text = ((await btn.textContent().catch(() => '')) || '').trim();
            const cls = (await btn.getAttribute('class').catch(() => '')) || '';
            if (
              (text.toLowerCase().includes('deletar') || text.toLowerCase().includes('excluir')) &&
              !cls.includes('btn-outline-warning') &&
              !text.includes('+30')
            ) {
              visibleDeleteButton = btn;
              break;
            }
          }
        }

        if (visibleDeleteButton) break;

        // 2. Procurar em dropdown-menu visível na página (Popper / Bootstrap / Vue)
        const openMenus = page.locator(
          '.dropdown-menu.show, .dropdown-menu:visible, [role="menu"]:visible, div.dropdown-menu'
        );
        const menuCount = await openMenus.count();
        for (let m = 0; m < menuCount; m++) {
          const menu = openMenus.nth(m);
          if (await menu.isVisible().catch(() => false)) {
            const items = menu.locator('button, a, .dropdown-item, [role="menuitem"]');
            const itemCount = await items.count();
            for (let i = 0; i < itemCount; i++) {
              const it = items.nth(i);
              if (await it.isVisible().catch(() => false)) {
                const text = ((await it.textContent().catch(() => '')) || '').trim();
                const cls = (await it.getAttribute('class').catch(() => '')) || '';
                if (
                  (text.toLowerCase().includes('deletar') || text.toLowerCase().includes('excluir')) &&
                  !cls.includes('btn-outline-warning') &&
                  !text.includes('+30')
                ) {
                  visibleDeleteButton = it;
                  break;
                }
              }
            }
            if (visibleDeleteButton) break;
          }
        }

        if (visibleDeleteButton) break;

        // 3. Fallback: procurar botão ou link visível com texto Deletar
        const allCandidates = page.locator('button.btn-outline-info, button, a.dropdown-item, a');
        const allCount = await allCandidates.count();
        for (let i = 0; i < allCount; i++) {
          const el = allCandidates.nth(i);
          if (await el.isVisible().catch(() => false)) {
            const text = ((await el.textContent().catch(() => '')) || '').trim();
            const cls = (await el.getAttribute('class').catch(() => '')) || '';
            if (
              (text.toLowerCase().includes('deletar') || text.toLowerCase().includes('excluir')) &&
              !cls.includes('btn-outline-warning') &&
              !text.includes('+30')
            ) {
              visibleDeleteButton = el;
              break;
            }
          }
        }

        if (visibleDeleteButton) break;
        await page.waitForTimeout(200);
      }

      if (!visibleDeleteButton) {
        const err = `Botão 'Deletar' não foi encontrado no menu de ações aberto para o usuário ${username}.`;
        throw new Error(err);
      }

      log(`[DELETE] Botão Deletar encontrado`, 'INFO');

      // ==================================================
      // PASSO 9 — PROTEÇÃO RIGOROSA CONTRA +30
      // ==================================================
      const btnClass = (await visibleDeleteButton.getAttribute('class').catch(() => '')) || '';
      const btnText = (await visibleDeleteButton.textContent().catch(() => ''))?.trim() || '';

      if (
        btnClass.includes('btn-outline-warning') ||
        btnText.includes('+30') ||
        btnText.toLowerCase().includes('renovar') ||
        btnText.toLowerCase().includes('30 dias')
      ) {
        const protectionErr = `Proteção acionada: O botão identificado contém '${btnText}' (classe '${btnClass}'), que é de RENOVAÇÃO (+30), e NÃO de EXCLUSÃO.`;
        throw new Error(protectionErr);
      }

      currentStep = 'clique no botão Deletar';
      log(`[DELETE] Clicando em Deletar`, 'INFO');
      try {
        await visibleDeleteButton.click({ timeout: 5000 });
      } catch {
        await visibleDeleteButton.click({ force: true });
      }

      // ==================================================
      // PASSO 10 — AGUARDAR SWEETALERT ESPECÍFICO (SEM STRICT MODE VIOLATION)
      // ==================================================
      currentStep = 'confirmação SweetAlert';
      // Localizar especificamente o diálogo popup visível (não selecionar container junto)
      const confirmDialog = page.locator('.swal2-popup:visible').last();
      await confirmDialog.waitFor({ state: 'visible', timeout: 10000 });
      log(`[DELETE] Modal de confirmação localizado`, 'INFO');

      // ==================================================
      // PASSO 11 — PROTEÇÃO CONTRA MODAL DE RENOVAÇÃO
      // ==================================================
      const swalText = (await confirmDialog.innerText().catch(() => '')) || '';
      const swalTextLower = swalText.toLowerCase();

      if (
        swalTextLower.includes('adicionar 30 dias') ||
        swalTextLower.includes('30 dias') ||
        swalTextLower.includes('renovar') ||
        swalTextLower.includes('adicionar dias')
      ) {
        const cancelBtn = confirmDialog.locator('button.swal2-cancel, .swal2-actions button:has-text("Cancelar")').first();
        if ((await cancelBtn.count()) > 0) {
          await cancelBtn.click().catch(() => {});
        }
        throw new Error(`Foi aberto um modal de RENOVAÇÃO em vez de EXCLUSÃO: "${swalText}". Operação abortada.`);
      }

      // ==================================================
      // PASSO 12 — LOCALIZAR E CLICAR NO BOTÃO 'SIM' DENTRO DO MODAL CORRETO
      // ==================================================
      const confirmButton = confirmDialog
        .locator('button.swal2-confirm:visible, button.swal2-confirm')
        .filter({ hasText: 'Sim' })
        .last();

      await confirmButton.waitFor({ state: 'visible', timeout: 10000 });
      log(`[DELETE] Botão Sim localizado no modal correto`, 'INFO');

      log(`[DELETE] Clicando em Sim`, 'INFO');
      try {
        await confirmButton.click({ timeout: 5000 });
      } catch {
        await confirmButton.click({ force: true });
      }

      // ==================================================
      // PASSO 13 — AGUARDAR FECHAMENTO DO MODAL
      // ==================================================
      currentStep = 'fechamento do modal';
      log(`[DELETE] Aguardando fechamento do modal`, 'INFO');
      await confirmDialog.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);

      // ==================================================
      // PASSO 14 — VERIFICAR SE O USUÁRIO DESAPARECEU DO DOM
      // ==================================================
      currentStep = 'verificação no DOM';
      log(`[DELETE] Verificando se usuário ainda existe no painel`, 'INFO');

      const remainingCount = await page
        .locator('tr .iptv-username')
        .filter({ hasText: username })
        .count()
        .catch(() => 0);

      const allRemaining = await page.locator('.iptv-username').allTextContents().catch(() => []);
      const userStillExists = remainingCount > 0 || allRemaining.some((u) => u.trim() === username);

      if (userStillExists) {
        const errorMsg = `Usuário ${username} ainda encontrado no painel após confirmação`;
        log(`[DELETE ERROR] Usuário: ${username}`, 'ERROR');
        log(`[DELETE ERROR] Etapa: verificação no DOM`, 'ERROR');
        log(`[DELETE ERROR] Motivo: ${errorMsg}`, 'ERROR');
        return {
          success: false,
          iptvUsername: username,
          message: errorMsg,
          error: errorMsg,
        };
      }

      log(`[DELETE] Usuário ${username} removido do painel IPTV com sucesso`, 'SUCCESS');
      log(`[DELETE] Atualizando página do painel em segundo plano`, 'INFO');

      // Atualizar página do painel em segundo plano e sincronizar com o banco local
      await this._refreshAndSyncAfterOperation(onLog);

      log(`[DELETE] Sincronização após exclusão finalizada`, 'SUCCESS');
      log(`[DELETE] Processo completo de exclusão concluído`, 'SUCCESS');

      return {
        success: true,
        iptvUsername: username,
        message: `Usuário '${username}' removido do painel IPTV com sucesso.`,
      };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`[DELETE ERROR] Usuário: ${username}`, 'ERROR');
      log(`[DELETE ERROR] Etapa: ${currentStep}`, 'ERROR');
      log(`[DELETE ERROR] Motivo: ${errMsg}`, 'ERROR');

      return {
        success: false,
        iptvUsername: username,
        message: `Falha ao excluir usuário ${username} no painel IPTV: ${errMsg}`,
        error: errMsg,
      };
    }
    });
  }

  /**
   * FLUXO REAL DO TESTE IPTV (1 HORA)
   * Executa a criação real do teste no painel IPTV através da sessão Playwright persistente.
   * Não inventa nenhum dado (usuário, senha, vencimento) — todos são extraídos diretamente do painel.
   */
  public async generateRealIptvTest(
    request: RealTestGenerationRequest,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<RealTestGenerationResult> {
    return await this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      let currentStep = 'início da solicitação';
      const noteToFill = request.note || `Teste - ${request.customerName.trim()} (#${request.customerId.slice(-6)})`;

      try {
        log(`[TEST] Solicitação de teste recebida`, 'INFO');
        log(`[TEST] Cliente ID: ${request.customerId}`, 'INFO');
        log(`[TEST] TestRequestId: ${request.testRequestId}`, 'INFO');

        currentStep = 'inicialização da página do painel';
        const page = await this.ensurePageReady(onLog);

        currentStep = 'navegação para usuários IPTV';
        if (!page.url().includes('users-iptv') && !page.url().includes(this.panelUrl)) {
          log(`[TEST] Redirecionando para ${this.panelUrl}...`, 'INFO');
          await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        }

        // Aguardar o carregamento inicial da página
        await page.waitForTimeout(1500);

        // ==================================================
        // PASSO 1 — LOCALIZAR E CLICAR NO BOTÃO "Gerar IPTV"
        // ==================================================
        currentStep = 'localização do botão Gerar IPTV';
        log(`[TEST] Abrindo fluxo "Gerar IPTV"`, 'INFO');

        // Seletor real: <button type="button" class="btn btn-outline-success btn-sm mb-2 mt-2">Gerar IPTV</button>
        let generateButton = null;
        const candidateButtons = page.locator('button.btn-outline-success, button.btn-success, button');
        const totalBtns = await candidateButtons.count();

        for (let i = 0; i < totalBtns; i++) {
          const btn = candidateButtons.nth(i);
          const isVis = await btn.isVisible().catch(() => false);
          if (isVis) {
            const txt = ((await btn.textContent().catch(() => '')) || '').trim();
            if (txt === 'Gerar IPTV' || txt.includes('Gerar IPTV') || (txt.includes('Gerar') && !txt.includes('+30'))) {
              generateButton = btn;
              break;
            }
          }
        }

        if (!generateButton) {
          throw new Error('Botão "Gerar IPTV" não foi encontrado ou não está visível no painel.');
        }

        log(`[TEST] Botão "Gerar IPTV" encontrado`, 'INFO');
        log(`[TEST] Botão "Gerar IPTV" clicado`, 'INFO');
        await generateButton.click();

        // ==================================================
        // PASSO 2 — PRIMEIRO SWEETALERT: NOTA DO TESTE
        // ==================================================
        currentStep = 'preenchimento da nota no SweetAlert';
        // <input id="swal2-input" class="swal2-input" placeholder="Insira aqui uma nota para o usuário" type="text">
        const swalPopup1 = page.locator('.swal2-popup:visible').last();
        await swalPopup1.waitFor({ state: 'visible', timeout: 15000 });

        const noteInput = swalPopup1.locator('input#swal2-input:visible, input.swal2-input:visible').first();
        await noteInput.waitFor({ state: 'visible', timeout: 10000 });

        log(`[TEST] SweetAlert da nota localizado`, 'INFO');
        await noteInput.fill(noteToFill);
        log(`[TEST] Nota preenchida`, 'INFO');

        log(`[TEST] Confirmando nota`, 'INFO');
        const confirmBtn1 = swalPopup1
          .locator('button.swal2-confirm:visible, .swal2-actions button.swal2-confirm:visible, button.swal2-styled:visible')
          .first();
        await confirmBtn1.click();

        // ==================================================
        // PASSO 3 — SEGUNDO SWEETALERT: SELEÇÃO DO TEMPO (1 HORA)
        // ==================================================
        currentStep = 'seleção da duração (1 Hora)';
        await page.waitForTimeout(600);

        // <select id="swal2-select" class="swal2-select">
        //   <option value="" disabled="">Selecione o tempo de teste</option>
        //   <option value="1">1 Hora</option>
        //   ...
        // </select>
        const swalPopup2 = page.locator('.swal2-popup:visible').last();
        await swalPopup2.waitFor({ state: 'visible', timeout: 15000 });

        const durationSelect = swalPopup2.locator('select#swal2-select:visible, select.swal2-select:visible').first();
        await durationSelect.waitFor({ state: 'visible', timeout: 10000 });

        log(`[TEST] SweetAlert de seleção de duração localizado`, 'INFO');
        log(`[TEST] Selecionando duração: 1 Hora`, 'INFO');
        await durationSelect.selectOption('1');
        await page.waitForTimeout(300);

        const selectedValue = await durationSelect.inputValue().catch(() => '');
        if (selectedValue !== '1') {
          throw new Error(`Falha ao selecionar '1' (1 Hora) no seletor de duração. Valor lido: ${selectedValue}`);
        }
        log(`[TEST] Valor selecionado: ${selectedValue}`, 'INFO');

        log(`[TEST] Confirmando criação do teste`, 'INFO');
        const confirmBtn2 = swalPopup2
          .locator('button.swal2-confirm:visible, .swal2-actions button.swal2-confirm:visible, button.swal2-styled:visible')
          .first();
        await confirmBtn2.click();

        // ==================================================
        // PASSO 4 — AGUARDAR CRIAÇÃO REAL & MODAL DE RESULTADO
        // ==================================================
        currentStep = 'aguardar criação e modal de resultado';
        log(`[TEST] Aguardando criação real no painel`, 'INFO');
        await page.waitForTimeout(1500);

        let rawModalText = '';
        let rawModalHtml = '';
        let extractedUser = '';
        let extractedPass = '';
        let extractedExpiry = '';
        let modalFound = false;

        // Inspecionar se o modal de resultado do painel abre
        // Modal structure: <div class="modal-header"><div class="text-muted text-center mb-1"></div><button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="false">×</span></button></div>
        for (let attempt = 0; attempt < 25; attempt++) {
          const modalEl = page
            .locator('.modal.show:visible, .modal:visible, .modal-content:visible, .modal-dialog:visible, div[role="dialog"]:visible, .swal2-popup:visible')
            .first();

          if ((await modalEl.count()) > 0 && (await modalEl.isVisible())) {
            const text = (await modalEl.innerText().catch(() => '')) || '';
            const html = (await modalEl.innerHTML().catch(() => '')) || '';
            if (text.length > 5 || html.includes('modal-header') || html.includes('close')) {
              rawModalText = text;
              rawModalHtml = html;
              modalFound = true;
              break;
            }
          }
          await page.waitForTimeout(500);
        }

        if (modalFound) {
          log(`[TEST] Modal de resultado localizado`, 'INFO');
          log(`[TEST] Conteúdo do modal:\n${rawModalText}`, 'INFO');
        } else {
          log(`[TEST] Modal direto não detectado após confirmação, inspecionando DOM e tabela...`, 'INFO');
        }

        log(`[TEST] Extraindo dados reais do painel`, 'INFO');
        currentStep = 'extração dos dados reais';

        // 1. Extração por Expressões Regulares no Texto do Modal
        if (rawModalText) {
          const userMatch = rawModalText.match(/(?:usu[aá]rio|login|user|conta)\s*[:=]?\s*([a-zA-Z0-9_\-\.]+)/i);
          if (userMatch) extractedUser = userMatch[1].trim();

          const passMatch = rawModalText.match(/(?:senha|password|pass|chave)\s*[:=]?\s*([a-zA-Z0-9_\-\.\@\#\$\%\&\*\!\?]+)/i);
          if (passMatch) extractedPass = passMatch[1].trim();

          const expiryMatch = rawModalText.match(
            /(?:vencimento|validade|expira[cç][aã]o|expira|vence)\s*[:=]?\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4}(?:\s+[0-9]{2}:[0-9]{2}(?::[0-9]{2})?)?)/i
          );
          if (expiryMatch) extractedExpiry = expiryMatch[1].trim();
        }

        // 2. Extração por Inputs dentro do Modal
        if ((!extractedUser || !extractedPass || !extractedExpiry) && rawModalHtml) {
          const inputs = page.locator('.modal.show input, .modal:visible input, .modal-content:visible input, .swal2-popup:visible input');
          const inputCount = await inputs.count();
          for (let i = 0; i < inputCount; i++) {
            const inp = inputs.nth(i);
            const val = (await inp.inputValue().catch(() => ''))?.trim();
            const name = (await inp.getAttribute('name').catch(() => ''))?.toLowerCase() || '';
            const placeholder = (await inp.getAttribute('placeholder').catch(() => ''))?.toLowerCase() || '';
            const id = (await inp.getAttribute('id').catch(() => ''))?.toLowerCase() || '';

            if (val) {
              if (!extractedUser && (name.includes('user') || name.includes('login') || placeholder.includes('user') || id.includes('user'))) {
                extractedUser = val;
              } else if (
                !extractedPass &&
                (name.includes('pass') || name.includes('senha') || placeholder.includes('pass') || placeholder.includes('senha') || id.includes('pass'))
              ) {
                extractedPass = val;
              }
            }
          }
        }

        // 3. Fallback: Se necessário confirmar na tabela do painel, localizar o usuário pelo identificador correspondente à nota utilizada
        // NÃO fazer: page.locator('.iptv-username').first()
        if (!extractedUser || !extractedPass || !extractedExpiry) {
          log(`[TEST] Localizando registro na tabela pela nota de identificação ("${noteToFill}")...`, 'INFO');
          await page.waitForTimeout(1000);
          const rows = page.locator('tr');
          const rowCount = await rows.count();
          for (let i = 0; i < rowCount; i++) {
            const row = rows.nth(i);
            const rowText = (await row.innerText().catch(() => '')) || '';
            if (rowText.includes(request.customerName.trim()) || rowText.includes(`#${request.customerId.slice(-6)}`)) {
              const userInRow = (await row.locator('.iptv-username').first().textContent().catch(() => ''))?.trim();
              const passInRow = (await row.locator('.iptv-col-password').first().textContent().catch(() => ''))?.trim();
              const expiryInRow = (await row.locator('.iptv-col-expiry b, .iptv-col-expiry').first().textContent().catch(() => ''))?.trim();

              if (userInRow && !extractedUser) extractedUser = userInRow;
              if (passInRow && !extractedPass) extractedPass = passInRow;
              if (expiryInRow && !extractedExpiry) extractedExpiry = expiryInRow;
              break;
            }
          }
        }

        // Fechar modal de resultado se ainda estiver aberto
        try {
          const closeBtn = page
            .locator(
              '.modal.show button.close, .modal:visible button.close, .modal-content:visible button.close, button[data-dismiss="modal"], .swal2-confirm:visible'
            )
            .first();
          if ((await closeBtn.count()) > 0 && (await closeBtn.isVisible())) {
            await closeBtn.click().catch(() => {});
          }
        } catch {
          // ignore
        }

        // ==================================================
        // PASSO 5 — VALIDAÇÃO DOS DADOS REAIS
        // ==================================================
        currentStep = 'validação dos dados extraídos';
        log(`[TEST] Validando dados`, 'INFO');

        if (!extractedUser || !extractedPass || !extractedExpiry) {
          const errorMsg = 'O painel criou o teste, mas os dados reais não foram encontrados.';
          log(`[TEST ERROR] ${errorMsg}`, 'ERROR');
          log(`[TEST ERROR] Etapa: ${currentStep}`, 'ERROR');
          log(`[TEST ERROR] Cliente: ${request.customerId}`, 'ERROR');
          log(`[TEST ERROR] TestRequestId: ${request.testRequestId}`, 'ERROR');
          log(
            `[TEST ERROR] Usuário extraído: '${extractedUser}', Senha: '${extractedPass ? '***' : ''}', Vencimento: '${extractedExpiry}'`,
            'ERROR'
          );

          return {
            success: false,
            testRequestId: request.testRequestId,
            customerId: request.customerId,
            username: extractedUser || '',
            password: extractedPass || '',
            expirationDate: extractedExpiry || '',
            rawModalText,
            rawModalHtml,
            error: errorMsg,
          };
        }

        log(`[TEST] Usuário real: ${extractedUser}`, 'INFO');
        log(`[TEST] Senha real encontrada`, 'INFO');
        log(`[TEST] Vencimento real: ${extractedExpiry}`, 'INFO');

        return {
          success: true,
          testRequestId: request.testRequestId,
          customerId: request.customerId,
          username: extractedUser,
          password: extractedPass,
          expirationDate: extractedExpiry,
          note: noteToFill,
          rawModalText,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[TEST ERROR] ${errMsg}`, 'ERROR');
        log(`[TEST ERROR] Etapa: ${currentStep}`, 'ERROR');
        log(`[TEST ERROR] Cliente: ${request.customerId}`, 'ERROR');
        log(`[TEST ERROR] TestRequestId: ${request.testRequestId}`, 'ERROR');

        return {
          success: false,
          testRequestId: request.testRequestId,
          customerId: request.customerId,
          username: '',
          password: '',
          expirationDate: '',
          error: errMsg,
        };
      }
    });
  }

  /**
   * Ativa o endereço MAC da TV do cliente (aplicativo Prime TV) no painel IPTV
   * utilizando os seletores oficiais fornecidos.
   */
  public async activatePrimeMac(
    iptvUsername: string,
    macAddress: string,
    onLog?: (msg: string, level?: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR') => void
  ): Promise<{ success: boolean; message: string }> {
    return this.withLock(async () => {
      const timestamp = () => new Date().toLocaleTimeString('pt-BR');
      const log = (msg: string, level: 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR' = 'INFO') => {
        console.log(msg);
        onLog?.(`[${timestamp()}] ${msg}`, level);
      };

      try {
        log(`[PRIME MAC] Iniciando ativação do MAC ${macAddress} para o usuário ${iptvUsername}...`, 'INFO');

        if (!this.context || !this.page || this.page.isClosed()) {
          log('[PRIME MAC] Navegador desconectado. Conectando...', 'INFO');
          await this.connectBrowser(onLog);
        }

        const page = this.page;
        if (!page || page.isClosed()) {
          throw new Error('Página do painel IPTV indisponível.');
        }

        // Assegurar que estamos na página de usuários IPTV
        const currentUrl = page.url();
        if (!currentUrl.includes('#/users-iptv')) {
          log('[PRIME MAC] Navegando para #/users-iptv...', 'INFO');
          try {
            await page.goto('https://searchdefense.top', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.evaluate(() => { window.location.hash = '#/users-iptv'; });
          } catch {
            await page.goto(this.panelUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          await page.waitForTimeout(2000);
        }

        // 1. Encontrar a linha do usuário na tabela
        log(`[PRIME MAC] Procurando usuário ${iptvUsername} na tabela...`, 'INFO');
        await page.waitForSelector('table, .card, .table', { timeout: 15000 }).catch(() => {});

        const row = page.locator(`tr:has-text("${iptvUsername}")`).first();
        const rowCount = await row.count();
        if (rowCount === 0) {
          throw new Error(`Usuário IPTV "${iptvUsername}" não encontrado na tabela do painel.`);
        }

        log(`[PRIME MAC] Usuário localizado. Abrindo menu de ações...`, 'INFO');

        // 2. Clicar no botão de menu dropdown (...) na linha do usuário
        const dropdownBtn = row.locator('.dropdown a, .btn-icon-only, .fa-ellipsis-v, [data-toggle="dropdown"]').first();
        await dropdownBtn.click({ timeout: 5000 });
        await page.waitForTimeout(800);

        // 3. Clicar no botão "Ativar Prime"
        log(`[PRIME MAC] Clicando em "Ativar Prime"...`, 'INFO');
        const ativarPrimeBtn = page.locator('button:has-text("Ativar Prime"), .btn-outline-info').filter({ hasText: 'Ativar Prime' }).first();
        await ativarPrimeBtn.click({ timeout: 5000 });
        await page.waitForTimeout(1000);

        // 4. Preencher o input #macAddress do SweetAlert
        log(`[PRIME MAC] Preenchendo endereço MAC: ${macAddress}...`, 'INFO');
        const macInput = page.locator('#macAddress, input.swal2-input').first();
        await macInput.waitFor({ state: 'visible', timeout: 8000 });
        await macInput.fill(macAddress);
        await page.waitForTimeout(500);

        // 5. Clicar no botão de confirmação "Ativar" do SweetAlert
        log(`[PRIME MAC] Confirmando ativação...`, 'INFO');
        const confirmBtn = page.locator('button.swal2-confirm, button:has-text("Ativar")').filter({ hasText: 'Ativar' }).last();
        await confirmBtn.click({ timeout: 5000 });
        await page.waitForTimeout(2000);

        log(`[PRIME MAC] ✅ MAC ${macAddress} ativado com sucesso para ${iptvUsername}!`, 'SUCCESS');
        return {
          success: true,
          message: `MAC ${macAddress} ativado com sucesso para o usuário ${iptvUsername}!`,
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[PRIME MAC ERRO] ${errMsg}`, 'ERROR');
        return {
          success: false,
          message: `Falha ao ativar MAC no painel: ${errMsg}`,
        };
      }
    });
  }

  /**
   * Obtém diagnóstico real do Playwright
   */
  public async getDiagnostic(): Promise<AutomationDiagnostic> {
    const isRunning = !!this.context && !!this.page;
    const isClosed = this.page ? this.page.isClosed() : true;
    let currentUrl = 'N/A';
    let title = 'N/A';
    let usersFound = 0;
    let rowsFound = 0;

    if (isRunning && this.page && !isClosed) {
      try {
        currentUrl = this.page.url();
        title = await this.page.title().catch(() => 'N/A');
        usersFound = await this.page.locator('.iptv-username').count().catch(() => 0);
        rowsFound = await this.page.locator('tr').count().catch(() => 0);

        if (usersFound > 0) {
          this.connectionStatus = 'CONECTADO';
        } else if (this.connectionStatus !== 'CONECTANDO' && this.connectionStatus !== 'ERRO') {
          const isLogin = await this.page
            .$('input[type="password"], input[name="username"], input[name="login"], form.login-form, .login-box')
            .catch(() => null);
          if (isLogin) {
            this.connectionStatus = 'AGUARDANDO_LOGIN';
          }
        }
      } catch {
        // ignore
      }
    } else {
      this.connectionStatus = 'DESCONECTADO';
    }

    return {
      browserRunning: isRunning && !isClosed,
      contextReady: !!this.context,
      pageReady: isRunning && !isClosed && currentUrl.includes('users-iptv'),
      pageClosed: isClosed,
      currentUrl,
      title,
      usersFound,
      rowsFound,
      connectionStatus: this.connectionStatus,
      profileDirectory: path.resolve(this.profileDir),
      lastError: this.lastError,
    };
  }

  public parseDate(dateStr: string): Date {
    try {
      if (!dateStr) return new Date();
      const clean = dateStr.replace(',', '').trim();
      const parts = clean.split(' ');
      const datePart = parts[0];
      const timePart = parts[1];

      if (datePart.includes('/')) {
        const [day, month, year] = datePart.split('/').map(Number);
        let hour = 12;
        let min = 0;
        let sec = 0;
        if (timePart && timePart.includes(':')) {
          const tParts = timePart.split(':').map(Number);
          hour = tParts[0] || 0;
          min = tParts[1] || 0;
          sec = tParts[2] || 0;
        }
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          return new Date(year, month - 1, day, hour, min, sec);
        }
      }
      return new Date(dateStr);
    } catch {
      return new Date();
    }
  }
}

// Export singleton instance
export const playwrightAutomation = new IptvAutomationService();
