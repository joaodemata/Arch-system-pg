import type { CanDevice, CanLevel, CanMessage } from './model';

const chapter = 'CANopen';

/** Mensajes típicos de un variador: estado que envía y consigna que recibe del PLC. */
const driveMessages = (bytes: number, periodMs: number): CanMessage[] => [
  { label: 'Estado y velocidad', pdo: 'tpdo1', bytes, periodMs },
  { label: 'Consigna', pdo: 'rpdo1', bytes, periodMs },
];

/** Módulo de entradas/salidas digitales. */
const ioMessages = (periodMs: number): CanMessage[] => [
  { label: 'Entradas', pdo: 'tpdo1', bytes: 2, periodMs },
  { label: 'Salidas', pdo: 'rpdo1', bytes: 2, periodMs },
];

const device = (key: string, type: CanDevice['type'], x: number, y: number, nodeId: number, messages: CanMessage[], extra: Partial<CanDevice> = {}): CanDevice => ({
  key,
  type,
  at: { x, y },
  nodeId,
  messages,
  ...extra,
});

export const canopenLevels: CanLevel[] = [
  {
    id: 'can-01',
    chapter,
    title: 'Tu primer bus',
    brief:
      'Un PLC tiene que mandar la consigna de velocidad a un variador y leer su estado cada 10 ms. Únelos con un cable CAN y cierra la línea con una resistencia de 120 Ω en cada extremo.',
    lesson:
      'CAN es un bus diferencial: todos los equipos cuelgan de dos hilos (CAN_H y CAN_L). Sin una resistencia de 120 Ω en cada extremo, la señal rebota al final del cable y corrompe las tramas. Es el fallo número uno en una puesta en marcha.',
    plant: { width: 20, height: 8, label: 'Armario y máquina' },
    plc: { key: 'plc', at: { x: 2, y: 4 } },
    defaultKbps: 500,
    maxBusLoad: 0.7,
    devices: [device('drive', 'drive', 16, 4, 2, driveMessages(4, 10))],
    palette: { term: 3 },
    reference: {
      blocks: { t1: 'term', t2: 'term' },
      links: [
        ['t1', 'plc'],
        ['plc', 'drive'],
        ['drive', 't2'],
      ],
    },
  },
  {
    id: 'can-02',
    chapter,
    title: 'La nave es más larga',
    brief:
      'Una línea de transporte de 150 m con dos módulos de E/S y un variador al final. El bus arranca a 500 kbit/s. Toca el PLC para cambiar la velocidad: más lenta llega más lejos, pero los mensajes ocupan más tiempo de bus.',
    lesson:
      'En CAN, todos los equipos tienen que ver el mismo bit a la vez para decidir quién gana el bus. Por eso la velocidad limita la longitud: 1 Mbit/s da para unos 25 m, 500 kbit/s para 100 m, 250 kbit/s para 250 m. Bajar la velocidad estira el bus, pero cada trama tarda más y sube la carga.',
    plant: { width: 150, height: 10, label: 'Línea de transporte' },
    plc: { key: 'plc', at: { x: 5, y: 5 } },
    defaultKbps: 500,
    maxBusLoad: 0.7,
    devices: [
      device('io1', 'io', 50, 5, 2, ioMessages(5)),
      device('io2', 'io', 95, 5, 3, ioMessages(5)),
      device('drive', 'drive', 140, 5, 4, driveMessages(8, 5)),
    ],
    palette: { term: 3 },
    reference: {
      blocks: { t1: 'term', t2: 'term' },
      links: [
        ['t1', 'plc'],
        ['plc', 'io1'],
        ['io1', 'io2'],
        ['io2', 'drive'],
        ['drive', 't2'],
      ],
      config: { plc: { kbps: 250 } },
    },
  },
  {
    id: 'can-03',
    chapter,
    title: 'El orden del cableado',
    brief:
      'Una célula con dos robots que necesitan su consigna cada 2 ms: hace falta ir a 500 kbit/s, así que el bus no puede pasar de 100 m. El cable va por bandeja (en horizontal y vertical). Elige en qué orden pasa por cada equipo.',
    lesson:
      'Un bus CAN es una cadena: el cable entra y sale de cada equipo. El orden de la cadena decide la longitud total, y con ella la velocidad máxima y el coste. El PLC no tiene por qué estar en un extremo: puede quedar en medio de la línea.',
    plant: { width: 40, height: 30, label: 'Célula robotizada' },
    plc: { key: 'plc', at: { x: 20, y: 15 } },
    defaultKbps: 500,
    maxBusLoad: 0.7,
    devices: [
      device('robot1', 'drive', 6, 3, 2, driveMessages(8, 2)),
      device('robot2', 'drive', 34, 3, 3, driveMessages(8, 2)),
      device('io1', 'io', 6, 27, 4, ioMessages(10)),
      device('io2', 'io', 34, 27, 5, ioMessages(10)),
      device('hmi', 'hmi', 20, 3, 6, [{ label: 'Pulsadores', pdo: 'tpdo1', bytes: 2, periodMs: 20 }]),
    ],
    palette: { term: 3 },
    reference: {
      blocks: { t1: 'term', t2: 'term' },
      links: [
        ['t1', 'io2'],
        ['io2', 'robot2'],
        ['robot2', 'hmi'],
        ['hmi', 'plc'],
        ['plc', 'io1'],
        ['io1', 'robot1'],
        ['robot1', 't2'],
      ],
    },
  },
  {
    id: 'can-04',
    chapter,
    title: 'AGV: quién habla primero',
    brief:
      'Un vehículo autónomo. El encoder de la rueda tiene que entregar la posición en menos de 0,6 ms o el lazo de control se vuelve inestable, y no admite más de 500 kbit/s. Toca cada equipo para cambiar su node-ID: en CAN, el identificador más bajo gana el bus.',
    lesson:
      'Cuando dos equipos transmiten a la vez, CAN no pierde ninguna trama: gana la de COB-ID más bajo y la otra espera. En CANopen el COB-ID es la base del PDO (0x180 para el TPDO1) más el node-ID, así que el node-ID es la prioridad. Los datos críticos para el control deben tener los IDs más bajos, no la batería.',
    plant: { width: 6, height: 4, label: 'Chasis del AGV' },
    plc: { key: 'plc', at: { x: 3, y: 2 } },
    defaultKbps: 500,
    maxBusLoad: 0.7,
    devices: [
      device('bms', 'bms', 1, 4, 1, [
        { label: 'Tensión y corriente', pdo: 'tpdo1', bytes: 8, periodMs: 5 },
        { label: 'Temperaturas', pdo: 'tpdo2', bytes: 8, periodMs: 10 },
      ]),
      device('scanner', 'scanner', 5, 4, 2, [{ label: 'Campo de protección', pdo: 'tpdo1', bytes: 2, periodMs: 10 }]),
      device('left', 'drive', 1, 0, 3, driveMessages(4, 2)),
      device('right', 'drive', 5, 0, 4, driveMessages(4, 2)),
      device('encoder', 'encoder', 3, 0, 12, [{ label: 'Posición', pdo: 'tpdo1', bytes: 4, periodMs: 2, deadlineMs: 0.6 }], { maxKbps: 500 }),
    ],
    palette: { term: 3 },
    reference: {
      blocks: { t1: 'term', t2: 'term' },
      links: [
        ['t1', 'bms'],
        ['bms', 'left'],
        ['left', 'encoder'],
        ['encoder', 'plc'],
        ['plc', 'right'],
        ['right', 'scanner'],
        ['scanner', 't2'],
      ],
      config: { encoder: { nodeId: 1 }, bms: { nodeId: 12 } },
    },
  },
  {
    id: 'can-05',
    chapter,
    title: 'Dos redes mejor que una',
    brief:
      'Una envasadora con cuatro variadores y cuatro módulos de E/S a ambos lados del armario. Todo en un mismo bus no cabe: o se satura, o es demasiado largo para ir más rápido. Puedes añadir una segunda interfaz CAN al PLC.',
    lesson:
      'Cuando un bus se queda sin ancho de banda, la solución habitual no es subir la velocidad (eso acorta el cable) sino dividir la red. Cada interfaz CAN es un bus independiente, con su propia carga, su propia velocidad y sus propios node-IDs.',
    plant: { width: 60, height: 20, label: 'Envasadora' },
    plc: { key: 'plc', at: { x: 30, y: 10 } },
    defaultKbps: 500,
    maxBusLoad: 0.7,
    devices: [
      device('d1', 'drive', 4, 4, 2, driveMessages(4, 2)),
      device('d2', 'drive', 16, 4, 3, driveMessages(4, 2)),
      device('io1', 'io', 4, 16, 4, ioMessages(5)),
      device('io2', 'io', 16, 16, 5, ioMessages(5)),
      device('d3', 'drive', 44, 4, 6, driveMessages(4, 2)),
      device('d4', 'drive', 56, 4, 7, driveMessages(4, 2)),
      device('io3', 'io', 44, 16, 8, ioMessages(5)),
      device('io4', 'io', 56, 16, 9, ioMessages(5)),
    ],
    palette: { term: 5, can2: 1 },
    reference: {
      blocks: { t1: 'term', t2: 'term', t3: 'term', t4: 'term', can2: 'can2' },
      links: [
        ['t1', 'plc'],
        ['plc', 'io2'],
        ['io2', 'd2'],
        ['d2', 'd1'],
        ['d1', 'io1'],
        ['io1', 't2'],
        ['t3', 'can2'],
        ['can2', 'io3'],
        ['io3', 'd3'],
        ['d3', 'd4'],
        ['d4', 'io4'],
        ['io4', 't4'],
      ],
    },
  },
];
