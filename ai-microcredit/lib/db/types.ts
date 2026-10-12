export interface Database {
  query<T>(sql: string, parameters?: unknown[]): Promise<{ rows: T[] }>;
}
