# threejs_scene

这是一个独立的 Three.js 小型场景查看器，适合拿来做这些事：

- 加载本地 `glb / gltf`
- 加载本地 `hdr`
- 查看对象层级
- 隐藏或显示对象
- 选中对象并拖动位置
- 查看和替换材质类型
- 调整常见材质参数

## 目录说明

- `index.html`
  - 页面结构和界面样式
- `main.js`
  - Three.js 场景、灯光、模型加载、材质面板逻辑
- `assets/`
  - 示例模型和 HDR 资源
- `123.max`
  - 测试用 3ds Max 文件
- `ceshi直接导出.glb`
  - 3ds Max 直接导出的测试文件
- `巴比伦导出.glb`
  - Babylon 导出的测试文件

## 怎么打开

不要直接双击 `index.html`，因为浏览器用 `file://` 打开时，常常会拦截模型和 HDR 资源加载。

推荐在项目目录里启动一个本地静态服务器，比如：

```powershell
npx vite
```

然后打开终端里显示的地址，例如：

```text
http://127.0.0.1:5173/
```

如果你电脑上没有 `vite`，也可以用：

```powershell
python -m http.server 5173
```

然后打开：

```text
http://127.0.0.1:5173/
```

## 当前功能

- 默认尝试加载 `assets/scene.glb`
- 默认尝试加载 `assets/studio_small_09_4k.hdr`
- 可以切换查看 `scene.glb` 和 `tea.glb`
- 可以手动选择本地 GLB
- 可以手动选择本地 HDR
- 可以在右侧标签页里查看对象、材质、基础信息
- 可以把材质切换成 Three.js 预制材质或自定义 Shader

## 关于导出测试

这个仓库里保留了两份导出结果，方便你对比：

- `ceshi直接导出.glb`
  - 3ds Max 直接导出
  - 这份测试里材质退成了 `fallback Material`
  - 基础颜色是黑色
  - 也没有 `TEXCOORD_0`
- `巴比伦导出.glb`
  - Babylon 导出
  - 带正常的 PBR 颜色参数
  - 带 `TEXCOORD_0`

如果你后面要继续研究导出链路，这两份文件很适合当对照样本。
