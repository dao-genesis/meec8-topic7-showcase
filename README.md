# meec8-topic7-showcase

主题七「基于厂站网一体化的污水厂进厂水量水质超前感知与协同调控模型」成果展示站（GitHub Pages 静态站）。

- 在线访问：https://dao-genesis.github.io/meec8-topic7-showcase/
- 项目源码仓库：https://github.com/dao-genesis/meec8-topic7
- 注：旧站 `meec8-topic7-site`（2026-07 版）已归档，本仓库为现役站点（2026-10 全面升级版）。

## 站点结构

| 页面 | 内容 |
|---|---|
| `index.html` | 首页：30 秒总览（输送延迟动画）· 核心数字 · 站点地图 · 成果速览 · 诚实性声明 |
| `logic.html` | 底层逻辑：赛道本质 → 数据破局 → 技术路线 → 七步详解（做法/为什么/数字）→ 三条边界 → 自测 10 问 |
| `results.html` | 结果全景：24 张图表 + 全部实验数字（性能/水质/区间/压力/迁移/SHAP/容错/SWMM/预警） |
| `qa.html` | 复习问答：36 问实战答法（A 数据合规 / B 方法技术 / C 应用落地 / D 局限边界 / E 行业展望） |
| `slides.html` | 网页演示：20 页演示稿（← → / 空格翻页 · F 全屏 · Home/End 首末页） |
| `materials.html` | 材料与复现：下载中心 · 一键复现命令 · 谱系核验 · 演示与视频 |
| `assets/` | 共享样式与脚本（`site.css` · `site.js` · `favicon.svg` · `figures/` 24 张图表） |
| `downloads/` | 交付物下载（技术报告 PDF / 演示 PPT / 源码包 ZIP / 问答 / 答辩手册 / 谱系 / 指标 JSON …） |

## 维护约定

- 图表更新：把 `meec8-topic7` 仓库 `reports/figures/*.png` 拷贝到 `assets/figures/`（保持同名）。
- 文档更新：把最新文档拷贝到 `downloads/`（报告 / 实验结果 / 路演问答 / 答辩手册 / 数据目录 …）。
- 纯静态：无构建步骤、无外部 CDN 依赖；本地预览 `python -m http.server` 后浏览器打开即可。
- 所有数字以 `meec8-topic7` 仓库 `reports/*.json` 为准；本站在数字有出入时以 JSON 为准。
