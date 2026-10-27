// Live xAI smoke — only runs when XAI_API_KEY is in the environment (or .env via the proxy). `npm run test:live`
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LLMDM } from './llmDM';
import { spiderSlot } from './testUtil';

const live = !!process.env.XAI_API_KEY;
const PORT = 5298;
let proc: ChildProcess | undefined;

describe.skipIf(!live)('live xAI DM', () => {
  beforeAll(async () => {
    proc = spawn(process.execPath, ['server/dmProxy.mjs'], { env: { ...process.env, DM_PROXY_PORT: String(PORT) }, stdio: 'pipe' });
    await new Promise((ok) => proc!.stdout!.once('data', ok));
  });
  afterAll(() => { proc?.kill(); });

  it('opening scene follows the spider premise', async () => {
    const dm = new LLMDM({ base: `http://127.0.0.1:${PORT}/api/dm` });
    const turn = await dm.openingScene(spiderSlot());
    const notice = dm.takeNotice();
    console.log('\n--- LIVE OPENING ---\n' + turn.narrative + '\n---');
    expect(notice).toBeNull();
    expect(turn.narrative.toLowerCase()).toMatch(/spider|arachnid|legs|silk|web/);
    expect(turn.narrative).not.toMatch(/Far to the north, people speak of a Demon Lord/); // stub line
  }, 90000);
});
