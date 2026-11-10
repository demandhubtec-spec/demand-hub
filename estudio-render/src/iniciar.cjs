// Entrada do estúdio: carrega o TypeScript pelo tsx, tanto nos imports normais (CommonJS) quanto nos
// imports dinâmicos (ESM). O código do ia-sdr é usado direto, sem compilar.
const { register } = require("tsx/esm/api");
register();
require("tsx/cjs");
require("./rodar.ts");
