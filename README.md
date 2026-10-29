# 回声 ECHO：Three.js 电影开场

一段 88 秒、2.39:1 宽银幕的科幻电影开场。画面、配乐、字幕全部在浏览器里实时生成：没有任何模型、贴图或音频文件，所有内容都由代码程序化生成。

## 在线观看 / 下载

- **下载**：<https://github.com/muhuawish-alt/kuKiro/releases/tag/echo-v1.0>
- 下载 `echo.html` 后用浏览器打开，点「开始放映」（建议戴耳机、全屏）

| 文件 | 说明 |
| --- | --- |
| `echo.html` | **单文件成品**（929 KB，内含 three.js、字体子集和全部代码）。下载后用 Chrome / Edge / Safari 直接打开，不需要联网，也不需要服务器 |
| `ECHO.webm` | 离线逐帧渲染的预览视频，1280×536、24fps、VP8 + Opus 声轨，88 秒 |
| `echo-score.wav` | 单独导出的配乐（48 kHz 立体声） |

仓库里的 `dist/echo.html` 和 `docs/index.html` 是同一个文件；`stills/` 是从成片里截取的关键帧。

播放控制：空格 暂停/继续，F 全屏，← → 快退/快进 5 秒，R 重播，M 静音，点击进度条可以跳转。

## 分镜

| 时间 | 镜头 | 运镜 | 字幕 / 字卡 |
| --- | --- | --- | --- |
| 0–5s | 片头厂牌 | 黑场，字体扫光 | KIRO PICTURES 出品 |
| 5–16s | 深空 | 缓慢推进 + 侧滚，变焦逼近脉冲信标 | 2187 年，深空阵列捕捉到一段信号…… |
| 16–30s | 行星日出 | 镜头沿行星背面缓缓上升，太阳从地平线后升起 | 一部 KIRO 影片 / 信号的源头…… |
| 30–44s | 「启明号」掠过 | 低轨仰拍，舰体从头顶压过，镜头下摇跟随引擎 | 配乐字卡 / 我们派出了「启明号」…… |
| 44–52s | 穿云俯冲 | 从云层上方俯冲而下，拉平后露出群山 | 视觉字卡 |
| 52–63s | 峡谷低飞 | 贴地高速飞行，转弯压坡度，鼓点带动机震 | 穿过风暴…… / 四万年来…… |
| 63–72s | 方尖碑 | 环绕升降，充能，光柱爆发，冲击波把镜头推远 | 直到今天，我们才终于听懂。 |
| 72–76.5s | 黑场 | — | 那是我们自己的声音。（回声扩散字效） |
| 76.5–88s | 片名 | 星空漂移 | 回声 ECHO / 二〇二七 · 即将上映 |

## 技术要点

- **场景**：程序化星空（2.2 万颗星，带银河带）+ fbm 星云；行星的地表、云层和夜面发光脉络先在 GPU 上烘焙成 4K 等距贴图，大气用解析散射着色器；舰船用放样建模（loft），表面撒了 2600 个 greeble 小部件，配三平面映射的面板贴图、可旋转居住环、舷窗、导航灯和引擎尾焰；地形是 41 万顶点的脊状多重分形高度场，按航线挖出峡谷，顶点色里烘焙了 AO；云用排序后的公告板实现，雾是解析的高度雾，并按太阳方向着色；方尖碑带程序化发光符文，周围有漂浮碎石和粒子，最后放出光柱和冲击波。
- **后期**：MSAA → 屏幕空间体积光 → Bloom → 变形宽银幕横向光晕 → ACES 色调映射 → 色差、调色、暗角、胶片颗粒、淡入淡出与闪白。镜头光斑由太阳投影位置驱动，被行星或舰体遮挡时会衰减。
- **运镜**：`src/director.js` 里每个镜头都是关于时间 t 的纯函数，所以可以任意跳转，也能逐帧精确渲染。
- **字幕**：DOM 叠加层，所有动画（淡入淡出、模糊、字距、回声扩散、片名入场）都由时间线驱动，不依赖 CSS transition。
- **配乐**：Web Audio 实时合成，包括 pad 和弦、带回声延迟的「信号」三音动机、太鼓、上升音效、BRAAM 重音、共振峰合成的「人声」，并与画面共用同一条时间线（`src/timeline.js`）。

## 目录

```
src/
  main.js        渲染器、播放、控制、逐帧渲染接口（?capture=1）
  director.js    分镜、运镜、各镜头的后期参数
  timeline.js    镜头时间、信号脉冲、鼓点（音画共用）
  space.js       深空场景：星空、星云、行星、大气、太阳、光斑
  ship.js        「启明号」程序化建模
  surface.js     地表场景：天空、地形、高度雾、云、方尖碑、光柱
  post.js        后期管线
  titles.js      字幕和字卡
  audio.js       配乐
  style.css / index.template.html
build.mjs        打包成单文件 dist/echo.html
tools/           无头 Chrome 截图、离线渲染视频、音频检查等脚本
```

## 重新构建

```bash
bun build.mjs                      # 生成 dist/echo.html（需要 python3 和 fontTools，用来裁剪字体子集）
bun tools/stills.mjs 20 38 70.6    # 渲染指定时间点的静帧到 stills/
bun tools/capture.mjs 3 24 1280    # 离线渲染完整视频到 renders/ECHO.webm（可断点续渲）
```

在地址后面加 `?t=60` 可以直接从第 60 秒开始播放。

构建依赖没有放进仓库，需要自己准备：
- three.js r186：`git clone --depth 1 --branch r186 https://github.com/mrdoob/three.js.git node_modules/three`
- 字体放进 `.fonts/`：`NotoSerifSC-Light.otf`、`NotoSerifSC-Regular.otf`（来自 notofonts/noto-cjk 的 `Serif/SubsetOTF/SC`），以及 `Cinzel.ttf`（来自 google/fonts 的 `ofl/cinzel`）
- fontTools：`build.mjs` 默认从 `../.tools/fonttools/Lib` 加载，也可以改成 `pip install fonttools`

## 许可

- three.js r186：MIT
- 字体：Cinzel、Noto Serif SC（SIL Open Font License，见 `FONTS-OFL.txt`）。打包时只嵌入用到的字形
