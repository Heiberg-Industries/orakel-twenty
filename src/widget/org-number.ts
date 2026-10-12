import { detectCountry } from 'src/enrichment/orakel-api';

// An org number as "Use this" may store it: one of the Nordic formats Orakel knows (Norway 9
// digits, Finland 7+1 with a hyphen, Sweden 10, Denmark 8). Spaces are dropped; nothing else is
// rewritten, so the number is stored exactly as Orakel gave it.
export const cleanOrgNumber = (raw: unknown): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }
  const cleaned = raw.replace(/\s+/g, '');

  return detectCountry(cleaned) ? cleaned : null;
};
