# DeepSeek Harness Desktop

DeepSeek Harness Desktop 是 [deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) 的 Windows 桌面版外壳。它在后台启动 `dsh web`，并用 Electron 打开原生桌面窗口，不需要用户手动安装 Node.js 或启动命令行。

## 下载

发布页面提供两个 exe：

- `DeepSeek-Harness-Desktop-<version>-portable.exe`：免安装便携版，双击即可运行。
- `DeepSeek-Harness-Desktop-<version>-setup.exe`：NSIS 安装版，可安装到指定目录并创建桌面快捷方式。

应用数据默认保存在 `%APPDATA%\dsh-desktop`，包括 `dsh-home` 配置、会话数据和服务器日志。

## 从源码构建

前置要求：Windows 10/11 x64、Node.js 24、pnpm 11。

```sh
# 1. 构建 deepseek-harness 本体（CLI + Web UI）
pnpm install
pnpm run build

# 2. 进入桌面外壳目录
cd desktop
npm install

# 3. 准备运行时并打包 exe（自动下载独立 Node、生成图标）
npm run dist
```

产物位于 `desktop/dist/`：

- `DeepSeek-Harness-Desktop-0.1.0-portable.exe`
- `DeepSeek-Harness-Desktop-0.1.0-setup.exe`

只想构建便携版：

```sh
npm run dist:portable
```

## 工作原理

`desktop/scripts/prepare-runtime.mjs` 会把 workspace 源码复制成独立运行时，把 `workspace:` 依赖改写成 `file:` 依赖，用 npm 生成扁平 `node_modules`，再展开所有符号链接，确保运行时可以整体移动。

`desktop/main.js` 是 Electron 主进程：

1. 使用 `desktop/resources/node/node.exe`（独立 Node 运行时）启动 `dsh web --port 0`。
2. 从服务端日志解析实际监听端口。
3. 在 Electron 窗口加载 `http://127.0.0.1:<port>`。

这样打包出的 exe 不依赖用户机器上已安装的 Node.js，原生模块也使用与构建机一致的 Node ABI。

## 验证

```sh
node scripts/smoke-runtime.mjs   # 直接冒烟 dsh web 运行时
node scripts/smoke-exe.mjs       # 启动打包后的应用并检查页面
```
