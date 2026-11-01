# 鸦：反战短片（代码版）

用浏览器 Canvas 绘制的 9:16 竖屏短片，配乐取仓库根目录 MP3 的 0:44.18 段落。

目前完成：前三段，0–47.07 秒（成片多放一小节到 48.945 秒）。

- 第一段（0–16.875 秒）：一列不同的普通人，各做各的事，每个人身后都有自己的影子；战争的迹象越来越多（报纸头条 WAR 和阵亡名单、齐柏林飞艇、铁丝网、远处的烟）。
- 第二段（16.875–26.25 秒）：红色从队首漫向队尾。红色到谁脚下，谁就僵住，手里的东西掉在地上（风筝被风吹走），帽子掉落；军装从脚往上长上来，变成同样的一战士兵（碟形钢盔、绑腿、背包、子弹盒、上刺刀的步枪）。影子不变，还是原来的人，还在做原来的事。镜头拉远成全景。
- 第三段（26.25–47.07 秒）：士兵齐步向前走，掉在地上的东西留在原地；影子跟着士兵的步子走。每个小节有一个士兵化成灰，影子停住、烙在地上，脚下渗出血；红色随时间和消失的人数一点点变深。最后几小节远处的士兵成片消失；音乐骤停时，最后一个士兵（女孩）消失。

## 文件

- `part1-3.webm`：前三段成片（0–48.945 秒），1080×1920，30fps，带音乐
- `part1-2.webm`、`part1.webm`：之前阶段的成片
- `index.html`：播放页面，可以播放、导出 WebM
- `src/queue.js`：队列场景（三段共用）：镜头、前后景、乌鸦、八个人物和他们的动作、报纸翻页、影子、红色前沿和血、变成士兵的过程、掉落的东西
- `src/figures.js`：人物剪影（衣服阴影、图案、帽子、头发、姿势、一战钢盔和装具、步枪）
- `src/draw.js`：调色板、时间函数、图标、纸张质感、飞行的乌鸦
- `src/export.js`：逐帧导出 WebM（WebCodecs 编码 + WebM 封装）
- `src/main.js`：播放、音频同步、导出按钮
- `src/icons.js`：图标路径数据
- `cover/bilibili_1920x1080.png`、`cover/douyin_1080x1920.png`：B站和抖音封面
- `cover.html`、`src/cover.js`：封面的绘制代码，打开 `cover.html` 可以重新生成并下载 PNG

封面字体是思源宋体 Black（Noto Serif SC）。字体文件太大，没有放进仓库：`cover.html` 会先找 `crow-film/fonts/NotoSerifSC-Black.otf`，找不到就从 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) 下载。

导出按钮会逐帧渲染再编码，不会掉帧。需要 Chrome 或 Edge，并且页面通过 `https` 或 `localhost` 打开；条件不满足时会退回实时录制。

## 本地运行

页面使用 ES 模块，需要通过 HTTP 打开，不能直接双击打开：

```
python3 -m http.server 8000
```

然后访问 `http://localhost:8000/crow-film/`。网址后面加 `?t=秒数` 可以预览单帧。

## 素材署名

乌鸦、风筝、书包、法棍、伞、小提琴、向日葵图形来自 [game-icons.net](https://game-icons.net)，许可证 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)：

- Lorc：raven、crow-dive、feather、umbrella
- Delapouite：kite、bread、backpack、umbrella-bayonet、sunflower
- Zajkonur：violin

原图的方形背景已去掉，颜色改为黑色。公开发布成片时，请在片尾或简介中注明以上署名。

封面字体：Noto Serif SC（Google / Adobe），许可证 [SIL Open Font License 1.1](https://openfontlicense.org)。

配乐：Kam Ridr - the other side of paradise。公开发布前请确认音乐授权。
