interface CommandResult {
  output: string;
  exitCode: number;
  timedOut: boolean;
}

export interface ResourceSnapshot {
  at: string;
  memoryFreePercent: number | null;
  diskAvailableGiB: number | null;
  taskProcesses: Array<{ pid: number; rssMiB: number; command: string }>;
  activeE2EProcesses: number;
}

async function command(args: string[], timeoutMs = 5_000): Promise<CommandResult> {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timeout);
  return { output: `${stdout}${stderr}`.trim(), exitCode, timedOut };
}

export async function resourceSnapshot(): Promise<ResourceSnapshot> {
  const [memory, disk, processes] = await Promise.all([
    command(["memory_pressure", "-Q"]),
    command(["df", "-k", "/"]),
    command(["ps", "-axo", "pid=,rss=,command="]),
  ]);
  const memoryFreePercent = Number(memory.output.match(/free percentage:\s*(\d+(?:\.\d+)?)/i)?.[1]);
  const diskLine = disk.output.split("\n").filter(Boolean).at(-1)?.trim().split(/\s+/);
  const diskAvailableGiB = diskLine?.[3] ? Number(diskLine[3]) / 1024 / 1024 : Number.NaN;
  const taskProcesses = processes.output.split("\n").flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    if (!match || !/Programming\/railly\/sourced|agent-browser|e2e-(?:browser|corpus|edges|soak)/.test(match[3]!)) return [];
    return [{ pid: Number(match[1]), rssMiB: Math.round((Number(match[2]) / 1024) * 10) / 10, command: match[3]!.slice(0, 240) }];
  });
  return {
    at: new Date().toISOString(),
    memoryFreePercent: Number.isFinite(memoryFreePercent) ? memoryFreePercent : null,
    diskAvailableGiB: Number.isFinite(diskAvailableGiB) ? Math.round(diskAvailableGiB * 10) / 10 : null,
    taskProcesses,
    activeE2EProcesses: taskProcesses.filter((item) => /e2e-(?:browser|corpus|edges|soak)/.test(item.command)).length,
  };
}

export function resourceLimitsSatisfied(snapshot: ResourceSnapshot): boolean {
  return (snapshot.memoryFreePercent === null || snapshot.memoryFreePercent >= 15)
    && (snapshot.diskAvailableGiB === null || snapshot.diskAvailableGiB >= 5);
}

if (import.meta.main) {
  const snapshot = await resourceSnapshot();
  const healthy = resourceLimitsSatisfied(snapshot);
  console.log(JSON.stringify({ healthy, ...snapshot }, null, 2));
  if (!healthy) process.exitCode = 1;
}
