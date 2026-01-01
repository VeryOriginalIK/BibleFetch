export interface StrongDefinition {
  id: string; // H7225
  lemma: string; // Eredeti szó
  translit: string; // Kiejtés
  pronounce: string;
  defs: { [lang: string]: string }; // { hu: "Kezdet..." }
}
