#!/usr/bin/env node
/**
 * Linux CUA Broker Server — 通过 xdotool/scrot 提供截图与键鼠控制能力。
 *
 * 监听 Unix socket，处理 JSON-RPC 风格的 broker 请求：
 * - screenshot: 用 scrot/gnome-screenshot 截图，返回 base64 PNG
 * - mouse_click: 用 xdotool click
 * - mouse_move: 用 xdotool mousemove
 * - mouse_scroll: 用 xdotool click 4/5 (滚轮上/下)
 * - keyboard_type: 用 xdotool type
 * - keyboard_key: 用 xdotool key
 * - health: 返回 {ok: true}
 *
 * 依赖: xdotool, scrot (或 gnome-screenshot)
 */

import { createServer } from "node:net";
import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ─── 工具检测 ───────────────────────────────────────────────

function hasCommand(cmd) {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const HAS_XDOTOOL = hasCommand("xdotool");
const HAS_SCROT = hasCommand("scrot");
const HAS_GNOME_SCREENSHOT = hasCommand("gnome-screenshot");

if (!HAS_XDOTOOL) {
  process.stderr.write("[linux-cua] WARNING: xdotool not found — keyboard/mouse operations will fail\n");
}
if (!HAS_SCROT && !HAS_GNOME_SCREENSHOT) {
  process.stderr.write("[linux-cua] WARNING: neither scrot nor gnome-screenshot found — screenshot will fail\n");
}

// ─── 截图 ───────────────────────────────────────────────────

function takeScreenshot() {
  const tmpPath = join(tmpdir(), `zcode-cua-screenshot-${randomUUID()}.png`);
  try {
    if (HAS_SCROT) {
      execFileSync("scrot", ["-overwrite", tmpPath], { timeout: 5000 });
    } else if (HAS_GNOME_SCREENSHOT) {
      execFileSync("gnome-screenshot", ["-f", tmpPath], { timeout: 5000 });
    } else {
      return { ok: false, error: "No screenshot tool available (need scrot or gnome-screenshot)" };
    }
    const pngBuffer = readFileSync(tmpPath);
    return { ok: true, result: { data: pngBuffer.toString("base64"), mediaType: "image/png" } };
  } catch (err) {
    return { ok: false, error: `Screenshot failed: ${err.message}` };
  } finally {
    try { if (existsSync(tmpPath)) unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}

// ─── 鼠标操作 ───────────────────────────────────────────────

function mouseClick(params) {
  if (!HAS_XDOTOOL) return { ok: false, error: "xdotool not available" };
  try {
    // button: 1=left, 2=middle, 3=right
    const button = params.button ?? 1;
    execFileSync("xdotool", ["click", String(button)], { timeout: 3000 });
    return { ok: true, result: {} };
  } catch (err) {
    return { ok: false, error: `mouse_click failed: ${err.message}` };
  }
}

function mouseMove(params) {
  if (!HAS_XDOTOOL) return { ok: false, error: "xdotool not available" };
  try {
    const x = params.x ?? 0;
    const y = params.y ?? 0;
    execFileSync("xdotool", ["mousemove", String(x), String(y)], { timeout: 3000 });
    return { ok: true, result: {} };
  } catch (err) {
    return { ok: false, error: `mouse_move failed: ${err.message}` };
  }
}

function mouseScroll(params) {
  if (!HAS_XDOTOOL) return { ok: false, error: "xdotool not available" };
  try {
    // direction: "up" or "down", clicks: number of scroll steps
    const direction = params.direction ?? "down";
    const clicks = Math.abs(params.clicks ?? 1);
    const button = direction === "up" ? 4 : 5;
    for (let i = 0; i < clicks; i++) {
      execFileSync("xdotool", ["click", String(button)], { timeout: 3000 });
    }
    return { ok: true, result: {} };
  } catch (err) {
    return { ok: false, error: `mouse_scroll failed: ${err.message}` };
  }
}

// ─── 键盘操作 ───────────────────────────────────────────────

function keyboardType(params) {
  if (!HAS_XDOTOOL) return { ok: false, error: "xdotool not available" };
  try {
    const text = params.text ?? "";
    if (!text) return { ok: true, result: {} };
    execFileSync("xdotool", ["type", "--", text], { timeout: 5000 });
    return { ok: true, result: {} };
  } catch (err) {
    return { ok: false, error: `keyboard_type failed: ${err.message}` };
  }
}

function keyboardKey(params) {
  if (!HAS_XDOTOOL) return { ok: false, error: "xdotool not available" };
  try {
    const key = params.key ?? "";
    if (!key) return { ok: true, result: {} };
    // 支持组合键: "ctrl+c", "alt+F4", "Return", "BackSpace" 等
    execFileSync("xdotool", ["key", "--", key], { timeout: 3000 });
    return { ok: true, result: {} };
  } catch (err) {
    return { ok: false, error: `keyboard_key failed: ${err.message}` };
  }
}

// ─── 请求分发 ───────────────────────────────────────────────

function dispatchRequest(request) {
  const method = request.method;
  const params = request.params ?? {};

  switch (method) {
    case "health":
      return { ok: true, result: { platform: "linux", tools: { xdotool: HAS_XDOTOOL, scrot: HAS_SCROT, gnome_screenshot: HAS_GNOME_SCREENSHOT } } };
    case "screenshot":
      return takeScreenshot();
    case "mouse_click":
      return mouseClick(params);
    case "mouse_move":
      return mouseMove(params);
    case "mouse_scroll":
      return mouseScroll(params);
    case "keyboard_type":
      return keyboardType(params);
    case "keyboard_key":
      return keyboardKey(params);
    default:
      return { ok: false, error: `Unknown method: ${method}` };
  }
}

// ─── Unix Socket Server ─────────────────────────────────────

const socketPath = process.argv[2];
if (!socketPath) {
  process.stderr.write("Usage: linux-broker-server.mjs <socket-path>\n");
  process.exit(1);
}

// 清理旧 socket 文件
if (existsSync(socketPath)) {
  try { unlinkSync(socketPath); } catch { /* ignore */ }
}

const server = createServer((conn) => {
  let buffer = "";
  conn.on("data", (chunk) => {
    buffer += chunk.toString();
    // 按行处理请求（每行一个 JSON 请求）
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 保留不完整的最后一行
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const request = JSON.parse(line);
        const response = dispatchRequest(request);
        conn.write(JSON.stringify({ id: request.id, ...response }) + "\n");
      } catch (err) {
        conn.write(JSON.stringify({ ok: false, error: `Parse error: ${err.message}` }) + "\n");
      }
    }
  });
});

server.listen(socketPath, () => {
  // 通知父进程 broker 已就绪
  if (process.send) {
    process.send({ type: "ready", socketPath });
  }
  process.stderr.write(`[linux-cua] Broker listening on ${socketPath}\n`);
});

server.on("error", (err) => {
  process.stderr.write(`[linux-cua] Server error: ${err.message}\n`);
  process.exit(1);
});

// 优雅退出
process.on("SIGTERM", () => {
  server.close(() => {
    try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* ignore */ }
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  server.close(() => {
    try { if (existsSync(socketPath)) unlinkSync(socketPath); } catch { /* ignore */ }
    process.exit(0);
  });
});
