# 鸦：反战短片（代码版）

用浏览器 Canvas 绘制的 9:16 竖屏短片，配乐取仓库根目录 MP3 的 0:44.18 段落。

目前完成：第一段，0–16.875 秒。

## 文件

- `part1.webm`：第一段成片，1080×1920，带音乐
- `index.html`：播放页面，可以播放、导出 WebM
- `src/part1.js`：第一段的人物、镜头和时间
- `src/draw.js`：图标和人物剪影的绘制
- `src/main.js`：播放、音频同步、导出
- `src/icons.js`：图标路径数据

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

配乐：Kam Ridr - the other side of paradise。公开发布前请确认音乐授权。
