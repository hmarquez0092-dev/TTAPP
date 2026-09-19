// Debe coincidir exactamente con vehicle_status en db/schema.sql
export enum VehicleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE',
  BLOCKED = 'BLOCKED',
}
