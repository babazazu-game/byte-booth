// Только для локальной отладки (?debug=1): строители моделей для витрины.
export { buildGPU } from './models/gpu.ts';
export { buildBoard, buildCooler, buildRAM, buildPSU, buildSSD, buildCPU } from './models/board.ts';
export { PcRig } from './models/pc.ts';
export { GPUS, MBS, COOLERS, RAMS, CASES, PSUS } from '../logic/parts.ts';
