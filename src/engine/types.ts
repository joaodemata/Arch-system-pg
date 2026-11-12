/** Tipos de bloque que existen en el juego. */
export type BlockType =
  | 'users'
  | 'cdn'
  | 'lb'
  | 'server'
  | 'bigserver'
  | 'cache'
  | 'replica'
  | 'db'
  | 'queue'
  | 'worker';

/**
 * Cómo se comporta un bloque en la simulación. Varios tipos pueden compartir
 * comportamiento (un servidor XL se comporta como un servidor, con otras cifras).
 */
export type Behavior = 'source' | 'edge-cache' | 'balancer' | 'server' | 'cache' | 'store' | 'queue' | 'worker';

/**
 * Rol de una conexión saliente:
 * - `primary`: camino normal de la petición (línea continua).
 * - `fallback`: ruta de respaldo cuando el camino principal falla (discontinua naranja).
 * - `write`: escrituras, que siempre van a la base de datos principal (continua verde).
 * - `async`: trabajo que se deja en una cola para hacerlo después (punteada morada).
 */
export type PortRole = 'primary' | 'fallback' | 'write' | 'async';

/** Un puerto de salida de un bloque: a qué puede conectarse y cuántas veces. */
export interface PortSpec {
  role: PortRole;
  /** Tipos de destino aceptados, en orden de preferencia. */
  accepts: BlockType[];
  max: number;
}

/** Ficha técnica de un tipo de bloque. */
export interface BlockSpec {
  type: BlockType;
  behavior: Behavior;
  label: string;
  icon: string;
  /** Unidades de trabajo por segundo que aguanta antes de saturarse. */
  capacity: number;
  /** Unidad en la que se mide la capacidad, para la paleta ("peticiones/s", "trabajos/s"). */
  unit?: string;
  /** Latencia base en milisegundos, sin carga. */
  latencyMs: number;
  costPerMonth: number;
  /** Caché y CDN: fracción de consultas que encuentra en memoria. */
  hitRate?: number;
  /** Para concordar los mensajes en femenino ("saturada"). */
  feminine?: boolean;
  ports: PortSpec[];
  /** Mensaje cuando se intenta añadir una conexión que no cabe en ningún puerto. */
  fullMessage?: string;
}

export interface GraphNode {
  id: string;
  type: BlockType;
  /** Los bloques fijos los pone el nivel y no se pueden borrar. */
  fixed?: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
}

/** La arquitectura que construye el jugador. No sabe nada de posiciones en pantalla. */
export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Tráfico que llega al sistema y cómo es. */
export interface Traffic {
  rps: number;
  /** Fracción de peticiones de contenido estático (imágenes, CSS…) que una CDN puede servir. */
  staticShare?: number;
  /** Latencia de red entre los usuarios y tus servidores. Una CDN la evita para lo que tiene. */
  originDistanceMs?: number;
  /** Fracción de peticiones que escriben datos. Siempre van a la base de datos principal. */
  writeShare?: number;
  /** Peticiones que además disparan un trabajo pesado (enviar un email, procesar un vídeo…). */
  heavyWork?: {
    share: number;
    /** Cuántas veces más le cuesta al servidor una petición pesada si la hace él mismo. */
    factor: number;
    /** Qué es el trabajo, para los textos: "enviar el email de bienvenida". */
    label: string;
  };
}

export interface Level {
  id: string;
  chapter: string;
  title: string;
  brief: string;
  /** Texto que se muestra al superar el nivel. */
  lesson: string;
  traffic: Traffic;
  requirements: {
    /** Se aplica a peticiones y, si hay trabajos pesados, también a los trabajos. */
    minSuccessRate: number;
    maxAvgLatencyMs: number;
    /**
     * Tipos de bloque cuya caída hay que aguantar: se simula quitar cada bloque de ese
     * tipo, uno a uno. En esos escenarios solo se exige el porcentaje de éxito.
     */
    survive?: BlockType[];
  };
  /** Si es true, los servidores tienen que consultar datos para poder responder. */
  requiresData: boolean;
  /** Bloques que el nivel coloca de inicio. Su `key` es también su id en el grafo. */
  fixed: { key: string; type: BlockType }[];
  /** Cuántos bloques de cada tipo puede colocar el jugador. */
  palette: Partial<Record<BlockType, number>>;
  /**
   * Solución de referencia del diseñador del nivel. Su coste es el "par" (3 estrellas)
   * y los tests comprueban que cumple los requisitos.
   */
  reference: {
    blocks: Record<string, BlockType>;
    links: [from: string, to: string][];
  };
}
