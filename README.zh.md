# TomiHub

[English](README.md) | **中文**

AI 驱动的项目管理平台 —— **开源底座，闭源 AI 引擎**。

> TomiHub = 项目管理（Issue / 看板 / 甘特图 / Wiki / 迭代 / 权限 / 多租户）
> \+ AI 辅助（六维健康度分析、风险预测、AI 报告）。本仓库是**开源底座**
> （AGPL-3.0）：一套完整可用的项目管理栈，外加 Redmine 连接器。
>
> AI 分析引擎（ai-brain）是独立的闭源组件：镜像可从 ghcr.io 自由拉取，但运行
> 需要**按部署签发的许可证文件（`ai-brain.lic`）**。该引擎不属于本仓库源码，
> 且**不受 AGPL-3.0 覆盖**。
>
> **AI 功能由许可证管控，而非下载：** 开源底座无需任何许可证即可正常使用；
> 配合 ai-brain 镜像 + 有效许可证即可获得完整 AI 版 —— 见
> [企业版 / AI](#enterprise-ai)。

<a id="live-demo"></a>
## 在线体验

无需安装即可试用 TomiHub —— 官网上有一个共享的访客 Demo，运行的是**完整 AI 版**
（健康度雷达、风险预测、AI 报告、AI 助手、知识地图）：

**→ <http://124.223.90.64/login?demo=1>**

也可从官网进入：<https://tomatovector.com/hub> → "Live Demo"。

无需注册账号 —— 该链接会以访客身份直接登录。这是一个共享工作区：所有访客共用
同一份数据，每日重置；AI 功能与创建 Issue 有按访客计的额度限制。

> 想用自己的实例？从[快速开始](#quick-start)的开源 compose 入手 —— 项目管理
> 这套栈不需要许可证。

## 截图

项目总览 —— AI 健康度雷达与风险监控（AI 版）：

![项目总览 1](screenshots/ProjectOverview1.png)

![项目总览 2](screenshots/ProjectOverview2.png)

> 截图为 AI 版。没有 ai-brain + 许可证时，同样的页面渲染为无 AI 版
> （不显示健康度 / 风险 / 知识地图等入口）。

## 仓库内容

| 模块 | 说明 |
|------|------|
| `backend/` | Java Spring Boot 3.3 微服务（auth / core / tenant / notification / webhook……） |
| `frontend/` | React 19 + TanStack Router + Zustand + Vite |
| `supabase/migrations/` | PostgreSQL 表结构（pgvector） |
| `connectors/redmine/` | Redmine REST 连接器 + 数据导入引擎（可独立运行） |
| `docker/` | Compose 编排 + Dockerfile（core / frontend / 基础设施） |
| `docs/` | 架构 / UI / 部署 / 权限设计（不含 AI） |

**不在本仓库源码中：** 闭源的 `ai-brain/` 分析引擎及其 AI 设计文档。（其预构建
镜像可从 ghcr.io 下载，运行需要许可证 —— 见[企业版 / AI](#enterprise-ai)。）

<a id="quick-start"></a>
## 快速开始（自托管，无 AI 模式）

开源 compose 会启动完整的项目管理栈，**不含** AI 引擎
（core + frontend + postgres + redis + rabbitmq）。AI 功能需要已授权的 ai-brain
组件 —— 见企业版章节。

```bash
cd docker
cp .env.example .env        # 调整密码 / 访问地址
bash gen-keys.sh            # 生成 JWT 签名密钥对并写入 .env
docker compose up -d --build
# 打开 http://localhost —— 首次启动的向导会创建你的租户
```

> 无 AI 构建会在 UI 中隐藏 AI 入口（健康度 / 风险 / 助手 / 知识地图），nginx 的
> AI 路由会直接返回一段 JSON 提示，而不是转发给不存在的 ai-brain。本仓库自带的
> compose 构建的就是无 AI 版（`VITE_ENABLE_AI_FEATURES=false`，demo 模式关闭）。
> `docker-compose.enterprise.yml` 是 AI 版 —— 供运行已授权 `ai-brain` 组件的部署
> 使用。

## Redmine 连接器

把 Redmine 项目镜像进 TomiHub 数据模型，支持全量 + 增量同步：

```bash
cd connectors/redmine
pip install -e .
AIPM_REDMINE_URL=... AIPM_REDMINE_API_KEY=... \
AIPM_REDMINE_PROJECT_KEYS=myproj AIPM_REDMINE_TENANT_ID=... \
AIPM_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_pm \
python -m redmine_connector.cli --full
```

详见 `docs/redmine-connector-design.md` 与 `docs/redmine-experiment.md`。

<a id="enterprise-ai"></a>
## 企业版 / AI

AI 功能（健康度 / 风险 / 报告 / 助手 / 知识地图）由 `ai-brain` 服务提供。
镜像**可自由拉取** —— 开源底座加上这些镜像即构成完整的 AI 版：

```bash
docker pull ghcr.io/xxwj225-james/tomihub-brain-api:v1.2.2
docker pull ghcr.io/xxwj225-james/tomihub-brain-worker:v1.2.2
docker pull ghcr.io/xxwj225-james/tomihub-brain-beat:v1.2.2
```

然后运行 `docker/docker-compose.enterprise.yml`，并把许可证文件放到
`docker/ai-brain.lic`。该 compose 文件固定引用同样的 `v1.2.2` 标签，因此你拉取的
镜像与栈启动的镜像完全一致。

> 用的不是这个版本？拉取对应标签，并把 `docker-compose.enterprise.yml` 中三处
> `image:` 改成一致 —— 标签是刻意固定的，这样升级永远是一次明确、可追溯的操作。

**真正管控 AI 功能的是许可证**，而不是下载：没有有效的 `ai-brain.lic`，AI 接口会
返回 `403 license_required`，AI 服务也会拒绝启动。授权在代码中强制（没有可以关闭
它的配置开关）。

想在授权前先看看效果？[在线体验](#live-demo)在共享访客工作区上运行完整 AI 版。
要自己部署，请在 <https://tomatovector.com/hub-preview> 申请**免费 14 天试用许可
证**或正式授权 —— 按部署签发，首次启动时与本机绑定。配额：试用版 1 租户 /
10 席位 / 3 项目；正式版按档位扩展到 200+ 席位。

> **专有组件声明**：`ai-brain` 镜像是**按商业许可分发的专有软件 —— 不受本仓库
> AGPL-3.0 许可覆盖**。AGPL-3.0 条款仅适用于本仓库的开源代码。在你被授权的部署
> 之外再分发 `ai-brain` 镜像不被允许。

从 Redmine / Jira / 禅道迁移、行业模板、企业集成（飞书 / 企微 / SSO）、AI 调优与
运维托管，欢迎联系我们。

## MCP：接入客户端（TomiLite 可作为 MCP 客户端）

TomiHub 暴露了一个 MCP server：

```
https://<your-tomihub>/api/v1/mcp
```

任何兼容 MCP 的客户端都能接入 —— **TomiLite 可作为 MCP 客户端**（[TomiLite on GitHub](https://github.com/xxwj225-James/tomilite)）。
在 *TomiLite → Settings → MCP Servers* 中添加一个 server：

- **URL**: `https://<your-tomihub>/api/v1/mcp`
- **Auth**: 在 *TomiHub → Settings → API Keys* 创建的 API Key，通过请求头 `X-Api-Key` 发送

Claude Code / Cursor 示例（`.claude/mcp.json`）：

```json
{
  "mcpServers": {
    "tomiHub": {
      "type": "http",
      "url": "https://<your-tomihub>/api/v1/mcp",
      "headers": { "X-Api-Key": "<your-api-key>" }
    }
  }
}
```

TomiHub 的 MCP 工具（项目健康度、风险、报告……）随后即可被接入的客户端使用；
写操作类工具会走 HITL 人工确认队列。

> **可用性**：MCP 的 AI 工具由 `ai-brain` 提供，需要已授权的 AI 版
> （`docker-compose.enterprise.yml`）。开源的无 AI compose 在 `/api/v1/mcp` 上
> 返回 `ai_unavailable` 提示。

## 许可证

AGPL-3.0 —— 见 [LICENSE](LICENSE)，覆盖本仓库的源代码。无法遵守 AGPL 的部署可购买
商业授权；商业授权随企业服务打包提供，不单独售卖。

**范围说明：** `ai-brain` 容器镜像（从 ghcr.io 拉取）是**按独立商业许可提供的专有
软件，不受 AGPL-3.0 覆盖**。它们仅被授权在你的许可部署内使用。

`connectors/redmine/` 下的 Redmine 连接器同样采用 AGPL-3.0（作为开放的获客资产；
消费镜像数据的分析引擎仍按部署授权分发）。
