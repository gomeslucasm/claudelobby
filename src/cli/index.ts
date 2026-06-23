#!/usr/bin/env node
import { run } from '../runner.js';
import { init } from './init.js';

const cmd = process.argv[2];

switch (cmd) {
  case 'run':
    run().catch(e => { console.error(e); process.exit(1); });
    break;

  case 'init':
    init().catch(e => { console.error(e); process.exit(1); });
    break;

  default:
    console.log(`claudebar <comando>

  init    Configuração interativa
  run     Roda e imprime as linhas do status bar
`);
}
