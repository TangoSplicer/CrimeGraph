import QRCode from 'qrcode';

const QR_PREFIX = 'CGX1.';

export interface ExhibitQrReference {
  caseId: string;
  nodeId: string;
  exhibitNumber: string;
  provenanceFingerprint: string;
}

const base64UrlEncode = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value: string): string => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const clean = (value: unknown, limit: number): string => typeof value === 'string' ? value.trim().slice(0, limit) : '';

export const buildExhibitQrPayload = (reference: ExhibitQrReference): string => {
  const normalized = {
    c: clean(reference.caseId, 180),
    n: clean(reference.nodeId, 180),
    e: clean(reference.exhibitNumber, 80),
    p: clean(reference.provenanceFingerprint, 180),
  };
  if (!normalized.c || !normalized.n || !normalized.e || !normalized.p) throw new Error('An exhibit label requires a case, evidence item, exhibit number, and provenance fingerprint.');
  return `${QR_PREFIX}${base64UrlEncode(JSON.stringify(normalized))}`;
};

export const parseExhibitQrPayload = (payload: string): ExhibitQrReference => {
  const source = clean(payload, 2048);
  if (!source.startsWith(QR_PREFIX)) throw new Error('This is not a CrimeGraph exhibit QR label.');
  try {
    const parsed = JSON.parse(base64UrlDecode(source.slice(QR_PREFIX.length))) as Record<string, unknown>;
    const reference = {
      caseId: clean(parsed.c, 180), nodeId: clean(parsed.n, 180), exhibitNumber: clean(parsed.e, 80), provenanceFingerprint: clean(parsed.p, 180),
    };
    if (!reference.caseId || !reference.nodeId || !reference.exhibitNumber || !reference.provenanceFingerprint) throw new Error('missing fields');
    return reference;
  } catch {
    throw new Error('The exhibit QR label payload is malformed or incomplete.');
  }
};

export const verifyExhibitQrReference = (payload: string, reference: ExhibitQrReference): boolean => {
  try {
    const parsed = parseExhibitQrPayload(payload);
    return parsed.caseId === reference.caseId
      && parsed.nodeId === reference.nodeId
      && parsed.exhibitNumber === reference.exhibitNumber
      && parsed.provenanceFingerprint === reference.provenanceFingerprint;
  } catch {
    return false;
  }
};

export const renderExhibitQrDataUrl = async (payload: string): Promise<string> => {
  parseExhibitQrPayload(payload);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 300,
    color: { dark: '#0c0e14', light: '#ffffff' },
  });
};
