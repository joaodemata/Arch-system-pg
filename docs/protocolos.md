# Más allá de HTTP: dominios y protocolos industriales

Propuesta de diseño para que el juego no se limite a arquitecturas web. Todavía no está implementado.

## 1. La idea: "dominios" intercambiables

Hoy el juego mezcla dos cosas:

| Parte | ¿Depende de HTTP? |
|---|---|
| Grafo, puertos con rol, reglas de conexión | No |
| Niveles, paleta, solución de referencia, par y estrellas | No |
| Escenarios de caída ("aguanta que caiga X") | No |
| Buscador de soluciones baratas (`scripts/solver.ts`) | Casi no (solo el cableado canónico) |
| Catálogo de bloques (servidor, caché, CDN…) | **Sí** |
| Simulación (flujos de peticiones, latencia, saturación) | **Sí** |
| Métricas del resultado (respondidas, latencia, trabajos) | **Sí** |

La propuesta es separar lo común en un **núcleo** y que cada mundo sea un **dominio** con su propio catálogo, simulación y niveles:

```
src/
  core/                 grafo, puertos, niveles, puntuación, escenarios de caída
  domains/
    web/                lo que hay hoy: catálogo, simulate.ts, niveles 1–20
    fieldbus/           PROFINET, PROFIBUS, CANopen…
  ui/                   tablero y paneles, sin saber de qué dominio se trata
```

Cada dominio implementa una interfaz pequeña:

```ts
interface Domain<L extends BaseLevel> {
  id: 'web' | 'fieldbus';
  blocks: Record<string, BlockSpec>;
  simulate(level: L, graph: Graph): DomainResult;
}

/** El resultado se describe con métricas genéricas para que la UI no dependa del dominio. */
interface DomainResult {
  meetsRequirements: boolean;
  metrics: { label: string; value: string; ok: boolean }[];   // "Tiempo de ciclo: 3,2 ms ≤ 4 ms"
  nodes: Record<string, { utilization: number; lost: number }>;
  edges: Record<string, { flow: number }>;
  problems: { message: string; severity: number }[];
}
```

Así la UI (tablero, partículas, modal de resultado) sirve para cualquier dominio, y añadir uno nuevo no toca a los demás.

Hacen falta dos ampliaciones del núcleo:

- **Propiedades en las conexiones**, como la longitud del cable en metros o el tipo de cable. Hoy una conexión es solo `from → to`.
- **Configuración en los bloques**, como la velocidad del bus de un maestro PROFIBUS o el tiempo de actualización de un dispositivo PROFINET. Hoy un bloque es solo un tipo.

## 2. Qué cambia en un bus de campo

En la web, lo que fluye son **peticiones por segundo** y se mide la **latencia media**. En automatización la física es otra:

| Web | Bus de campo |
|---|---|
| Peticiones/s | Intercambio **cíclico** de datos de proceso cada X ms |
| Latencia media | **Tiempo de ciclo** y **jitter**: lo que importa es el peor caso, no la media |
| Capacidad del servidor | **Carga del bus** (%), nodos por segmento, ancho de banda |
| Distancia de red (ms) | **Longitud de cable** frente a velocidad de transmisión |
| Caída de un servidor | Corte de cable, caída de un switch, de un repetidor o de un dispositivo |
| Respaldo (fallback) | Anillo redundante (MRP), maestro redundante |

Por eso cada protocolo necesita su propio modelo de simulación. Las reglas de abajo son las típicas de cada estándar, simplificadas para el juego. Las cifras exactas habría que contrastarlas con las normas y las guías de instalación antes de publicar los niveles.

## 3. Protocolos y mecánicas de puzzle

### PROFINET (Ethernet industrial)

- **Bloques:** PLC (controlador IO), dispositivos IO (periferia remota, variadores, servos), switches gestionados, HMI y gateways.
- **Topologías:** estrella con switches, línea (cada dispositivo con switch integrado de 2 puertos) y anillo.
- **Mecánicas:**
  - Cada dispositivo pide un tiempo de actualización (p. ej. un servo 1 ms y una isla de válvulas 8 ms). Un PLC tiene un presupuesto de comunicación.
  - **Línea larga = más retardo:** cada salto suma tiempo de paso por el switch. Una línea de 30 dispositivos puede no cumplir el ciclo de un servo al final.
  - **Anillo MRP:** cerrar la línea en anillo permite aguantar un corte de cable, con un tiempo de reconfiguración. Encaja directamente con los escenarios de caída que ya existen, solo que la caída es de una conexión en lugar de un bloque.
  - Mezclar tráfico IT (cámaras, HMI) y tiempo real en el mismo switch y ver cómo afecta.
