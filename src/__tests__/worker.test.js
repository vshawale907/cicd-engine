const fs = require('fs');

// Mock dependencies
jest.mock('../db');
jest.mock('../queue');
jest.mock('../pubsub');
jest.mock('../docker-runner');
jest.mock('../notifications');
jest.mock('simple-git', () => {
  return () => ({ clone: jest.fn().mockResolvedValue(true) });
});
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    mkdirSync: jest.fn(),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    rmSync: jest.fn(), // we will track this
  };
});

const db = require('../db');
const { runStep } = require('../docker-runner');
const { publishLog } = require('../pubsub');
const queue = require('../queue');

// To hook into queue.process:
let processCallback = null;
queue.process.mockImplementation((concurrency, cb) => {
  processCallback = cb;
});

// require worker so the mock registers
require('../worker');

describe('step execution', () => {
  const defaultJobData = {
    runId: 10,
    pipelineId: 1,
    repoUrl: 'git@dummy',
    branch: 'main',
    commitSha: '1234567'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('marks run as success when all steps exit with code 0', async () => {
    // fs mocks for finding config
    fs.existsSync.mockImplementation(path => path.endsWith('.pipeline.json'));
    // pipeline with 2 steps
    fs.readFileSync.mockReturnValue(JSON.stringify({
      steps: [{ name: 'step1', command: 'cmd1' }, { name: 'step2', command: 'cmd2' }]
    }));

    // db query mock - return arbitrary step id
    db.query.mockResolvedValue({ rows: [{ id: 100 }] });
    
    // docker runner mock
    runStep.mockImplementation(async (dir, cmd, logCb) => {
      logCb('dummy log');
      return { exitCode: 0 };
    });

    const result = await processCallback({ data: defaultJobData });
    expect(result).toEqual({ status: 'success' });

    // Validate overall run marked running then success
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE runs SET status = $1'),
      ['success', 10]
    );
  });

  test('marks run as failed when a step exits with non-zero code', async () => {
    fs.existsSync.mockImplementation(path => path.endsWith('.pipeline.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({
      steps: [{ name: 'step1', command: 'cmd1' }]
    }));

    db.query.mockResolvedValue({ rows: [{ id: 100 }] });
    // exit with 1
    runStep.mockResolvedValue({ exitCode: 1 });

    const result = await processCallback({ data: defaultJobData });
    expect(result).toEqual({ status: 'failed' });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE runs SET status = $1'),
      ['failed', 10]
    );
  });

  test('stops processing after first failed step (does not run remaining steps)', async () => {
    fs.existsSync.mockImplementation(path => path.endsWith('.pipeline.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({
      steps: [{ name: 'step1', command: 'cmd1' }, { name: 'step2', command: 'cmd2' }]
    }));

    db.query.mockResolvedValue({ rows: [{ id: 100 }] });
    // First call fails, second shouldn't happen but we set it up just in case
    runStep.mockResolvedValueOnce({ exitCode: 1 }).mockResolvedValueOnce({ exitCode: 0 });

    await processCallback({ data: defaultJobData });

    // Should only be called once, for step1
    expect(runStep).toHaveBeenCalledTimes(1);
    expect(runStep.mock.calls[0][1]).toBe('cmd1');
  });

  test('calls publishLog for each step', async () => {
    fs.existsSync.mockImplementation(path => path.endsWith('.pipeline.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({
      steps: [{ name: 'step1', command: 'cmd1' }]
    }));
    db.query.mockResolvedValue({ rows: [{ id: 100 }] });
    runStep.mockResolvedValue({ exitCode: 0 });

    await processCallback({ data: defaultJobData });

    // Check that we logged that the step started
    expect(publishLog).toHaveBeenCalledWith(10, expect.stringContaining('Step: step1'));
    // Check that run complete was logged
    expect(publishLog).toHaveBeenCalledWith(10, expect.stringContaining('PASSED'));
    expect(publishLog).toHaveBeenCalledWith(10, '__PIPELINE_DONE__');
  });

  test('always cleans up temp directory — even if a step throws', async () => {
    // 1. Success case
    fs.existsSync.mockImplementation(path => path.endsWith('.pipeline.json'));
    fs.readFileSync.mockReturnValue(JSON.stringify({ steps: [] }));
    db.query.mockResolvedValue({ rows: [{ id: 100 }] });

    await processCallback({ data: defaultJobData });
    expect(fs.rmSync).toHaveBeenCalledTimes(1);
    
    fs.rmSync.mockClear();

    // 2. Errored case (e.g. invalid json)
    fs.readFileSync.mockReturnValue('{ invalid json }');
    try {
      await processCallback({ data: defaultJobData });
    } catch (e) {
      // should throw syntax error
    }
    expect(fs.rmSync).toHaveBeenCalledTimes(1);
  });
});
