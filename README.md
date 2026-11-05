# 花间 · Floral Astrology

一个独立的花朵测验页面。当前只做 MBTI 风格的四组偏好：12 道原创中文情境题，每组 3 题，回答逐步塑造同一朵水晶与金属之花。题目类型入口以后再套；东方材质、五行、星座、测字等暂不实现。

## 当前范围

- 画面以花为中心，只展示当前题目、两个宝石选项；配色与晨曦／夜晚用小型图形控件选择。无教程、开发者说明、账号或付费流程。
- 四组连续参数分别影响舒展、悬离、曲面与排列。答题成熟度独立于最终姿态，聚拢的花也完整盛开。
- 每次选择从当前姿态指数趋近新目标，约 2 秒完成本次变化的 60%；动画不阻塞读题。末题继续完成展开。
- 优先使用较高画质：物理透射、珠光、水晶切面、金属细边、环境反射、辉光、薄雾光束和景深感微粒。持续慢帧时逐步降低分辨率，不改变答案或花形。
- 当前答案只保留在本次页面内存中。刷新重新开始；返回可重答。字体随站点加载，不向外部问卷服务提交答案。
- WebGL 无法建立时切换到同样受答案驱动的 Canvas 花形，保留完整测验和晨夜选择。两种渲染路径共用评分、进度与参数含义。

12 题、约 1–2 分钟是本页的体验目标，尚未经过用户完成时间测量。本题库借四组偏好组织原创问题，不等同于正式 MBTI 量表。主流参照 [16Personalities 为 60 题](https://www.16personalities.com/free-personality-test?content_language=English)，[其官方指南称约 10 分钟](https://www.16personalities.com/articles/how-to-take-a-personality-test)。本页没有复制其题库或推定所有用户的耐心。

## 开发

```sh
npm ci
npm run dev
npm test
npm run build
```

静态产物为 `dist/`。Three.js 负责单一场景和帧循环；花瓣形变在 GPU 执行，题目切换不重建场景。环境、网格、材质与后处理资源由 `FlowerScene` 统一释放。`?qa` 仅暴露只读检查状态，不增加页面控件。

本轮已通过评分与动画的 6 项检查、类型检查和生产构建；在普通预览浏览器走完 12 题并核对 390px 手机布局、重答、晨夜与配色。该浏览器禁用了 WebGL，核验画面使用 Canvas 路径；专用 WebGL 检查服务未连接，3D 材质、光照与手机实际帧率仍需在可用的 WebGL 环境复核。

## 来源

- 水晶花园的五段宽度轮廓插值与姿态参数思想：[plant-geometry-v31-runtime.ts](https://github.com/StarObserverPro/crystal-garden/blob/d60044a8bbe5682573bb518841baa3418d9d6efa/app/crystal-garden/scene/plant-geometry-v31-runtime.ts)。只提取独立数学方法，不引入原项目的世界和游戏状态。
- 题目字体 [Ma Shan Zheng](https://github.com/googlefonts/mashanzheng)，选项字体 [LXGW WenKai TC](https://github.com/lxgw/LxgwWenKai)，结果字母 [Cormorant Garamond](https://github.com/CatharsisFonts/Cormorant)。字体均使用 OFL，随源代码附许可与本页字符子集。
- [MBTI 四组偏好的含义](https://www.myersbriggs.org/my-mbti-personality-type/the-mbti-preferences/)。视觉对应为本项目的艺术设计。

## 工作约定

先做一两轮可实际操作的页面，再共同对齐详细文档。跟随实现进度及时修订这份范围与当前决定，避免代码和文档长期脱节。运行证据留在临时目录，展示和核验完成后及时清理；不提交截图、捕获文件、构建产物和过期方案。验证集中于评分、连续动画、完整答题流程，以及手机和电脑的实际画面。
