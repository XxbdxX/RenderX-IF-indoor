# RenderX IF Indoor

团队内部使用的纯前端建筑效果图工具，当前支持 Google AI Studio、Yoro Gemini 中转和 Image-2 中转接入模式。

## 当前功能

- 纯前端运行，无自建后端
- 支持 `AI 托管`、`手动配置`、`自由对话` 三种出图模式
- 支持 `NanoBanana PRO` 与 `NanoBanana 2` 模型切换
- 支持 `1K / 2K / 4K` 输出分辨率
- 支持折叠式渲染设置面板，集中配置模型、思考强度、分辨率、画布比例
- 支持主图 + 参考图联合生成，并在请求中明确区分主图与参考图角色
- 支持方案库、本地浏览器历史记录、导出目录自动保存与参数侧车 JSON

## 本地开发

1. 安装依赖：`npm install`
2. 启动开发：`npm run dev`
3. 打开页面后，点击右下角悬浮 API 按钮
4. 选择 `AI Studio`、`Yoro` 或 `Image-2`
5. 填入你自己的 API Key 并保存
6. 如使用 `Yoro`，默认 Base URL 为 `https://api.yoro.ren`，按其中转站 Gemini 兼容接口填写对应 API Key
7. 如使用 `Image-2`，填写中转站提供的 OpenAI 兼容 Base URL 和 API Key；Base URL 可填到 `/v1`，应用会通过同源代理调用 `/images/edits`

说明：

- API 配置仅保存在当前浏览器的 `localStorage`，不会写入仓库
- 首次打开页面且本地没有保存配置时，API 设置面板会自动弹出
- `Yoro` 当前走 Gemini 兼容接口，复用现有多图与图片生成请求结构
- `Image-2` 当前走 OpenAI 兼容图片编辑接口，并通过 `/api/image2-edits` 同源代理转发，避免浏览器跨域请求被中转站 CORS 拦截

## 渲染设置说明

- `NanoBanana PRO`：固定高思考，适合质量优先场景
- `NanoBanana 2`：支持 `默认 / 快速 / 深入` 三档思考强度
- 可在渲染设置标题右侧切换 `NanoBanana` 与 `Image-2` 通道；Image-2 实际模型由 API 设置里的 `Model` 字段决定，默认 `gpt-image-2`
- `4K` 会按高负载任务进入渲染队列，耗时通常高于 `1K / 2K`
- 画布比例当前支持：`自由比例`、`跟随原图`、`1:1`、`16:9`、`9:16`、`4:3`、`3:4`

## 历史与导出

- 顶部支持选择导出目录
- 生成成功后，如已选择导出目录，会自动保存图片并写入参数记录 JSON
- `方案库` 会同时显示浏览器内历史与从导出目录恢复的记录

## 部署到 Vercel

1. 将仓库导入 Vercel
2. Framework 选择 `Vite`
3. Build Command 使用 `npm run build`
4. Output Directory 使用 `dist`
5. 部署后，团队成员首次打开页面时，各自通过右下角 API 按钮填写自己的配置即可使用

## 安全建议

- 在 Google AI Studio 对 API Key 配置 HTTP Referrer 限制
- 仅允许你的 Vercel 域名，例如 `https://your-app.vercel.app/*`
