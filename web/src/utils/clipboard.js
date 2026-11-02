/**
 * Salin teks ke clipboard dengan fallback.
 * navigator.clipboard hanya ada di konteks aman (HTTPS/localhost); lewat Tailscale
 * HTTP ia tidak tersedia, jadi jatuh ke execCommand('copy') lewat textarea sementara.
 * @returns {Promise<boolean>} true jika berhasil
 */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // lanjut ke fallback
  }

  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
