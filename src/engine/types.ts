/** Tipos de bloque que existen en el juego. */
export type BlockType = 'users' | 'lb' | 'server' | 'cache' | 'db';

/**
 * Rol de una conexión saliente:
 * - `primary`: camino normal de la petición (línea continua).
 * - `fallback`: ruta de respaldo cuando el camino principal falla (línea discontinua).
 */
export type PortRole = 'primary' | 'fallback';

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
  label: string;
  icon: string;
  /** Peticiones por segundo que aguanta antes de saturarse. */
  capacity: number;
  /** Latencia base en milisegundos, sin carga. */
  latencyMs: number;
  costPerMonth: number;
  /** Solo para la caché: fracción de consultas que encuentra en memoria. */
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

export interface Level {
  id: string;
  title: string;
  brief: string;
  /** Texto que se muestra al superar el nivel. */
  lesson: string;
  trafficRps: number;
  requirements: {
    minSuccessRate: number;
    maxAvgLatencyMs: number;
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
