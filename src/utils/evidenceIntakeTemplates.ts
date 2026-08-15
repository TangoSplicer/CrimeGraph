import type { EvidenceSourceType } from './evidenceProvenance';

export type EvidenceIntakeTemplateId =
  | 'image'
  | 'video'
  | 'document'
  | 'physical_exhibit'
  | 'message'
  | 'device'
  | 'location_observation'
  | 'witness_material';

export interface EvidenceIntakeTemplate {
  id: EvidenceIntakeTemplateId;
  label: string;
  sourceType: EvidenceSourceType;
  summary: string;
  provenancePrompts: readonly string[];
  metadataFields: readonly string[];
  captureGuidance: string;
}

/**
 * These templates provide structured prompts only. They do not pre-fill source,
 * custody, verification, or legal conclusions; the operator must record facts.
 */
export const EVIDENCE_INTAKE_TEMPLATES: readonly EvidenceIntakeTemplate[] = [
  {
    id: 'image',
    label: 'Image / photograph',
    sourceType: 'digital',
    summary: 'Record whether this is an original capture, exported image, or supplied copy.',
    provenancePrompts: ['Record the original source or device.', 'Record the acquisition method and time.', 'Preserve the original file where available; do not overwrite it.'],
    metadataFields: ['Capture Method', 'Original Device / Source', 'Image Format', 'Depicted Location / Subject'],
    captureGuidance: 'Use the protected camera capture for a new field photograph. Its SHA-256 digest is bound automatically.',
  },
  {
    id: 'video',
    label: 'Video / recording',
    sourceType: 'digital',
    summary: 'Identify the original recording source, time coverage, and whether the file is complete or an extract.',
    provenancePrompts: ['Record original device, system, or provider.', 'Record start and end time coverage if known.', 'State whether the item is original, copied, or an excerpt.'],
    metadataFields: ['Recording Source', 'Time Coverage', 'File Format', 'Original / Copy / Extract'],
    captureGuidance: 'Do not record a conclusion from the footage as provenance. Describe the file and its acquisition instead.',
  },
  {
    id: 'document',
    label: 'Document',
    sourceType: 'document',
    summary: 'Identify the document’s issuer or holder, format, and whether the item is original or a reproduction.',
    provenancePrompts: ['Record issuer, holder, or originating system.', 'Record document date and version where visible.', 'State whether the item is original, copy, scan, or export.'],
    metadataFields: ['Issuer / Holder', 'Document Date', 'Version / Reference', 'Original / Copy / Scan'],
    captureGuidance: 'Keep source description factual. Verification status remains an explicit operator decision.',
  },
  {
    id: 'physical_exhibit',
    label: 'Physical exhibit',
    sourceType: 'physical',
    summary: 'Record the item’s packaging, condition, recovery location, and each handover factually.',
    provenancePrompts: ['Record recovery location and recovery circumstances.', 'Record packaging or seal reference.', 'Record every handover and storage location in custody notes.'],
    metadataFields: ['Item Description', 'Recovery Location', 'Packaging / Seal Reference', 'Storage Location'],
    captureGuidance: 'Use the chain-of-custody field for factual handling events. Do not infer continuity that was not observed.',
  },
  {
    id: 'message',
    label: 'Message / communication',
    sourceType: 'digital',
    summary: 'Describe the communication platform, acquisition route, account or device context, and time shown.',
    provenancePrompts: ['Record platform and acquisition route.', 'Record displayed sender/recipient context without asserting identity.', 'Record displayed message time and applicable timezone.'],
    metadataFields: ['Platform', 'Acquisition Route', 'Displayed Account / Number', 'Displayed Message Time'],
    captureGuidance: 'Capture the source and context; do not label a displayed account as a confirmed person unless separately evidenced.',
  },
  {
    id: 'device',
    label: 'Device',
    sourceType: 'physical',
    summary: 'Identify the device, its condition and state, recovery context, and protective handling used.',
    provenancePrompts: ['Record make, model, serial/IMEI where visible.', 'Record power or lock state as observed.', 'Record recovery, packaging, and storage facts.'],
    metadataFields: ['Make / Model', 'Serial / IMEI', 'Observed Power / Lock State', 'Packaging / Storage'],
    captureGuidance: 'Do not attempt a forensic extraction from this form. Record the device as an exhibit and preserve handling facts.',
  },
  {
    id: 'location_observation',
    label: 'Location observation',
    sourceType: 'observed',
    summary: 'Record the observation point, time, environmental conditions, and basis for the location reference.',
    provenancePrompts: ['Record the observation position or method.', 'Record observation time and relevant conditions.', 'Distinguish directly observed facts from later interpretation.'],
    metadataFields: ['Observation Point', 'Location Reference', 'Conditions / Visibility', 'Observation Method'],
    captureGuidance: 'A location observation is not a verified conclusion. Record the basis and preserve uncertainty in the description.',
  },
  {
    id: 'witness_material',
    label: 'Witness material',
    sourceType: 'witness',
    summary: 'Record the material source, method, time, and any original note or recording reference.',
    provenancePrompts: ['Record how the material was obtained.', 'Record the witness material reference without adding unnecessary personal data.', 'Record whether this is a contemporaneous note, later account, or recording.'],
    metadataFields: ['Material Format', 'Collection Method', 'Original Note / Recording Reference', 'Account Timeframe'],
    captureGuidance: 'Record attribution and collection facts. Verification status must not be inferred from the selected template.',
  },
] as const;

export const findEvidenceIntakeTemplate = (id: string): EvidenceIntakeTemplate | undefined =>
  EVIDENCE_INTAKE_TEMPLATES.find((template) => template.id === id);
