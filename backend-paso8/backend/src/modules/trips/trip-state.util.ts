import { ConflictException } from '@nestjs/common';
import { TripStatus } from '../../common/enums';
import { Trip } from './entities/trip.entity';

// Guardia transversal: TODO metodo que muta trip.status debe llamar esto
// primero, antes de cualquier otra escritura. Es la unica fuente de
// verdad de que transiciones son validas (ver tabla en
// docs/02-especificacion-paso7.md, Ticket 7.20).
export function assertTransition(trip: Trip, allowedFrom: TripStatus[]): void {
  if (!allowedFrom.includes(trip.status)) {
    throw new ConflictException(
      `El viaje esta en estado ${trip.status}; se esperaba uno de: ${allowedFrom.join(', ')}`,
    );
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
