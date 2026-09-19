# Paso 8 — Especificación: habilitar el piloto cerrado

Este documento asume que el **paso 7 está completo y pasó su checklist
de aceptación** (`docs/02-especificacion-paso7.md`) con datos de prueba.
Aquí se trata de pasar de "funciona con datos inventados" a "un grupo
reducido de conductores y pasajeros reales lo usan en condiciones
controladas". No cubre presupuesto ni cronograma — solo lo técnico y
operativo.

---

## 1. Objetivo del paso

Abrir el sistema a un número pequeño de conductores y pasajeros reales
(no simulados), con supervisión activa, para validar en operación real
lo que hasta ahora solo se probó con `curl` y datos de prueba:
- ¿El motor de despacho asigna de forma razonable?
- ¿Los conductores confirman pagos correctamente?
- ¿Aparece algún caso borde que el paso 7 no contempló?

---

## 2. Brechas que deben cerrarse ANTES de aceptar el primer usuario real

Estas cosas no eran necesarias para probar el flujo con `curl`, pero
**sí son necesarias antes de que una persona real ponga su contraseña o
su dinero en el sistema**. Ninguna de ellas estaba en el alcance de los
pasos 5-7 — es deuda técnica que se vuelve obligatoria en este punto.

### 2.1 Rate limiting en login (fuerza bruta)

Sin esto, cualquiera puede intentar miles de contraseñas por minuto
contra `POST /auth/login`.

```bash
npm install --legacy-peer-deps @nestjs/throttler
```

En `app.module.ts`:
```typescript
ThrottlerModule.forRoot([{ ttl: 900000, limit: 5 }]), // 5 intentos / 15 min
```
Y en `app.module.ts` providers, agregar `{ provide: APP_GUARD, useClass: ThrottlerGuard }`
**después** de `JwtAuthGuard`/`PermissionsGuard` en el arreglo (el orden
de los `APP_GUARD` es el orden de ejecución).

**Criterio de aceptación:** 6 intentos de login fallidos seguidos desde
la misma IP → el sexto responde `429 Too Many Requests`, no `401`.

### 2.2 Secretos reales, no los de desarrollo

- `JWT_SECRET` de `.env.development` (`dev-only-secret-not-for-production`)
  **no debe usarse nunca fuera de este entorno**. Generar uno nuevo
  (mínimo 32 bytes aleatorios: `openssl rand -base64 32`) y cargarlo
  únicamente en el gestor de secretos del entorno donde corra el piloto
  — nunca en un archivo `.env` commiteado (ya está en `.gitignore`, pero
  vale la pena repetirlo como checklist).
- Password del usuario admin del seed (`Admin123!`) — cambiarla
  inmediatamente después del primer login en el ambiente del piloto, o
  mejor, generar el usuario admin real del piloto con una contraseña
  aleatoria distinta y desactivar/borrar el de `npm run seed`.

### 2.3 HTTPS obligatorio

El backend tal como está (`main.ts`) escucha HTTP plano. Antes de que
haya usuarios reales, debe haber una terminación TLS delante (reverse
proxy tipo Nginx/Caddy, o el balanceador del proveedor de hosting que se
elija) — las apps móviles no deben hablar HTTP plano con el backend en
ningún ambiente que no sea `development` local.

### 2.4 Manejo global de errores no capturados

Falta un `ExceptionFilter` global que evite que un error inesperado
devuelva el stack trace completo al cliente.

**Archivo:** `src/common/filters/all-exceptions.filter.ts`
```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Error interno';

    if (status === 500) {
      // Log completo (con stack) SOLO en el servidor, nunca en la respuesta
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json({
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    });
  }
}
```
Registrar en `main.ts`: `app.useGlobalFilters(new AllExceptionsFilter());`

### 2.5 Logging estructurado

`console.log`/el logger por defecto de Nest alcanza para desarrollo,
pero para operar un piloto real hace falta poder buscar/filtrar logs
(por `tripId`, por `driverId`, por nivel de severidad). Usar
`nest-winston` o `pino` con salida JSON — cualquiera de los dos sirve,
lo importante es que cada línea de log relevante incluya `tripId` o
`driverId` cuando aplique, para poder reconstruir qué pasó con un viaje
específico sin tener que leer todo el log.

### 2.6 Respaldos de la base de datos

