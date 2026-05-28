# Command Workbench

Command Workbench 是一个本地运行的测试命令工作台：把原始测试用例文本拆解成可审查的步骤，再逐项生成命令草稿和验证脚本，支持“执行到此”和导出单文件 Bash 脚本。

核心原则：

- 面向最终用户，不暴露 adapter 等工程概念。
- 不用本地关键字/正则去理解原始用例语义；语义拆解、知识选择、命令/验证推断都交给配置的 LLM/CLI。
- 原文命令优先；模型推断的命令默认阻塞，必须人工确认后才能执行或导出。
- 验证脚本必须检查 `$COMMAND_OUTPUT` 或 `$COMMAND_STATUS`，不能再次运行主命令。
- SSH 密码、LLM API key 等敏感信息不会回显到 UI 日志或服务响应。

## 当前能力

### 用例生成流程

UI 左侧按阶段展示进度：

1. **章节拆分中**：系统优先基于显式 S 编号把原文拆成有序步骤，保留层级结构。
2. **脚本生成中**：逐项生成命令草稿和验证脚本，逐项回填，避免一次性大请求耗时过长或失败后没有中间结果。


### LLM / CLI 调用方式

设置面板只暴露三类最终用户可理解的方式：

- 本地 Claude CLI：默认调用运行 Web 服务机器上的 `claude -p`。
- 本地 Codex CLI：默认调用运行 Web 服务机器上的 `codex exec`。
- LLM API：填写 `URL + API key + Model`，按 chat-completions 兼容请求发送。

未配置 LLM/CLI 时，系统不会解析原文或推断命令。

所有 prompt 集中在：

```text
src/llm/prompts.js
```

传输、鉴权、日志、JSON 解析在：

```text
src/llm/adapter.js
```

### 远程 SSH

远程配置在设置面板的二级菜单中：

- host
- username
- password（默认认证方式）
- root login / root 风险确认

“确认远程配置”只检查必填项；“测试 SSH 连通”才会尝试真实 SSH。密码只保留在页面输入框，不写入 localStorage，不进入模型日志。

### 知识库 / 人工经验

运行时知识库存放在：

```text
.workbench/knowledge/
  index.json
  items/*.md
```

知识库只有一个用户概念：**人工经验 / knowledge item**。不再要求用户区分 rule、skill、example、doc。

检索机制：

1. 本地代码只过滤 `enabled`，不再按 `phases` 或 `isDeviceShell` 做硬约束。
2. 模型先看 `index.json` 里的短摘要，结合当前步骤语义选择相关知识项 ID。
3. 只有被选中的 Markdown 正文会进入最终 prompt。

当前已经整理的 Huawei 官方知识：

- `hccn_tool`：拆成 6 个 active 小知识项，另有 1 个 disabled 覆盖报告。
- `npu-smi`：拆成 7 个 active 小知识项，另有 1 个 disabled 覆盖报告。

这些知识项重点服务于：

- 输出字段理解
- PASS/FAIL 校验线索
- 参数缺口补齐约束
- 高风险/有副作用命令识别

而不是简单把整篇官方文档塞进模型上下文。

### 执行与导出安全

- 点击“执行到此”只执行 `0..N`，不会执行后续项。
- 执行前会拒绝空命令、未确认推断命令、缺失/异常验证脚本、远程 SSH 配置缺口等。
- 导出脚本是单文件 Bash，固定输出 `PASS` / `NO PASS`。
- 导出脚本只处理确认后的步骤条目，不包含额外前置条件状态。

## 快速启动

```bash
npm start
# open http://localhost:3001
```

默认端口是 `3001`。需要换端口：

```bash
PORT=3002 npm start
```

## 环境变量配置

也可以通过环境变量设置默认 LLM/CLI：

```bash
# 本地 Claude CLI
export WORKBENCH_LLM_PROVIDER=local-claude
# optional
export WORKBENCH_LLM_MODEL=sonnet

# 本地 Codex CLI
export WORKBENCH_LLM_PROVIDER=local-codex
# optional
export WORKBENCH_LLM_MODEL=gpt-5.5

# LLM API / HTTP 模型接口
export WORKBENCH_LLM_PROVIDER=llm-api
export WORKBENCH_LLM_URL=https://api.openai.com
export WORKBENCH_LLM_API_KEY=...
export WORKBENCH_LLM_MODEL=gpt-4.1
```

`.env.example` 里有完整示例。

## 测试

```bash
npm test
```

当前测试覆盖：

- HTTP API parse/decompose/generate/export
- CLI/HTTP LLM adapter
- staged generation
- knowledge selection and injection
- secret redaction
- remote SSH config/live health
- execute-to-here
- exported script behavior

## 重要目录

```text
src/server/          HTTP server and API routes
src/ui/              Single-page UI
src/llm/             LLM/CLI transport and prompt registry
src/planner/         Decompose/generate flow
src/knowledge/       Knowledge index, retrieval and item persistence
src/domain/          Draft/readiness/export domain rules
src/executor/        Local execution and SSH health checks
src/script/          Standalone Bash exporter
src/security/        Secret redaction

docs/                Architecture, adapter contract, knowledge mechanism
.workbench/knowledge Runtime knowledge base
```

## Git ignore 模板

仓库里有两套额外模板：

- `.gitignore.service`：交付给最终用户的服务代码，排除 OMX、设计稿、运行状态、密钥等。
- `.gitignore.dev`：开发仓库使用，保留设计文档/知识库，排除运行日志、状态、密钥、依赖产物。

当前 `.gitignore` 是实际生效的工作区 ignore；两套模板用于提交/交付策略选择。

## 分支约定（当前仓库）

当前本地/远端都有 3 个分支：

- `main`：当前主线，包含最新工作台实现、拆分后的 Huawei 知识库索引与代码。
- `dev`：开发提交线，和 `main` 相比主要多了旧版 Huawei 大文档条目以及两套 gitignore 模板提交形态。
- `svc`：服务交付线，和 `main` 相比主要多了旧版 Huawei 大文档条目；不包含 `.gitignore.dev` / `.gitignore.service` 模板差异。

实际比较时请忽略 `.omx/` 运行日志和状态文件，它们是本机运行噪声，不代表产品差异。
