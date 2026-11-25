import { randomUUID } from 'node:crypto';
import type { Inspection, NewInspection } from '../../src/inspections/inspection.js';
import type { CreateResult, InspectionStore } from '../../src/inspections/inspection-store.js';

/**
 * Test double for the store: keeps records in memory and follows the InspectionStore contract,
 * including the clientId rule. Returned objects are copies, so a test cannot change stored state by accident.
 */
export class InMemoryInspectionStore implements InspectionStore {
  private readonly records = new Map<string, Inspection>();
  private tick = 0;

  async list(): Promise<Inspection[]> {
    return [...this.records.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(copy);
  }

  async findById(id: string): Promise<Inspection | undefined> {
    const found = this.records.get(id);
    return found ? copy(found) : undefined;
  }

  async findByClientId(clientId: string): Promise<Inspection | undefined> {
    const found = [...this.records.values()].find((record) => record.clientId === clientId);
    return found ? copy(found) : undefined;
  }

  async create(input: NewInspection): Promise<CreateResult> {
    if (input.clientId !== null) {
      const existing = [...this.records.values()].find((record) => record.clientId === input.clientId);
      if (existing) return { inspection: copy(existing), created: false };
    }
    const now = this.nextTimestamp();
    const inspection: Inspection = { ...copy(input), id: randomUUID(), createdAt: now, updatedAt: now };
    this.records.set(inspection.id, inspection);
    return { inspection: copy(inspection), created: true };
  }

  async update(inspection: Inspection): Promise<Inspection | undefined> {
    const existing = this.records.get(inspection.id);
    if (!existing) return undefined;
    const stored: Inspection = {
      ...copy(inspection),
      clientId: existing.clientId,
      capturedAt: existing.capturedAt,
      createdAt: existing.createdAt,
      updatedAt: this.nextTimestamp()
    };
    this.records.set(stored.id, stored);
    return copy(stored);
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }

  /** Number of stored records, for assertions that nothing was stored. */
  get size(): number {
    return this.records.size;
  }

  /** Strictly increasing timestamps, so ordering by updatedAt is deterministic within one millisecond. */
  private nextTimestamp(): string {
    this.tick += 1;
    return new Date(Date.UTC(2030, 0, 1) + this.tick).toISOString();
  }
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
