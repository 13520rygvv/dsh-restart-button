/**
 * Host half of the Restart button bundle.
 *
 * The Web UI cannot start processes, so it asks this package over an exact
 * Connection Fetch route. The Host only *arms* a detached relauncher and
 * answers immediately: that helper stops the Electron shell, lets this Host
 * shut down through its own IPC disconnect path, then starts the application
 * again. The calling page therefore never observes a process that kills
 * itself with a pending response.
 *
 * A restart that would interrupt work asks first: the handler refuses the
 * first request while a turn is actually running, a queued turn is waiting,
 * a background job is live, or a loaded session holds an armed reminder. It
 * reports what it saw, and records that report in `blocked.json` so a wrong
 * prompt can be diagnosed afterwards.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Exact Fetch route the Client half posts to; the carrier authenticates it. */
const ROUTE = '/api/dsh-restart'

/** This package's directory, which also holds the relaunch script. */
const packageDir = dirname(fileURLToPath(import.meta.url))

/** Hard dependency: the authenticated Fetch-route registry and its carrier. */
export const inject = ['connection']

/**
 * Absolute Windows PowerShell when one is installed, otherwise the in-box one.
 * @returns executable accepted by `spawn`.
 */
function powershellExecutable() {
  const candidates = [
    process.env.DSH_POWERSHELL,
    join(process.env.ProgramFiles ?? 'C:\\Program Files', 'PowerShell', '7', 'pwsh.exe'),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate !== '' && existsSync(candidate)) return candidate
  }
  return 'powershell.exe'
}

/**
 * Describe whether this process can restart the application it runs under.
 * Only the Desktop shell hosts a `dsh` process with an IPC parent, and only it
 * can be replaced by relaunching the executable this process runs with.
 * @returns supported flag, or a stable unsupported reason for the UI.
 */
function restartTarget() {
  if (process.platform !== 'win32') return { supported: false, reason: 'not-windows' }
  if (process.versions.electron === undefined || typeof process.send !== 'function' || !(process.ppid > 0)) {
    return { supported: false, reason: 'not-desktop' }
  }
  if (!existsSync(process.execPath)) return { supported: false, reason: 'missing-executable' }
  return {
    supported: true,
    executable: process.execPath,
    mainPid: process.ppid,
    hostPid: process.pid,
  }
}

/**
 * Count queued inbox items without trusting the shape of an optional queue.
 * @param queue - inbox queue, possibly absent.
 * @returns item count.
 */
function queued(queue) {
  return Array.isArray(queue) ? queue.length : 0
}

/**
 * Report what a restart would interrupt.
 *
 * Only real work counts: a running turn, a queued turn that would run next,
 * and a live background job. An idle session's `next-step` inbox is NOT work:
 * DSH splices notices there (for example the approval-policy notice) and a
 * session with no turn never drains it, so counting it would warn forever.
 * @param ctx - Host context carrying the agent, job, and waterfall services.
 * @returns whether interruptible work exists, plus a diagnostic detail record.
 */
async function workState(ctx) {
  const agents = ctx.get('agents')
  const jobs = ctx.get('jobs')
  const live = agents === undefined ? [] : agents.list()
  const detail = { agents: [], jobs: [], reminders: [] }
  let activeTasks = false

  for (const agent of live) {
    const running = agent.status === 'running'
    const waiting = queued(agent.inbox?.nextTurn) > 0
    if (running || waiting) activeTasks = true
    if (running || waiting || queued(agent.inbox?.nextStep) > 0) {
      detail.agents.push({
        id: String(agent.id),
        status: agent.status,
        nextTurn: queued(agent.inbox?.nextTurn),
        nextStep: queued(agent.inbox?.nextStep),
      })
    }
  }

  if (jobs !== undefined) {
    for (const caller of [undefined, ...live.map((agent) => String(agent.id))]) {
      let list = []
      try {
        list = jobs.list(caller)
      } catch {
        continue
      }
      for (const job of list) {
        if (job.status !== 'running' && job.status !== 'stopping') continue
        activeTasks = true
        detail.jobs.push({
          id: String(job.id),
          kind: job.kind,
          status: job.status,
          owner: job.owner === undefined ? null : String(job.owner),
          label: String(job.label ?? '').slice(0, 120),
          startedAt: job.startedAt,
        })
      }
    }
  }

  let scheduledTasks = false
  for (const agent of live) {
    try {
      const entries = await ctx.waterfall('workspace/session-activity', { sessionId: agent.id }, () => Promise.resolve([]))
      const kinds = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry !== null && typeof entry === 'object')
        .map((entry) => String(entry.kind))
      if (kinds.includes('schedule')) scheduledTasks = true
      if (kinds.length > 0) detail.reminders.push({ id: String(agent.id), kinds })
    } catch {
      // A missing activity provider must not turn into a restart prompt.
      scheduledTasks = false
    }
  }

  return { activeTasks, scheduledTasks, detail }
}

