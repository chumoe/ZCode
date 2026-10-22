/* eslint-disable max-lines */
import { randomBytes } from "node:crypto";
import { fork, type ForkOptions } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CuaHelperHandle,
  CuaProductHelperHost,
} from "@zcode/zcode-cua/broker/server";
import type { HelperHealth } from "@zcode/zcode-cua/broker";

import { createServiceLogger, type ServiceLogger } from "#src/logger/serviceLogger.js";

export type ManagedCuaProductHelperHost = CuaProductHelperHost & {
  stop(): Promise<void>;
  checkHealth(timeoutMs?: number): Promise<unknown>;
};

type CuaHelperTransportHandle = Pick<CuaHelperHandle, "socketPath" | "pluginAuthority">;

const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3_000;

/**
 * Linux CUA Helper Host — 轻量实现，fork 一个 Node.js 子进程运行 linux-broker-server.mjs。
 *
 * 与 Windows/macOS 的复杂两阶段 transport lifecycle 不同，Linux broker server
 * 是一个简单的 Unix socket JSON-RPC server，用 xdotool/scrot 提供截图与键鼠控制。
 * 不需要 TCC 权限模型、generation lifecycle 或 transport ready 两阶段。
 */
export class LinuxCuaHelperHost implements ManagedCuaProductHelperHost {
  private readonly logger: ServiceLogger;
  private readonly startupTimeoutMs: number;
  private readonly shutdownTimeoutMs: number;
  private readonly authority: string;
  private handle: CuaHelperHandle | null = null;
  private child: ReturnType<typeof fork> | null = null;
  private stopped = false;
  private startPromise: Promise<CuaHelperHandle> | null = null;

  constructor(options?: {
    startupTimeoutMs?: number;
    shutdownTimeoutMs?: number;
    logger?: ServiceLogger;
  }) {
    this.logger = options?.logger ?? createServiceLogger("linux-cua-helper");
    this.startupTimeoutMs = options?.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.shutdownTimeoutMs = options?.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    this.authority = randomBytes(16).toString("hex");
  }

  get running(): boolean {
    return this.child !== null && !this.stopped && this.handle !== null;
  }

  get socketPath(): string | null {
    return this.handle?.socketPath ?? null;
  }

  get pluginAuthority(): string | null {
    return this.authority;
  }

  get reservedTransport(): CuaHelperTransportHandle | undefined {
    if (this.handle) {
      return { socketPath: this.handle.socketPath, pluginAuthority: this.authority! };
    }
    return undefined;
  }

  /**
   * 启动 Linux broker server 子进程，返回 CuaHelperHandle。
   * 幂等：如果已经在运行，直接返回现有 handle。
   */
  start(): Promise<CuaHelperHandle> {
    if (this.stopped) throw new Error("LinuxCuaHelperHost has been stopped");
    if (this.handle && this.child) return Promise.resolve(this.handle);
    if (this.startPromise) return this.startPromise;

    this.startPromise = this._doStart();
    this.startPromise.finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private async _doStart(): Promise<CuaHelperHandle> {
    const socketPath = join(tmpdir(), `zcode-cua-broker-${randomBytes(8).toString("hex")}.sock`);

    // linux-broker-server.mjs 路径：相对于本文件
    const brokerScript = join(import.meta.dirname ?? __dirname, "linux-broker-server.mjs");

    this.logger.info("Starting Linux CUA broker server", { socketPath });

    const child = fork(brokerScript, [socketPath], {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: { ...process.env },
    } as ForkOptions);

    this.child = child;

    child.on("error", (err) => {
      this.logger.error("Linux CUA broker child error", { error: err.message });
    });

    child.on("exit", (code, signal) => {
      this.logger.info("Linux CUA broker child exited", { code, signal });
      if (this.child === child) {
        this.child = null;
        this.handle = null;
      }
      // 清理 socket 文件
      try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* ignore */ }
    });

    // 等待子进程发送 ready 消息
    const handle = await new Promise<CuaHelperHandle>((resolve, reject) => {
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Linux CUA broker startup timed out after ${this.startupTimeoutMs}ms`));
      }, this.startupTimeoutMs);

      const onMessage = (msg: unknown) => {
        if (typeof msg === "object" && msg !== null && (msg as { type?: string }).type === "ready") {
          clearTimeout(timeout);
          child.off("message", onMessage);
          child.off("exit", onExit);
          resolve({
            socketPath,
            pluginAuthority: this.authority,
            pid: child.pid,
          });
        }
      };

      const onExit = (code: number | null) => {
        clearTimeout(timeout);
        child.off("message", onMessage);
        child.off("exit", onExit);
        reject(new Error(`Linux CUA broker exited during startup with code ${code}`));
      };

      child.on("message", onMessage);
      child.on("exit", onExit);
    });

    this.handle = handle;
    this.logger.info("Linux CUA broker server ready", { pid: handle.pid, socketPath });
    return handle;
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;

    if (this.child) {
      const child = this.child;
      this.child = null;
      this.handle = null;

      child.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, this.shutdownTimeoutMs);

        child.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }

  async restart(): Promise<CuaHelperHandle> {
    await this.stop();
    this.stopped = false;
    return this.start();
  }

  /**
   * Linux 不需要两阶段 restart——直接 restart 即可。
   * 提供此方法以满足 CuaProductHelperHost 接口。
   */
  async restartAfterCurrentStart(): Promise<CuaHelperHandle> {
    return this.restart();
  }

  async checkHealth(timeoutMs?: number): Promise<HelperHealth> {
    if (!this.child || !this.handle) {
      throw new Error("Linux CUA broker is not running");
    }
    // 简单健康检查：返回 pid 信息
    return { bundleId: null, pid: this.child.pid ?? null };
  }

  /**
   * Linux 不需要 waitForTransport 两阶段——broker server 启动后 socket 立即可用。
   * 但为了兼容 buildCuaProductHelperAgentEnv 的 waitForTransport 路径，提供此方法。
   */
  async waitForTransport(_timeoutMs?: number): Promise<CuaHelperTransportHandle> {
    const handle = await this.start();
    return { socketPath: handle.socketPath, pluginAuthority: handle.pluginAuthority };
  }
}
