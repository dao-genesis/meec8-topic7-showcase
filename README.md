# meec8-topic7-showcase

主题七「基于厂站网一体化的污水厂进厂水量水质超前感知与协同调控模型」成果展示站
（GitHub Pages 静态站 · **口令门控 · 全站加密分发**）。

- 在线访问：https://dao-genesis.github.io/meec8-topic7-showcase/
- 项目源码仓库（私有，团队与评审核验用）：https://github.com/dao-genesis/meec8-topic7
- 访问口令由团队持有（不写入本仓库）；输入口令后由浏览器本地解密内容。
- 注：旧站 `meec8-topic7-site`（2026-07 版）已归档，本仓库为现役站点（2026-10 全面升级版）。

## 站点结构（加密分发）

| 路径 | 内容 |
|---|---|
| `index.html` / `brief.html` / `logic.html` / `results.html` / `qa.html` / `slides.html` / `materials.html` | 七个"壳页"：口令门（输入口令 → 浏览器内解密 `pages/*.enc` 后整页渲染） |
| `pages/*.enc` | 页面正文密文（AES-256-GCM；gzip 后加密） |
| `assets/figures/*.png.enc` | 24 张图表密文（页面内解密为 Blob 显示，可点击放大） |
| `downloads/*.enc` | 下载中心：技术报告（PDF/Word）/ 演示 PPT / 源码包 / 问答与手册 / 数据目录 / 谱系 / 指标 JSON……点击"下载"后浏览器内解密并保存原文件 |
| `offline.html` | **离线单文件版**：全部页面 + 图表自包含（同一口令 · 内部加密）；微信/邮件转发或本地 `file://` 打开即可用 |
| `sw.js` · `manifest.webmanifest` · `assets/icon-192.png` · `assets/icon-512.png` | **PWA**：手机"添加到主屏幕"、离线缓存已访问页面（仅密文） |
| `assets/gate.js` · `assets/site.js` · `assets/site.css` · `assets/favicon.svg` | 门控与解密核心 / 共享脚本 / 样式 / 图标 |
| `robots.txt` | 禁止搜索引擎收录 |

页面一览：首页（输送延迟动画 · 核心数字 · 站点地图）· 官方速览（90 秒读懂）· 底层逻辑（七步详解 · 自测 10 问）·
结果全景（24 图 + 全部实验数字）· 复习问答（36 问）· 网页演示（20 页演示稿，← → / F 全屏）· 材料与复现（下载中心 + 一键复现 + 谱系核验）。

## 安全模型

- 仓库中所有正文、图表与下载物均为 **AES-256-GCM 密文**（密钥由口令经 PBKDF2-SHA256 200k 次派生，格式 `salt(16)|iv(12)|ciphertext`）。
- 解密全部在浏览器本地完成；**无口令者只能拿到密文**，壳页不含任何明文内容。
- 口令不落盘（仅存于访客的 sessionStorage；勾选"记住"时存 localStorage）。
- 明文源 `_src/`（页面源稿 / 图表 / 下载物 / 构建脚本）**不进入本仓库**，只保留在维护者本地与私有仓库。

## 维护流程（维护者本地）

1. 修改 `_src/pages/*.html`（页面源稿）、`_src/figures/*.png`（图表）、`_src/downloads/*`（下载物）。
2. `python _src/build_gate.py` → 重建 `pages/*.enc`、`assets/figures/*.png.enc`、`downloads/*.enc` 与七个壳页。
3. `python _src/build_offline.py` → 重建 `offline.html`（图表转 WebP 压缩）。
4. 提交推送本仓库（只包含密文与公开前端）。

- 图表更新：从 `meec8-topic7` 仓库 `reports/figures/*.png` 拷贝到 `_src/figures/`（保持同名）。
- 文档更新：把最新文档拷贝到 `_src/downloads/`（报告 / 实验结果 / 路演问答 / 答辩手册 / 数据目录 …）。
- 数字口径：一切以 `meec8-topic7` 仓库 `reports/*.json` 为准；本站在数字有出入时以 JSON 为准。
- 本地预览：`python -m http.server` 后浏览器打开（加密站同样可预览）。

> 道法自然 · 居其实而不居其华。
