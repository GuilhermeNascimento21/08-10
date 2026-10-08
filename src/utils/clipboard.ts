/**
 * Helper resiliente para cópia para a área de transferência.
 * Suporta execução dentro de iframes (como Google AI Studio), mobile e navegadores legados
 * através do fallback document.execCommand('copy').
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Tentar Clipboard API nativa se permitida e disponível
  if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (clipErr) {
      console.warn('[CLIPBOARD] navigator.clipboard.writeText falhou ou bloqueado no iframe, acionando fallback:', clipErr);
    }
  }

  // 2. Fallback robusto com textarea invisível e execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    // Evita zoom em dispositivos móveis e rolagem de tela
    textArea.style.fontSize = '12pt';
    textArea.style.border = '0';
    textArea.style.padding = '0';
    textArea.style.margin = '0';
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = (window.pageYOffset || document.documentElement.scrollTop) + 'px';
    textArea.setAttribute('readonly', '');

    document.body.appendChild(textArea);
    textArea.focus({ preventScroll: true });
    textArea.select();
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      return true;
    }
  } catch (err) {
    console.error('[CLIPBOARD ERROR] Falha no fallback execCommand:', err);
  }

  // 3. Fallback prompt caso ambas as tentativas falhem
  try {
    window.prompt('Pressione Ctrl+C (ou Cmd+C) para copiar o código:', text);
    return true;
  } catch {
    return false;
  }
}
