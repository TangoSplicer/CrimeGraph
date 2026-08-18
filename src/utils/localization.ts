export type SupportedLocale = 'en' | 'es' | 'fr' | 'de';

export const localizedStrings: Record<SupportedLocale, Record<string, string>> = {
  en: {
    appTitle: 'CrimeGraph',
    workspace: 'Graph Workspace',
    dossier: 'Forensic Dossier',
    assurance: 'Device Assurance',
    sync: 'P2P Synchronization',
    conflicts: 'Conflict Workbench',
    archive: 'Case Archive',
    newEntity: 'New Entity',
    newRelationship: 'New Relationship',
    newNote: 'Intelligence Note',
    evidenceIntake: 'Evidence Intake',
    exhibitCustody: 'Exhibit Custody',
  },
  es: {
    appTitle: 'CrimeGraph',
    workspace: 'Espacio de Trabajo de Grafos',
    dossier: 'Dosier Forense',
    assurance: 'Garantía del Dispositivo',
    sync: 'Sincronización P2P',
    conflicts: 'Banco de Conflictos',
    archive: 'Archivo de Casos',
    newEntity: 'Nueva Entidad',
    newRelationship: 'Nueva Relación',
    newNote: 'Nota de Inteligencia',
    evidenceIntake: 'Admisión de Evidencia',
    exhibitCustody: 'Custodia de Exhibición',
  },
  fr: {
    appTitle: 'CrimeGraph',
    workspace: 'Espace de Travail Graphique',
    dossier: 'Dossier Médico-Légal',
    assurance: 'Assurance de l\'Appareil',
    sync: 'Synchronisation P2P',
    conflicts: 'Banc de Conflits',
    archive: 'Archive de Dossier',
    newEntity: 'Nouvelle Entité',
    newRelationship: 'Nouvelle Relation',
    newNote: 'Note de Renseignement',
    evidenceIntake: 'Admission de Preuve',
    exhibitCustody: 'Garde des Pièces',
  },
  de: {
    appTitle: 'CrimeGraph',
    workspace: 'Graph-Arbeitsbereich',
    dossier: 'Forensisches Dossier',
    assurance: 'Gerätesicherheit',
    sync: 'P2P-Synchronisation',
    conflicts: 'Konflikt-Workbench',
    archive: 'Fallarchiv',
    newEntity: 'Neue Entität',
    newRelationship: 'Neue Beziehung',
    newNote: 'Nachrichtendienstliche Notiz',
    evidenceIntake: 'Beweismittelaufnahme',
    exhibitCustody: 'Asservaten-Verwahrung',
  },
};

let currentLocale: SupportedLocale = 'en';

export function setLocale(locale: SupportedLocale) {
  if (localizedStrings[locale]) {
    currentLocale = locale;
  }
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function t(key: string): string {
  return localizedStrings[currentLocale]?.[key] || localizedStrings.en[key] || key;
}
