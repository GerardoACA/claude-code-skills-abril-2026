# IMMEX / Conexión al ERP del cliente — "Listo para conectar"

> CERBERUS COMERCIO EXTERIOR — documento de arquitectura y negocio. **NO es SIDF.**
>
> Los archivos `_*.md` del scaffold son documentación de equipo/cliente y **no se
> copian al producto**.

Este documento explica **qué es IMMEX**, **por qué CERBERUS necesita conectarse
al ERP / sistema de control de inventarios del cliente**, y **cómo la
arquitectura ya está lista** para hacerlo con cualquier ERP, sin conexión real
todavía.

---

## 1. Qué es IMMEX y qué obligaciones de control impone

**IMMEX** (Industria Manufacturera, Maquiladora y de Servicios de Exportación)
es un régimen que permite a la empresa **importar temporalmente** insumos,
materias primas, componentes, maquinaria y equipo **sin pagar IVA ni IGI**, con
la condición de **retornar** (exportar) o **descargar** esas mercancías dentro
de los plazos legales.

Ese beneficio fiscal viene atado a obligaciones estrictas de control:

- **Anexo 24 — Control de inventarios automatizado.** Sistema que registra
  entradas, salidas, existencias y valor de las mercancías de importación
  temporal, con correspondencia contra los pedimentos. Es el "libro mayor" de
  inventario del régimen.
- **Anexo 30 — Controles de IVA/IEPS (certificación).** Para empresas con
  certificación IVA/IEPS, controles adicionales que sustentan el crédito fiscal
  del IVA de las importaciones temporales.
- **Anexo 31 — Control de saldos de mercancías de importación temporal.**
  Sistema que reporta a la autoridad los **saldos vivos por pedimento** (lo
  importado temporalmente, lo descargado y el saldo pendiente de retorno).

En conjunto, estos anexos permiten a la autoridad reconstruir, para cada
pedimento de importación temporal, cuánto entró, cuánto se retornó/descargó y
qué queda pendiente.

---

## 2. Por qué CERBERUS necesita conectarse al ERP del cliente

El **SAT / ANAM cruzan** los pedimentos de importación temporal contra los
saldos y descargos de los Anexos 24/31. Cuando aparece una **discrepancia** —
mercancía que se importó temporalmente pero **no se retornó ni se descargó a
tiempo** — la consecuencia es directa:

- Se genera un **crédito fiscal** (IVA/IGI que debió pagarse, más recargos y
  actualización).
- Es un **supuesto típico de fiscalización** y puede impactar la certificación
  IVA/IEPS y el propio programa IMMEX.

CERBERUS aporta valor **verificando la consistencia documental** de la operación
frente al control de inventarios real del cliente. Para ello, a futuro, leerá
del ERP / sistema de inventarios IMMEX del cliente los **saldos por pedimento**:

- cantidad importada temporalmente,
- cantidad ya descargada (retornos, transferencias, cambios de régimen),
- **saldo pendiente**,
- **fecha límite de retorno**.

Con esa información CERBERUS **alerta** de riesgos antes de que se conviertan en
crédito fiscal: saldos próximos a vencer, mercancía sin descargo, o fracciones
inconsistentes entre la evidencia de la operación y el inventario.

### Principio C9 — Alerta, no bloquea

CERBERUS **solo lee y coteja**; **nunca** modifica, corrige ni bloquea el ERP
del cliente. Su función es levantar **alertas** accionables para el responsable,
no ser un sistema de control de inventarios ni sustituir al ERP.

---

## 3. La arquitectura ya está lista: conector `ConectorErp` enchufable

La lectura del ERP está resuelta como un **conector enchufable** (patrón
Strategy), idéntico en estilo a los conectores de PAC (`timbrador-pac.ts`),
e.firma (`firmador-efirma.ts`) y almacén WORM (`almacen-worm.ts`):

- **Interfaz estable** — `ConectorErp` (`src/lib/conector-erp.ts`):
  ```ts
  interface ConectorErp {
    readonly id: string;
    obtenerSaldosImmex(consulta: ConsultaErp): Promise<ResultadoConsultaErp>;
  }
  ```
- **Tipo de dato normalizado** — `SaldoImmex` (fracción, descripción, pedimento
  de importación, cantidad importada, cantidad descargada, saldo pendiente,
  fecha límite de retorno). Todo adaptador de proveedor mapea los campos de su
  ERP a esta forma.
- **Implementación NoOp por defecto** — `ConectorErpNoOp` (id `"NOOP"`).
  **Hoy no hay integración real**: responde honestamente que el conector no está
  configurado y **nunca finge saldos**.
- **Factoría por entorno** — `obtenerConectorErp()` lee `ERP_PROVIDER` y hoy
  **siempre degrada a NoOp** (gancho presente, sin implementación real todavía).

El estado de todos los conectores del sistema es visible para ADMIN en
`/admin/conectores`.

---

## 4. Qué haría falta para conectar un ERP concreto

Conectar un ERP real **no toca rutas ni UI**: basta implementar la interfaz
`ConectorErp` para ese proveedor y enchufarla en la factoría. Se necesita:

1. **Adaptador por proveedor** — una clase `implements ConectorErp` (p. ej.
   `ConectorErpSap`, `ConectorErpOracle`, `ConectorErpGenericoRest`) que:
   - hable el protocolo del ERP (OData/RFC/BAPI en SAP, REST/SOAP en Oracle,
     REST genérico, export del sistema Anexo 31, etc.), y
   - **mapee** los campos del ERP al tipo `SaldoImmex`.
2. **Credenciales** del ERP del cliente (API key, usuario técnico, certificado o
   token), provistas por variables de entorno — **nunca** hardcodeadas.
3. **Endpoint / protocolo** de acceso (URL base, versión de API, formato).
4. **Mapeo de campos** documentado entre el modelo del ERP y `SaldoImmex`.
5. **Selección por entorno** — fijar `ERP_PROVIDER` (y las variables asociadas,
   p. ej. `ERP_BASE_URL`, `ERP_API_KEY`) para que la factoría devuelva el
   adaptador correspondiente en lugar del NoOp.

Ejemplo de cómo se enchufaría en la factoría (documentado en
`src/lib/conector-erp.ts`):

```ts
switch (process.env.ERP_PROVIDER) {
  case "SAP":    return new ConectorErpSap({ /* ... */ });
  case "ORACLE": return new ConectorErpOracle({ /* ... */ });
  case "REST":   return new ConectorErpGenericoRest({
    baseUrl: process.env.ERP_BASE_URL!,
    apiKey: process.env.ERP_API_KEY!,
  });
  default:       return conectorErpPorDefecto; // NoOp honesto
}
```

---

## 5. Cada cliente puede tener un ERP distinto — el diseño lo contempla

No hay un único ERP en el mundo IMMEX: los clientes usan **SAP**, **Oracle**,
**Softtek/TradeLink**, sistemas de **agentes aduanales**, **desarrollos propios**
o incluso **hojas de cálculo**. Por eso el conector es **agnóstico de
proveedor**:

- una **interfaz estable** para el resto del sistema, y
- **un adaptador por proveedor**, seleccionado por `ERP_PROVIDER`.

La clave del diseño es precisamente **estar listos para conectarnos a cualquier
ERP del cliente**. Hoy el sistema funciona con el NoOp honesto; el día que un
cliente aporte su ERP, se implementa su adaptador y se enchufa por variable de
entorno, sin cambiar nada más.
