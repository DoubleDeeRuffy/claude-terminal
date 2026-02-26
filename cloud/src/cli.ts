#!/usr/bin/env node

import { store } from './store/store';
import { generateApiKey, hashApiKey } from './auth/auth';
import { config } from './config';
import readline from 'readline';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];
const param = args[2];

function printUsage(): void {
  console.log(`
  Claude Terminal Cloud - CLI Admin

  Usage:
    ct-cloud user add <name>          Create user and generate API key
    ct-cloud user list                List all users with stats
    ct-cloud user remove <name>       Delete user and all their data
    ct-cloud user reset-key <name>    Regenerate API key for user

    ct-cloud status                   Server status
    ct-cloud start                    Start server (foreground)
    ct-cloud admin                    Interactive TUI dashboard

  `);
}

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(`${message} (y/N) `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function userAdd(name: string): Promise<void> {
  if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error('Error: name must be alphanumeric (a-z, 0-9, _, -)');
    process.exit(1);
  }

  if (await store.userExists(name)) {
    console.error(`Error: user "${name}" already exists`);
    process.exit(1);
  }

  await store.ensureDataDirs();
  const apiKey = generateApiKey();
  await store.createUser(name, apiKey);

  console.log(`\n  User "${name}" created`);
  console.log(`  API Key: ${apiKey}`);
  console.log(`  Paste this key in Claude Terminal > Settings > Cloud\n`);
}

async function userList(): Promise<void> {
  const users = await store.listUsers();
  if (users.length === 0) {
    console.log('\n  No users yet. Create one with: ct-cloud user add <name>\n');
    return;
  }

  console.log('');
  console.log('  NAME'.padEnd(18) + 'PROJECTS'.padEnd(12) + 'SESSIONS'.padEnd(14) + 'API KEY');
  console.log('  ' + '-'.repeat(56));

  for (const name of users) {
    const user = await store.getUser(name);
    if (!user) continue;
    const projectDirs = await store.listProjectDirs(name);
    const activeSessions = user.sessions.filter(s => s.status === 'running').length;
    const sessionStr = activeSessions > 0 ? `${activeSessions} active` : '0';
    const keyPreview = hashApiKey(user.apiKey);

    console.log(
      `  ${user.name.padEnd(16)}${String(projectDirs.length).padEnd(12)}${sessionStr.padEnd(14)}${keyPreview}...`
    );
  }
  console.log('');
}

async function userRemove(name: string): Promise<void> {
  if (!name) {
    console.error('Error: provide a user name');
    process.exit(1);
  }

  if (!(await store.userExists(name))) {
    console.error(`Error: user "${name}" does not exist`);
    process.exit(1);
  }

  const ok = await confirm(`  This will delete user "${name}" and all their projects. Continue?`);
  if (!ok) {
    console.log('  Cancelled.');
    return;
  }

  await store.deleteUser(name);
  console.log(`\n  User "${name}" removed\n`);
}

async function userResetKey(name: string): Promise<void> {
  if (!name) {
    console.error('Error: provide a user name');
    process.exit(1);
  }

  const user = await store.getUser(name);
  if (!user) {
    console.error(`Error: user "${name}" does not exist`);
    process.exit(1);
  }

  const newKey = generateApiKey();
  user.apiKey = newKey;
  await store.saveUser(name, user);

  console.log(`\n  API key for "${name}" regenerated`);
  console.log(`  New API Key: ${newKey}\n`);
}

async function status(): Promise<void> {
  const serverData = await store.getServerData();
  const users = await store.listUsers();

  console.log(`\n  Claude Terminal Cloud`);
  console.log(`  Port:     ${config.port}`);
  console.log(`  URL:      ${config.publicUrl}`);
  console.log(`  Cloud:    ${config.cloudEnabled ? 'enabled' : 'relay-only'}`);
  console.log(`  Users:    ${users.length}`);
  console.log(`  Since:    ${new Date(serverData.createdAt).toLocaleDateString()}`);
  console.log('');
}

async function startServer(): Promise<void> {
  // Dynamic import to avoid loading express/ws for CLI commands
  const { startServer: run } = await import('./index');
  await run();
}

async function main(): Promise<void> {
  try {
    if (command === 'user') {
      switch (subcommand) {
        case 'add': return await userAdd(param);
        case 'list': return await userList();
        case 'remove': return await userRemove(param);
        case 'reset-key': return await userResetKey(param);
        default:
          printUsage();
          process.exit(1);
      }
    } else if (command === 'status') {
      return await status();
    } else if (command === 'start') {
      return await startServer();
    } else if (command === 'admin') {
      const { AdminTUI } = await import('./admin/AdminTUI');
      const tui = new AdminTUI();
      await tui.start();
      return;
    } else {
      printUsage();
      if (command) process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
