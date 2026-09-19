// Debe coincidir exactamente con service_category en db/schema.sql
// NORMAL / NOCTURNO tienen tarifario propio por zona (docs/01-fundamentos-tecnicos.md 2.5)
// FORANEO nunca se cotiza ni se despacha en automatico (ver trip-status.enum.ts)
export enum ServiceCategory {
  NORMAL = 'NORMAL',
  NOCTURNO = 'NOCTURNO',
  FORANEO = 'FORANEO',
}
