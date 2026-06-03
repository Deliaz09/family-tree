export async function salveazaCuConfirmare(trimite) {
  try {
    return await trimite(false);
  } catch (err) {
    const warnings = err.response?.status === 409
      ? err.response?.data?.detail?.warnings
      : null;
    if (Array.isArray(warnings) && warnings.length) {
      const ok = window.confirm(
        '⚠ Avertismente:\n\n• ' + warnings.join('\n• ') + '\n\nSalvezi oricum?'
      );
      if (ok) return await trimite(true);
      const anulare = new Error('Salvare anulată.');
      anulare.anulat = true;
      throw anulare;
    }
    throw err;
  }
}