- **Primer nivel posible:** "La célula de soldadura": un PLC, 8 robots y 2 islas de válvulas. Elige entre estrella o línea, cumpliendo el tiempo de ciclo con el menor número de switches.

### PROFIBUS DP (RS-485, maestro-esclavo)

- **Bloques:** maestro (PLC), esclavos, repetidores, terminadores, acopladores DP/PA y gateways a PROFINET.
- **Mecánicas:**
  - **Velocidad frente a longitud:** a más baudios, menos metros por segmento (a 12 Mbit/s el segmento es de unos 100 m; a 187,5 kbit/s, de unos 1000 m). El nivel da las distancias reales de la planta y el jugador elige la velocidad y dónde poner repetidores.
  - **Límite de estaciones por segmento** (32 sin repetidor) y de direcciones en la red.
  - **Terminación:** el bus tiene que estar terminado en los dos extremos y solo ahí. Un terminador mal puesto da fallos intermitentes, una mecánica muy realista para quien ha hecho puesta en marcha.
  - **Tiempo de ciclo** aproximado como la suma de los telegramas de cada esclavo: más esclavos o más datos por esclavo implican un ciclo más lento.
- **Nivel típico:** "Ampliación de línea": añadir 10 estaciones a un bus que ya está al límite. Hay que elegir entre subir la velocidad, segmentar con repetidores o migrar parte a PROFINET con un gateway.

### CANopen (bus CAN)

- **Bloques:** maestro NMT, nodos (variadores, encoders, IO), terminadores de 120 Ω y gateways CAN ↔ Ethernet.
- **Mecánicas:**
  - **Velocidad frente a longitud,** igual que PROFIBUS pero con las cifras de CAN (1 Mbit/s solo da para unas decenas de metros).
  - **Carga del bus:** cada PDO ocupa tiempo de bus según su tamaño (hasta 8 bytes) y su frecuencia. Superar aproximadamente el 70 % hace que lleguen tarde los mensajes de menor prioridad.
  - **Prioridad por identificador:** en CAN, el identificador más bajo gana el arbitraje. El jugador asigna los COB-ID para que los mensajes críticos (posición del encoder) nunca esperen detrás de los de diagnóstico. Es un puzzle muy propio de CAN que no existe en la web.
  - **Heartbeat** para detectar nodos caídos, como variante de los escenarios de caída.
- **Nivel típico:** "AGV": un vehículo con dos variadores, un encoder, un escáner de seguridad y una batería. Hay que cumplir el ciclo de control del motor sin pasar del 70 % de carga.

### Otros candidatos

- **EtherCAT:** procesamiento "al vuelo", con ciclos de microsegundos. Es interesante para niveles avanzados de control de movimiento.
- **Modbus TCP/RTU:** sondeo maestro-esclavo muy simple, ideal como capítulo de introducción.
- **IO-Link:** el último metro, de sensor a maestro IO-Link y de ahí al bus de campo.
- **Seguridad (PROFIsafe, FSoE):** canal seguro sobre el mismo bus, con tiempos de respuesta de seguridad. Encaja con un capítulo final.

## 4. Diferencias de la interfaz

- **Plano de planta:** en lugar de columnas automáticas, el nivel fija dónde está cada máquina (en metros). La longitud del cable sale de la distancia entre bloques, y arrastrar un bloque la cambia.
- **Configuración en el bloque:** al tocar un maestro aparece un selector de velocidad o de tiempo de ciclo.
- **Tipos de línea por medio físico:** Ethernet (continua), RS-485 (doble) y CAN (con terminadores visibles en los extremos).
- **Partículas:** en lugar de peticiones sueltas, se muestran telegramas que recorren el bus en cada ciclo, uno detrás de otro.

## 5. Plan propuesto

1. **Refactor del núcleo** (sin cambiar el juego): mover `engine/` a `core/` + `domains/web/`, con propiedades en conexiones, configuración en bloques y métricas genéricas en el resultado. Los 78 tests actuales tienen que seguir pasando.
2. **Dominio PROFINET** primero, porque es el que más reutiliza: topología, switches como balanceadores y anillo como respaldo. Un capítulo de 5 o 6 niveles.
3. **PROFIBUS y CANopen** después, con la física del bus (velocidad frente a longitud, terminación y carga).
4. **Selector de campaña** en la pantalla inicial: "Sistemas web" o "Automatización industrial".
