#!/usr/bin/env node
import { run } from '../runner.js';
import { init } from './init.js';
import { profile } from './profile.js';
const cmd = process.argv[2];
switch (cmd) {
    case 'run':
        run().catch(e => { console.error(e); process.exit(1); });
        break;
    case 'init':
        init().catch(e => { console.error(e); process.exit(1); });
        break;
    case 'profile':
        profile(process.argv.slice(3)).catch(e => { console.error(e); process.exit(1); });
        break;
    default:
        console.log(`claudelobby <command>

  init                              Interactive setup
  run                               Render and print the status bar lines

  profile                           List profiles (marks the active one)
  profile use <name>                Switch profile (holds until the next scheduled switch)
  profile add [name]                Create a profile (build its rows)
  profile edit <name>               Rebuild a profile's rows
  profile remove <name>             Delete a profile  (aliases: rm, delete)
  profile switch add <HH:MM> <name> Schedule an automatic switch
  profile switch remove <HH:MM>     Remove a scheduled switch  (aliases: rm, delete)
`);
}
