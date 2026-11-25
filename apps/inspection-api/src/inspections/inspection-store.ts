import type { Inspection, NewInspection } from './inspection.js';

export interface CreateResult {
  inspection: Inspection;
  /** False when a record with the same clientId already existed; that existing record is returned unchanged. */
  created: boolean;
}

/**
 * Persistence for inspection records. Implementations own their storage and nothing else:
 * validation and register checks happen before a record reaches the store.
 */
export interface InspectionStore {
  /** All records, most recently updated first. */
  list(): Promise<Inspection[]>;

  findById(id: string): Promise<Inspection | undefined>;

  /** The record a device created under this clientId, if it has already been stored. */
  findByClientId(clientId: string): Promise<Inspection | undefined>;

  /**
   * Inserts a record. If the input carries a clientId that an existing record already has, nothing is
   * inserted and the existing record is returned with created=false, even when two calls race.
   */
  create(input: NewInspection): Promise<CreateResult>;

  /**
   * Replaces every stored field of the record except id, clientId, capturedAt and createdAt, and sets updatedAt.
   * @returns the stored record, or undefined when no record has this id
   */
  update(inspection: Inspection): Promise<Inspection | undefined>;

  /** @returns true when a record was deleted */
  delete(id: string): Promise<boolean>;
}
