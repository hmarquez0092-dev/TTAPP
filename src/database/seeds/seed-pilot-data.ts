// Ticket 7.0 de docs/02-especificacion-paso7.md
// Datos operativos del piloto: zona de cobertura, tarifas publicadas,
// horario nocturno, y parametros de configuracion que leen
// FareCalculationService y DispatchService.
//
// Los montos y el poligono son PLACEHOLDERS DE DESARROLLO — el negocio
// debe reemplazarlos con valores reales antes del piloto cerrado
// (ver docs/03-especificacion-paso8.md, seccion 3).
//
// Uso: npm run seed:pilot-data  (requiere haber corrido `npm run seed` antes)
import * as dotenv from 'dotenv';
dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

import { Client } from 'pg';

async function main() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    const org = await client.query(`SELECT id FROM organizations WHERE name = 'Piloto' LIMIT 1`);
    const organizationId = org.rows[0].id;

    const admin = await client.query(`SELECT id FROM users WHERE email = 'admin@piloto.mx' LIMIT 1`);
    const adminId = admin.rows[0].id;

    // --- Zona de servicio (poligono de ejemplo — reemplazar por el real) ---
    const existingZone = await client.query(
      `SELECT id FROM service_zones WHERE organization_id = $1 AND name = 'Zona Centro'`,
      [organizationId],
    );
    let zoneId: string;
    if (existingZone.rows.length > 0) {
      zoneId = existingZone.rows[0].id;
      console.log(`zona ya existia: ${zoneId}`);
    } else {
      const zoneRes = await client.query(
        `INSERT INTO service_zones (organization_id, name, area, active)
         VALUES ($1, 'Zona Centro', ST_GeomFromGeoJSON($2)::geography, true)
         RETURNING id`,
        [
          organizationId,
          JSON.stringify({
            type: 'Polygon',
            coordinates: [
              [
                [-98.78, 20.08],
                [-98.7, 20.08],
                [-98.7, 20.14],
                [-98.78, 20.14],
                [-98.78, 20.08],
              ],
            ],
          }),
        ],
      );
      zoneId = zoneRes.rows[0].id;
      console.log(`zona creada: ${zoneId}`);
    }

    // --- Tarifas publicadas (placeholders de desarrollo) ---
    for (const [category, base, perKm, perMin] of [
      ['NORMAL', 25.0, 8.0, 1.5],
      ['NOCTURNO', 35.0, 10.0, 2.0],
    ] as const) {
      const exists = await client.query(
        `SELECT id FROM fare_rules WHERE organization_id=$1 AND service_category=$2 AND status='PUBLISHED' AND zone_id IS NULL`,
        [organizationId, category],
      );
      if (exists.rows.length > 0) {
        console.log(`tarifa ${category} ya existia`);
        continue;
      }
      await client.query(
        `INSERT INTO fare_rules
           (organization_id, service_category, zone_id, name, version, base_fare, cost_per_km, cost_per_minute, valid_from, status, created_by, published_by)
         VALUES ($1, $2, NULL, $3, 1, $4, $5, $6, now(), 'PUBLISHED', $7, $7)`,
        [organizationId, category, `${category} v1`, base, perKm, perMin, adminId],
      );
      console.log(`tarifa ${category} creada`);
    }

    // --- Horario nocturno ---
    const scheduleExists = await client.query(
      `SELECT id FROM fare_schedules WHERE organization_id=$1 AND service_category='NOCTURNO'`,
      [organizationId],
    );
    if (scheduleExists.rows.length === 0) {
      await client.query(
        `INSERT INTO fare_schedules (organization_id, service_category, start_time, end_time, active)
         VALUES ($1, 'NOCTURNO', '22:00', '06:00', true)`,
        [organizationId],
      );
      console.log('horario nocturno creado (22:00-06:00)');
    } else {
      console.log('horario nocturno ya existia');
    }

    // --- Configuracion ---
    const configEntries: Array<[string, unknown]> = [
      ['gps.interval_seconds', 5],
      [
        'dispatch.weights',
        { proximity: 0.4, eta: 0.25, idle_time: 0.2, rating: 0.1, cancellations: 0.05 },
      ],
      ['dispatch.max_radius_meters', 5000],
      ['dispatch.max_eta_minutes', 15],
      ['dispatch.idle_saturation_minutes', 30],
      ['dispatch.offer_timeout_seconds', 20],
      ['commission.default_pct', 10.0],
    ];
    for (const [key, value] of configEntries) {
      await client.query(
        `INSERT INTO configuration (organization_id, key, value, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by`,
        [organizationId, key, JSON.stringify(value), adminId],
      );
    }
    console.log(`configuracion: ${configEntries.length} claves`);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

main()
  .then(() => {
    console.log('Seed de datos del piloto completado.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed fallo:', err);
    process.exit(1);
  });
