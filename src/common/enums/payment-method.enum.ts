// El dinero solo pasa por la plataforma en DIGITAL_INAPP (fuera de
// alcance del piloto). CASH y CARD_TERMINAL se confirman manualmente
// por el conductor — ver docs/01-fundamentos-tecnicos.md 2.4
export enum PaymentMethod {
  CASH = 'CASH',
  CARD_TERMINAL = 'CARD_TERMINAL',
  DIGITAL_INAPP = 'DIGITAL_INAPP',
}
