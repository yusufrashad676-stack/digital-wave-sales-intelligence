export interface ImportSourceSnapshot {
  id: string;
  code: string;
  name: string;
  category: string;
  enabled: boolean;
  capabilities: string[];
}

export const ImportSourceRepository = Symbol('ImportSourceRepository');

export interface ImportSourceRepository {
  findByCode(code: string): Promise<ImportSourceSnapshot | null>;
}
