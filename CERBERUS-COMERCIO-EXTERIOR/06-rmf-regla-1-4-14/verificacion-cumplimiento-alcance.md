# Alcance de la verificación de cumplimiento del cliente/proveedor (KYC)

> **Requisito del cliente (Gerardo):** la verificación del KYC NO se limita al art. 69-B.
> Debe cubrir el **conjunto completo** de supuestos que inhabilitan o invalidan las operaciones
> de clientes o proveedores que **deben estar al día en el pago de sus obligaciones tributarias.**
> **Principio rector:** cliente/proveedor debe encontrarse **al corriente** en sus obligaciones
> fiscales; el software **alerta** (nunca bloquea — decisión C9) cuando no lo está.

## Supuestos a verificar (CFF y conexos)

| Fuente | Qué detecta |
|--------|-------------|
| **Art. 69 CFF** | Contribuyentes con créditos fiscales firmes/exigibles, no localizados, sentencias, etc. (listado público del SAT) |
| **Art. 69-B CFF** | EFOS/EDOS — operaciones inexistentes (presunto / definitivo / desvirtuado / sentencia favorable) |
| **Art. 69-B Bis CFF** | Transmisión indebida de pérdidas fiscales |
| **Art. 49 Bis CFF** | Supuestos que inhabilitan operaciones *(corrección del cliente 1-jul-2026: es 49 Bis, no 29 Bis; citado también en la guía KYC original y modelado como ART_49BIS en cerberus-platform; verificar contra el texto vigente del CFF reformado 2026)* |
| **Art. 32-D CFF — Opinión de cumplimiento** | Estado de la **opinión de cumplimiento de obligaciones fiscales** (positiva / negativa / no disponible) |
| **Restricción/cancelación de CSD (17-H / 17-H Bis)** | Sello digital restringido o cancelado (impide facturar/operar) |
| **Padrones (importadores / sectores)** | Suspensión o baja del padrón |
| **Listas de sanciones** | OFAC / ONU / UE / UK / boletines, según aplique |

> **Regla operativa:** cualquiera de estos supuestos en estado adverso genera una **ALERTA**
> registrada en la bitácora, con snapshot fechado de la fuente. El responsable (agente/importador)
> decide vía override firmado (e.firma + motivo). El sistema **jamás bloquea** por sí mismo.

## Implicación para el modelo de datos (a implementar)
El modelo actual `Alerta69b` (enum de 6 estados) es insuficiente para este alcance. Se propone
una entidad más general **`VerificacionCumplimiento`** por cliente/proveedor con:
- `fuente` (enum: ART_69, ART_69B, ART_69B_BIS, ART_49BIS, OPINION_32D, CSD_17H, PADRON, SANCIONES)
- `resultado` / `estado` (p. ej. AL_CORRIENTE | ALERTA | INHABILITADO_PRESUNTO | INHABILITADO_DEFINITIVO | NO_DISPONIBLE)
- `snapshotSha256`, `consultadoEn`, `vigenciaHasta`
- relación con `Cliente` (y aplicable también a proveedores)
- override firmado cuando el responsable decide continuar pese a la alerta.

## Nota de verificación legal (pendiente)
- Confirmar la referencia exacta de **"art. 29 Bis"** contra el texto vigente del CFF (podría
  corresponder a otra disposición; el ecosistema fiscal cambia con reformas). Marcar *a confirmar
  por abogado humano colegiado*, igual que los demás puntos legales del proyecto.
- La **integración real** con las fuentes (listados del SAT/DOF, opinión de cumplimiento 32-D vía
  servicio del SAT) es trabajo posterior; el módulo actual deja la estructura y un stub.

## Estado
- [x] Requisito capturado (30-jun-2026).
- [ ] Ampliar la verificación del incremento 3 (hoy stub de 69-B) a este conjunto completo.
- [ ] Modelo `VerificacionCumplimiento` en el schema (siguiente iteración).
- [ ] Integración real con fuentes SAT/DOF + opinión de cumplimiento.

## Requisito adicional del cliente (2-jul-2026): ingesta manual + sanciones internacionales
1. **Ingesta manual de listados:** aunque una fuente no tenga URL pública estable (p. ej. 69-B Bis
   —que SÍ se publica—, 49 Bis), el sistema SIEMPRE debe permitir subir/ingestar el archivo
   manualmente (CSV), con el mismo tratamiento probatorio: sha256 del archivo + fecha + origen
   marcado como MANUAL.
2. **Listas de autoridades internacionales:** misma mecánica (sync o manual) para listados de
   sujetos sancionados con quienes no se pueden celebrar operaciones comerciales (OFAC/SDN, ONU,
   UE, UK, etc.). Nota técnica: estas listas identifican por NOMBRE (no RFC) → el cotejo por
   nombre es heurístico y debe producir ALERTA con revisión humana, nunca inhabilitación
   automática (C9 reforzado).