Mecánica, no costo: definir una frecuencia de respaldo (ej. `pg_dump`
programado cada 6 horas, o WAL archiving continuo si el proveedor de
hosting lo soporta) y probar **al menos una vez, antes de tener usuarios
reales**, que un respaldo efectivamente se puede restaurar. Un respaldo
que nunca se probó restaurar no es un respaldo confiable.

### 2.7 Plan de rollback

Si un despliegue nuevo rompe algo con conductores ya operando en la
calle: ¿cómo se vuelve a la versión anterior en minutos, no horas?
Como mínimo: mantener la imagen/build anterior lista para redeploy
inmediato, y confirmar que las migraciones de esquema (si las hay en
ese momento) son reversibles o al menos no rompen la versión anterior
del código si hay que volver atrás.

---

## 3. Datos reales que hay que cargar antes de abrir

Todo lo del Ticket 7.0 (`docs/02-especificacion-paso7.md`) usó valores
de ejemplo. Antes del piloto cerrado, reemplazar con datos reales:

| Dato | Quién lo define | Dónde vive |
|---|---|---|
| Polígono(s) real(es) de zona de cobertura | Operación/negocio | `service_zones.area` |
| Tarifas reales por categoría y zona | Negocio | `fare_rules` (nuevas filas `PUBLISHED`, no editar las de prueba) |
| Horario nocturno real | Negocio | `fare_schedules` |
| % de comisión real | Negocio | `configuration` clave `commission.default_pct` |
| Pesos del score de despacho (iniciales) | Se puede dejar el default del Ticket 7.0 y recalibrar con datos reales del piloto, tal como ya se documentó en `docs/01-fundamentos-tecnicos.md` 2.1 | `configuration` clave `dispatch.weights` |
| Cuentas reales de conductores/pasajeros/operadores del piloto | Operación | tabla `users` + su perfil correspondiente |

**Nota importante:** todavía no existe un panel de administración con
interfaz — dar de alta usuarios reales requiere un script o inserciones
SQL directas (siguiendo exactamente el patrón del seed del paso 6:
`bcrypt.hash()` para la contraseña, nunca guardar contraseñas en texto
plano ni en un script que quede commiteado). Construir un panel admin
mínimo (aunque sea de solo alta de usuarios) es un candidato fuerte para
el primer trabajo *después* de abrir el piloto cerrado, no un
prerrequisito de este paso — pero es importante que quien opere el
piloto sepa que, por ahora, cada alta es manual.

---

## 4. Checklist funcional antes de aceptar el primer usuario real

Repetir la checklist de aceptación del paso 7
(`docs/02-especificacion-paso7.md`, sección final) **con los datos reales
del punto 3**, no con los de prueba. Además:

- [ ] Un viaje NORMAL completo, de principio a fin, con dos teléfonos
  físicos reales (no Postman/curl) — pasajero y conductor reales,
  moviéndose de verdad, para confirmar que el GPS real (no coordenadas
  fijas de prueba) alimenta bien `driver_location_history` y que el
  cálculo de distancia del Ticket 7.16 da un resultado razonable.
- [ ] Un viaje NOCTURNO (forzar la hora o usar `manual_override='FORCE_ON'`
  temporalmente) para confirmar que la tarifa nocturna real se aplica.
- [ ] Un viaje FORANEO completo, con un operador real cotizando y
  asignando manualmente (no simulado).
- [ ] Una cancelación desde cada estado permitido (ver la tabla de
  transiciones del paso 7) para confirmar que el conductor vuelve a
  `AVAILABLE` correctamente.
- [ ] Confirmar que `GET /users/me` con un conductor real devuelve
  exactamente los permisos esperados para su rol (ninguno extra).
- [ ] Provocar un login con contraseña incorrecta 6 veces seguidas y
  confirmar el `429` del punto 2.1.
- [ ] Apagar el backend a la mitad de un pago (`POST /trips/{id}/payment`)
  simulado en un ambiente de prueba, y confirmar que la transacción
  (punto 2.4 del ticket 7.17) no deja `payments`/`commissions` a medias.

---

## 5. Checklist de go / no-go

No abrir el piloto a usuarios reales hasta que **todas** estas casillas
estén marcadas:

- [ ] Sección 2 completa (rate limiting, secretos reales, HTTPS, filtro
  de excepciones, logging estructurado, respaldo probado, plan de rollback)
