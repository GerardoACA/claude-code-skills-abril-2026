# Dictamen IMMEX — Anexos 24/30/31 RGCE (módulo de cotejo CERBERUS)

⚠️ **GENERADO POR AGENTE ESPECIALISTA DE IA con base en la base de conocimiento
interna** (reporte de fiscalización 2025-2026 y dictamen de arquitectura v2).
**Pendiente de validación por abogado colegiado.** Los puntos marcados
"A CONFIRMAR" no se codificaron como regla dura en el software.

## Decisión de arranque (ratificada, decisión de cliente A4 — diseño v2)

CERBERUS **NO genera el SACI oficial** del Anexo 24: la empresa IMMEX está
legalmente obligada a llevar ELLA su control de inventarios automatizado y a
dar al SAT acceso directo (usuario/contraseña). CERBERUS construye un
**LIBRO DE COTEJO/RECONCILIACIÓN**: reconstruye entradas (pedimentos de
importación temporal) y descargos (retornos/cambios de régimen) capturados en
el sistema, deriva saldos y plazos, y **ALERTA** discrepancias (principio C9:
alerta, nunca bloquea). Sirve sin ERP conectado y como auditoría cruzada
cuando lo haya.

## Matriz normativa → implementación (Incremento 61)

| # | Requisito (según base de conocimiento) | Qué hace el software |
|---|---|---|
| R1 | Anexo 24: control de inventarios — entradas, salidas, existencias, valor, correspondencia a pedimentos | Libro de movimientos ENTRADA/DESCARGO/AJUSTE por material (fracción/NICO/unidad), con valor y pedimento; saldos derivables; cada fila sellada SHA-256 |
| R2 | Regla de las 48 horas: el SACI se actualiza ≤48h tras concluir el despacho | Se capturan `despachoConcluidoEn` y `registradoEn`; el vigía alerta si excede 48h (últimos 30 días) |
| R3 | Acceso remoto en tiempo real del SAT al SACI | **NO-CERBERUS**: obligación del sistema del cliente. CERBERUS solo coteja vía conector ERP |
| R4 | Descargo contra pedimentos (balanza) | Motor **PEPS**: cada descargo consume las entradas más antiguas; consumos trazados por `entradaOrigenId`; faltantes se registran y alertan (no se rechazan) |
| R5 | Anexo 31: saldos no retornados con crédito fiscal IVA/IEPS | Saldo pendiente por entrada/material; el vigía alerta SALDO_NO_RETORNADO (severidad ALTA si el cliente está certificado: riesgo de crédito exigible) |
| R6 | Plazos de retorno de la mercancía temporal | `fechaLimiteRetorno` por entrada (dato capturado) + semáforo vencido/≤30d/vigente + alerta del vigía por cliente |
| R7 | Anexo 30: reporte mensual de descargos (certificadas) | MVP: los movimientos DESCARGO del periodo son exportables; formato oficial pendiente (ver A CONFIRMAR) |
| R8 | Certificación IVA/IEPS (niveles A/AA/AAA) | Bandera y nivel por inventario; condiciona la severidad de las alertas. Cálculo del crédito fiscal: fase posterior |
| R9 | C9 — alerta, no bloqueo | Todas las salidas son alertas enrutadas a los destinatarios del cliente (categoría "IMMEX") |
| R10 | Trazabilidad / responsabilidad solidaria del agente | sha256 por movimiento + eventos encadenados en bitácora (IMMEX_MOVIMIENTO, VIGIA_IMMEX) |
| R11 | Pedimentos IN (entrada) / RT (descargo) | Los movimientos referencian el modelo Pedimento existente (número/clave/aduana) o su copia legible |

## A CONFIRMAR POR ABOGADO (no codificado como regla dura)

1. **Plazo legal de retorno** (¿18 meses del régimen general? ¿otros por tipo?):
   hoy `fechaLimiteRetorno` es dato capturado, no calculado.
2. **Claves exactas del Anexo 22** que constituyen entrada temporal (tipo IN) y
   descargo (tipo RT / cambio de régimen) para IMMEX.
3. **Formato/layout oficial de los reportes Anexo 30 y Anexo 31.**
4. **Hito exacto desde el que corren las 48 horas** ("concluir el despacho").
5. **Montos de sanciones** por incumplimiento (cotejar Anexo 5 RMF/DOF).

## Diferido (fuera del MVP)

- Conector ERP real por proveedor (SAP/Oracle/REST) — el gancho existe (NoOp).
- Transmisión/acceso SACI al SAT (obligación del cliente).
- Cálculo del crédito fiscal IVA/IEPS por saldo no retornado.
- BOM / factores de consumo / mermas (explosión de materiales).
