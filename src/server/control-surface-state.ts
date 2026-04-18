import { stableHash } from '../core/hash.js';

export interface ControlSurfaceTenantRecord {
  tenantId: string;
  bootstrapToken: string;
  createdAt: string;
  cleanedAt?: string;
}

export class ControlSurfaceState {
  private readonly tenants = new Map<string, ControlSurfaceTenantRecord>();

  ping() {
    return {
      ok: true,
      synthetic: true,
      tenantCount: this.tenants.size,
    };
  }

  bootstrap(tenantId: string): ControlSurfaceTenantRecord {
    const existing = this.tenants.get(tenantId);
    if (existing) {
      return existing;
    }
    const record: ControlSurfaceTenantRecord = {
      tenantId,
      bootstrapToken: stableHash(`${tenantId}:bootstrap`).slice(0, 16),
      createdAt: new Date().toISOString(),
    };
    this.tenants.set(tenantId, record);
    return record;
  }

  cleanup(tenantId: string): ControlSurfaceTenantRecord {
    const existing = this.tenants.get(tenantId);
    if (existing) {
      const record = { ...existing, cleanedAt: new Date().toISOString() };
      this.tenants.set(tenantId, record);
      return record;
    }
    const record: ControlSurfaceTenantRecord = {
      tenantId,
      bootstrapToken: stableHash(`${tenantId}:cleanup`).slice(0, 16),
      createdAt: new Date().toISOString(),
      cleanedAt: new Date().toISOString(),
    };
    this.tenants.set(tenantId, record);
    return record;
  }
}
