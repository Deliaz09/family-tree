export function slugFilename(name) {
  if (!name) return name;
  const faraSemne = name.normalize('NFKD').replace(/\p{Mn}/gu, '');
  return Array.from(faraSemne, c => (c.charCodeAt(0) < 128 ? c : '_')).join('');
}
