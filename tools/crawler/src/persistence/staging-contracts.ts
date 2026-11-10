import type { NormalizedCandidateOutput } from '../contracts/normalized-product.ts';
import type { RawProductEnvelope } from '../contracts/raw-product.ts';

export type DatabaseCandidateStatus = NormalizedCandidateOutput['normalizationStatus'] | 'IMPORTED';

export interface StagingProductPair {
  raw: RawProductEnvelope;
  candidate: NormalizedCandidateOutput;
}

export interface RawRecordState {
  id: string;
}

export interface CandidateRecordState {
  id: string;
  status: DatabaseCandidateStatus;
}

export interface ProductState {
  raw: RawRecordState | null;
  candidate: CandidateRecordState | null;
}

export interface StagingTransaction {
  findRaw(source: string, sourceProductId: string): Promise<RawRecordState | null>;
  createRaw(raw: RawProductEnvelope): Promise<RawRecordState>;
  updateRaw(id: string, raw: RawProductEnvelope): Promise<RawRecordState>;
  findCandidate(rawProductRecordId: string): Promise<CandidateRecordState | null>;
  createCandidate(
    rawProductRecordId: string,
    candidate: NormalizedCandidateOutput,
  ): Promise<CandidateRecordState>;
  updateCandidate(id: string, candidate: NormalizedCandidateOutput): Promise<CandidateRecordState>;
}

export interface StagingStore {
  inspect(source: string, sourceProductId: string): Promise<ProductState>;
  transaction<T>(work: (transaction: StagingTransaction) => Promise<T>): Promise<T>;
}

export interface PersistenceFailure {
  source: string;
  sourceProductId: string;
  reason: string;
}

export interface PersistenceSummary {
  mode: 'dry-run' | 'write';
  total: number;
  createdRaw: number;
  updatedRaw: number;
  createdCandidates: number;
  updatedCandidates: number;
  skippedImported: number;
  failed: number;
  failures: PersistenceFailure[];
}

export interface StagingVerification {
  source: string;
  rawCount: number;
  candidateCount: number;
  candidateStatusCounts: Record<string, number>;
  importedCount: number;
  nonNullImportedAtCount: number;
  duplicateRawIdentities: number;
  duplicateCandidateRelations: number;
}
