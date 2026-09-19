// Forma REAL confirmada en runtime para columnas `geography` con TypeORM
// 0.3.x + pg: al escribir, se asigna este objeto directamente a la
// propiedad (TypeORM lo envuelve en ST_GeomFromGeoJSON automaticamente).
// Al leer via repository.find()/findOne(), TypeORM ya devuelve esta
// misma forma (ST_AsGeoJSON + parseo automatico) — no hay que parsear
// nada manualmente en ninguno de los dos sentidos.
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat] — OJO: orden GeoJSON, no [lat, lng]
}

export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}
