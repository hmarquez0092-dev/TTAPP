// Debe coincidir exactamente con driver_status en db/schema.sql
export enum DriverStatus {
  OFFLINE = 'OFFLINE',
  AVAILABLE = 'AVAILABLE',
  ON_SHIFT = 'ON_SHIFT',
  BUSY = 'BUSY',
  PAUSED = 'PAUSED',
  BLOCKED = 'BLOCKED',
  EMERGENCY = 'EMERGENCY',
}
