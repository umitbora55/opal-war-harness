import { readStructuredFile } from './parser.js';
import type { OverridePolicyRecord } from './types.js';
import type { Severity } from '../core/types.js';

export interface OverrideRecord {
  override_id: string;
  gate_id: string;
  feature_id?: string;
  anomaly_codes: string[];
  approvers: string[];
  created_at: string;
  expires_at: string;
  dual_control: boolean;
  audit_reference: string;
  status: 'active' | 'expired' | 'revoked';
  review_required: boolean;
}

export interface OverrideAssessment {
  active: OverrideRecord[];
  expired: OverrideRecord[];
  invalid: string[];
  overrideDebt: string[];
  isOverrideActive: boolean;
}

function parseDate(value: string): number {
  return Date.parse(value);
}

function parseDurationToMs(duration: string | null): number {
  if (!duration) {
    return Number.NaN;
  }
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/u.exec(duration);
  if (!iso) {
    return Number.NaN;
  }
  const days = Number(iso[1] ?? '0');
  const hours = Number(iso[2] ?? '0');
  const minutes = Number(iso[3] ?? '0');
  return (((days * 24) + hours) * 60 + minutes) * 60 * 1000;
}

export async function loadOverrideRecords(path?: string): Promise<OverrideRecord[]> {
  if (!path) {
    return [];
  }
  const parsed = await readStructuredFile<{ overrides: OverrideRecord[] }>(path);
  return parsed.overrides ?? [];
}

export function evaluateOverrides(
  policy: OverridePolicyRecord,
  activeOverrides: OverrideRecord[],
  gateId: string,
  anomalyCodes: string[],
  now = new Date(),
): OverrideAssessment {
  const active: OverrideRecord[] = [];
  const expired: OverrideRecord[] = [];
  const invalid: string[] = [];
  const overrideDebt: string[] = [];

  for (const override of activeOverrides.filter((item) => item.gate_id === gateId)) {
    const createdAt = parseDate(override.created_at);
    const expiresAt = parseDate(override.expires_at);
    const ttlMs = parseDurationToMs(policy.ttl);
    if (!policy.overrideable) {
      invalid.push(`${override.override_id}: gate not overrideable`);
      continue;
    }
    if (!override.dual_control && policy.dual_control) {
      invalid.push(`${override.override_id}: dual control missing`);
      continue;
    }
    if (policy.required_approvers.length > 0 && override.approvers.length < policy.required_approvers.length) {
      invalid.push(`${override.override_id}: insufficient approvers`);
      continue;
    }
    if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || Number.isNaN(ttlMs)) {
      invalid.push(`${override.override_id}: invalid timestamps`);
      continue;
    }
    if (now.getTime() > expiresAt || now.getTime() - createdAt > ttlMs) {
      expired.push(override);
      overrideDebt.push(`${override.override_id}: expired`);
      continue;
    }
    if (override.status !== 'active') {
      invalid.push(`${override.override_id}: inactive status`);
      continue;
    }
    const forbidden = override.anomaly_codes.some((code) => policy.forbidden_anomalies.includes(code));
    if (forbidden && anomalyCodes.some((code) => override.anomaly_codes.includes(code))) {
      invalid.push(`${override.override_id}: forbidden anomaly covered`);
      continue;
    }
    active.push(override);
    if (override.review_required || policy.post_override_review_required) {
      overrideDebt.push(`${override.override_id}: post-override review required`);
    }
  }

  return {
    active,
    expired,
    invalid,
    overrideDebt,
    isOverrideActive: active.length > 0,
  };
}
