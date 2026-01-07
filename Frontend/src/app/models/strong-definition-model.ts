export interface StrongDefinition {
  id: string;
  lemma: string;
  translit: string;
  pronounce: string;
  defs: {
    hu?: string;
    en?: string;
  };
}