- [ ] Sección 3 completa (datos reales cargados, no los de prueba)
- [ ] Sección 4 completa (checklist funcional con datos y dispositivos reales)
- [ ] Al menos un operador humano capacitado en el uso de
  `GET /trips/{id}/dispatch/candidates` y `POST /dispatch/manual-assign`
  para intervenir manualmente si el despacho automático se traba
- [ ] Definido quién revisa `audit_logs` y con qué frecuencia durante la
  primera semana (ver sección 6)

---

## 6. Qué vigilar activamente la primera semana

No es necesario un dashboard de BI todavía (eso es explícitamente
Won't-have para esta etapa, según `docs/01-fundamentos-tecnicos.md`).
Alcanza con correr estas consultas manualmente, a diario, contra la base:

**Viajes que se quedaron atascados en despacho:**
```sql
SELECT id, requested_at, service_category
FROM trips
WHERE status = 'SEARCHING_DRIVER'
  AND requested_at < now() - interval '10 minutes';
```
Si aparece algo aquí, es candidato a intervención manual
(`POST /dispatch/manual-assign`) — ver procedimiento de incidente abajo.

**Discrepancias de monto de pago acumuladas** (las que el Ticket 7.17
dejó pasar con tolerancia, pero registró en auditoría):
```sql
SELECT * FROM audit_logs
WHERE action = 'payment.amount_mismatch'
ORDER BY created_at DESC;
```

**Conductores con deuda de comisión creciendo sin liquidar:**
```sql
SELECT driver_id, SUM(total_commission) AS deuda_acumulada
FROM driver_settlements
WHERE status != 'PAID'
GROUP BY driver_id
ORDER BY deuda_acumulada DESC;
```

**Cancelaciones concentradas en un conductor** (podría ser un problema
real del conductor, o un problema del score de despacho asignándole
viajes que no le convienen):
```sql
SELECT driver_id, count(*) AS cancelaciones
FROM trips
WHERE status = 'CANCELLED_BY_DRIVER' AND requested_at > now() - interval '7 days'
GROUP BY driver_id
ORDER BY cancelaciones DESC;
```

---

## 7. Procedimiento de incidente: un viaje atascado

Cuando la consulta de "viajes atascados" de la sección 6 encuentra un
caso:

1. **Diagnosticar primero, no intervenir a ciegas:**
   ```sql
   SELECT * FROM trip_assignment_offers WHERE trip_id = '<id>' ORDER BY offered_at;
   ```
   ¿Hubo candidatos y todos rechazaron/expiraron? ¿O nunca hubo
   candidatos elegibles (nadie disponible cerca)?

2. **Si hay conductores disponibles pero el algoritmo no los está
   tomando** (bug de score, radio muy chico, etc.): usar
   `GET /trips/{id}/dispatch/candidates` para ver el ranking real y
   decidir si conviene ajustar `dispatch.max_radius_meters` en
   `configuration` (efecto inmediato, sin redeploy) o intervenir
   manualmente con `POST /dispatch/manual-assign`.

3. **Si no hay ningún conductor disponible cerca:** es un problema de
   oferta, no del sistema — no hay nada que el software pueda resolver
   ahí; es información operativa para quien gestiona la flota.

4. **Nunca hacer `UPDATE trips SET status = ...` directo en la base**
   salvo emergencia real, y si se hace, **insertar manualmente la fila
   correspondiente en `trip_events` y en `audit_logs`** explicando la
   intervención (actor, motivo, hora) — el sistema completo depende de
   que esas dos tablas sean la verdad completa de lo que pasó con cada
   viaje; una intervención manual sin rastro rompe esa garantía para
   siempre en ese registro.

---

## 8. Después del piloto cerrado (sugerido, no comprometido a fecha)

Con datos reales del piloto ya disponibles, los candidatos más claros
para la siguiente iteración, en orden sugerido de valor:

1. Recalibrar `dispatch.weights` con datos reales (comparar decisiones
   del operador contra lo que el score automático hubiera sugerido —
   exactamente el ejercicio que ya se planteó en
   `docs/01-fundamentos-tecnicos.md` 2.1).
2. Notificaciones push reales (reemplazar el *polling* del paso 7).
3. Un panel de administración mínimo con interfaz (alta de usuarios,
   gestión de tarifas) para dejar de depender de scripts/SQL directo.
4. Reintento automático en segundo plano cuando el despacho no encuentra
   candidatos (en vez de requerir una llamada manual nueva).
5. Integración real con Google Distance Matrix, reemplazando
   `HaversineDistanceProvider`.