/**
 * Hand the restart to the orchestrator and resolve once it reported success.
 * The orchestrator (see launch.ps1) creates restart.ps1 through WMI, so the
 * actual relauncher outlives this Host instead of depending on a child's
 * lifetime; this call only waits for that handoff.
 * @param target - restartable Desktop facts of this process.
 * @returns nothing; rejects when the relauncher could not be started.
 */
async function spawnRelauncher(target) {
  const script = join(packageDir, 'restart.ps1')
  const launcher = join(packageDir, 'launch.ps1')
  if (!existsSync(script)) throw new Error(`relaunch script is missing: ${script}`)
  if (!existsSync(launcher)) throw new Error(`relaunch orchestrator is missing: ${launcher}`)
  const exe = powershellExecutable()
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    launcher,
    '-AppExe',
    target.executable,
    '-MainPid',
    String(target.mainPid),
    '-HostPid',
    String(target.hostPid),
    '-PwshPath',
    exe,
    '-ScriptPath',
    script,
  ]
  await new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd: dirname(target.executable),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-2000)
    })
    const timer = setTimeout(() => {
      try { child.kill() } catch { /* ignore */ }
      reject(new Error('relaunch orchestrator timed out'))
    }, 15_000)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`relaunch orchestrator exited with ${String(code)}${stderr.trim() === '' ? '' : `: ${stderr.trim()}`}`))
    })
  })
}

/**
 * Answer one restart request.
 * @param ctx - Host context used to inspect running work.
 * @param request - authenticated POST whose JSON body carries `action` and optional `force`.
 * @returns JSON result for the Client half.
 */
async function answer(ctx, request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: 'request body is not JSON' }, { status: 400 })
  }
  const action = body !== null && typeof body === 'object' ? body.action : undefined
  const target = restartTarget()
  if (action === 'status') {
    const work = target.supported ? await workState(ctx) : { activeTasks: false, scheduledTasks: false, detail: {} }
    return Response.json({ ok: true, supported: target.supported, reason: target.reason, ...work })
  }
  if (action !== 'restart') {
    return Response.json({ ok: false, error: `unknown action ${JSON.stringify(action)}` }, { status: 400 })
  }
  if (!target.supported) return Response.json({ ok: true, status: 'unsupported', reason: target.reason })
  if (body.force !== true) {
    const work = await workState(ctx)
    if (work.activeTasks || work.scheduledTasks) {
      try {
        await writeFile(join(packageDir, 'blocked.json'), JSON.stringify({
          time: new Date().toISOString(),
          activeTasks: work.activeTasks,
          scheduledTasks: work.scheduledTasks,
          ...work.detail,
        }, null, 2))
      } catch {
        // Diagnostics must never change the answer.
      }
      return Response.json({
        ok: true,
        status: 'needs-confirmation',
        activeTasks: work.activeTasks,
        scheduledTasks: work.scheduledTasks,
      })
    }
  }
  try {
    await spawnRelauncher(target)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
  return Response.json({ ok: true, status: 'restarting' })
}

/**
 * Register the restart route for the lifetime of this plugin context.
 * @param ctx - Host context; `connection` is required by {@link inject}.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => answer(ctx, request),
  }), 'dsh-restart-button: restart route')
}
