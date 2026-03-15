export interface StrongDefinition {
  id: string;
  lemma: string;
  translit: string;
  pronounce: string;
  defs: Record<string, string>;
}
