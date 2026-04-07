# RenderX IF Indoor

团队内部使用的纯前端生图工具，支持 Google AI Studio 和 Vertex AI 两种接入模式。

## 本地开发

1. 安装依赖：`npm install`
2. 启动开发：`npm run dev`
3. 打开页面后，点击右下角悬浮 API 按钮
4. 选择 `AI Studio` 或 `Vertex AI`
5. 填入你自己的 API Key 并保存

说明：API 配置仅保存在当前浏览器的 `localStorage`，不会写入仓库。

## 部署到 Vercel

1. 将仓库导入 Vercel
2. Framework 选择 `Vite`
3. Build Command 使用 `npm run build`
4. Output Directory 使用 `dist`
5. 部署后，团队成员首次打开页面时各自通过右下角 API 按钮填写自己的配置即可使用

## 安全建议

- 在 Google AI Studio 或 Vertex AI 对 API Key 配置 HTTP Referrer 限制
- 仅允许你的 Vercel 域名（例如 `https://your-app.vercel.app/*`）
