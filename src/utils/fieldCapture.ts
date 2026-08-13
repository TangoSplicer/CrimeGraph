import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Directory, Filesystem } from '@capacitor/filesystem';

export interface CapturedEvidenceAttachment {
  attachmentName: string;
  attachmentUri: string;
  attachmentMimeType: string;
  attachmentDigest: string;
}

const base64ToBytes = (value: string): Uint8Array => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes as any));
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join('');
};

export const captureEvidencePhoto = async (caseId: string): Promise<CapturedEvidenceAttachment> => {
  if (!caseId) throw new Error('Select a case before capturing field media.');
  const photo = await Camera.getPhoto({
    quality: 90,
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.Base64,
    source: CameraSource.Prompt,
  });
  if (!photo.base64String) throw new Error('The selected image did not provide readable capture data.');

  const format = photo.format === 'png' ? 'png' : 'jpeg';
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const attachmentName = `capture_${new Date().toISOString().replace(/[:.]/g, '-')}_${window.crypto.randomUUID?.() || Date.now()}.${format}`;
  const result = await Filesystem.writeFile({
    path: `evidence/${caseId}/${attachmentName}`,
    data: photo.base64String,
    directory: Directory.Data,
    recursive: true,
  });
  return {
    attachmentName,
    attachmentUri: result.uri,
    attachmentMimeType: mimeType,
    attachmentDigest: await sha256Hex(base64ToBytes(photo.base64String)),
  };
};
