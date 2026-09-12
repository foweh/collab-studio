# 剪映智能剪辑（CapCut Mate）API 汇总

> 来源：[技术栈 - 剪映智能剪辑API汇总](https://jishuzhan.net/article/1996132380256567297)  
> 作者：Hommy88 | 日期：2025-12-03  
> 开源项目：[GitHub - jcaigc/capcut-mate](https://github.com/jcaigc/capcut-mate)  
> 官网：[jcaigc.cn](https://jcaigc.cn)

---

## 目录

1. [基础草稿操作](#1-基础草稿操作)
2. [素材添加接口](#2-素材添加接口)
3. [效果增强接口](#3-效果增强接口)
4. [字幕与文本接口](#4-字幕与文本接口)
5. [动画与特效接口](#5-动画与特效接口)
6. [视频生成接口](#6-视频生成接口)
7. [辅助工具接口](#7-辅助工具接口)

---

## 1. 基础草稿操作

### 1.1 创建草稿

```
POST /openapi/capcut-mate/v1/create_draft
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `width` | number | ❌ | 1920 | 视频宽度（像素），≥1 |
| `height` | number | ❌ | 1080 | 视频高度（像素），≥1 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 新创建的草稿 URL，用于后续编辑操作 |
| `tip_url` | string | 草稿使用帮助文档 URL |

---

### 1.2 保存草稿

```
POST /openapi/capcut-mate/v1/save_draft
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 要保存的草稿 URL |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 保存后的草稿 URL（通常与请求中相同） |

---

### 1.3 获取草稿

```
GET /openapi/capcut-mate/v1/get_draft
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_id` | string | ✅ | - | 草稿 ID，长度 20-32 位字符 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `files` | array | 草稿相关的文件列表 |

---

## 2. 素材添加接口

### 2.1 添加视频

```
POST /openapi/capcut-mate/v1/add_videos
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `video_infos` | string | ✅ | - | 视频信息数组的 JSON 字符串 |
| `alpha` | number | ❌ | 1.0 | 全局透明度（0-1） |
| `scale_x` | number | ❌ | 1.0 | X 轴缩放比例 |
| `scale_y` | number | ❌ | 1.0 | Y 轴缩放比例 |
| `transform_x` | number | ❌ | 0 | X 轴位置偏移（像素） |
| `transform_y` | number | ❌ | 0 | Y 轴位置偏移（像素） |

**`video_infos` 数组结构**

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `video_url` | string | ✅ | - | 视频文件的 URL 地址 |
| `width` | number | ✅ | - | 视频宽度（像素） |
| `height` | number | ✅ | - | 视频高度（像素） |
| `start` | number | ✅ | - | 视频开始播放时间（微秒） |
| `end` | number | ✅ | - | 视频结束播放时间（微秒） |
| `duration` | number | ✅ | - | 视频总时长（微秒） |
| `mask` | string | ❌ | - | 遮罩类型 |
| `transition` | string | ❌ | - | 转场效果名称 |
| `transition_duration` | number | ❌ | 500000 | 转场持续时间（微秒） |
| `volume` | number | ❌ | 1.0 | 音量大小（0-1） |

---

### 2.2 添加图片

```
POST /openapi/capcut-mate/v1/add_images
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `image_infos` | string | ✅ | - | 图片信息数组的 JSON 字符串 |
| `alpha` | number | ❌ | 1.0 | 图片透明度（0.0-1.0） |
| `scale_x` | number | ❌ | 1.0 | 图片 X 轴缩放比例 |
| `scale_y` | number | ❌ | 1.0 | 图片 Y 轴缩放比例 |
| `transform_x` | number | ❌ | 0 | X 轴位置偏移（像素） |
| `transform_y` | number | ❌ | 0 | Y 轴位置偏移（像素） |

**`image_infos` 数组结构**

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `image_url` | string | ✅ | - | 图片文件的 URL 地址 |
| `width` | number | ✅ | - | 图片宽度（像素） |
| `height` | number | ✅ | - | 图片高度（像素） |
| `start` | number | ✅ | - | 图片开始显示时间（微秒） |
| `end` | number | ✅ | - | 图片结束显示时间（微秒） |

---

### 2.3 添加音频

```
POST /openapi/capcut-mate/v1/add_audios
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `audio_infos` | string | ✅ | - | 音频信息数组的 JSON 字符串 |

**`audio_infos` 数组结构**

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `audio_url` | string | ✅ | - | 音频文件的 URL 地址 |
| `start` | number | ✅ | - | 音频开始播放时间（微秒） |
| `end` | number | ✅ | - | 音频结束播放时间（微秒） |
| `duration` | number | ✅ | - | 音频总时长（微秒） |
| `volume` | number | ❌ | 1.0 | 音量大小（0.0-2.0） |
| `audio_effect` | string | ❌ | None | 音频效果名称 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 更新后的草稿 URL |
| `track_id` | string | 音频轨道 ID |
| `audio_ids` | array | 添加的音频 ID 列表 |

---

## 3. 效果增强接口

### 3.1 添加特效

```
POST /openapi/capcut-mate/v1/add_effects
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `effect_infos` | string | ✅ | - | 特效信息列表的 JSON 字符串 |

**`effect_infos` 数组结构**

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `effect_title` | string | ✅ | - | 特效名称/标题 |
| `start` | number | ✅ | - | 特效开始时间（微秒） |
| `end` | number | ✅ | - | 特效结束时间（微秒） |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 更新后的草稿 URL |
| `track_id` | string | 特效轨道 ID |
| `effect_ids` | array | 添加的特效 ID 列表 |
| `segment_ids` | array | 创建的特效片段 ID 列表 |

---

### 3.2 添加贴纸

```
POST /openapi/capcut-mate/v1/add_sticker
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `sticker_id` | string | ✅ | - | 贴纸的唯一标识 ID |
| `start` | number | ✅ | - | 贴纸开始时间（微秒） |
| `end` | number | ✅ | - | 贴纸结束时间（微秒） |
| `scale` | number | ❌ | 1.0 | 贴纸缩放比例（0.1-5.0） |
| `transform_x` | number | ❌ | 0 | X 轴位置偏移（像素） |
| `transform_y` | number | ❌ | 0 | Y 轴位置偏移（像素） |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 更新后的草稿 URL |
| `sticker_id` | string | 贴纸的唯一标识 ID |
| `track_id` | string | 贴纸轨道 ID |
| `segment_id` | string | 创建的贴纸片段 ID |
| `duration` | number | 贴纸显示时长（微秒） |

---

### 3.3 添加关键帧

```
POST /openapi/capcut-mate/v1/add_keyframes
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `keyframes` | string | ✅ | - | 关键帧信息列表的 JSON 字符串 |

**`keyframes` 数组结构**

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `segment_id` | string | ✅ | 目标片段的唯一标识 ID |
| `property` | string | ✅ | 动画属性类型 |
| `offset` | number | ✅ | 关键帧在片段中的时间偏移（0-1） |
| `value` | number | ✅ | 属性在该时间点的值 |

**支持的动画属性类型**

| 属性类型 | 描述 | 值范围 |
|----------|------|--------|
| `KFTypePositionX` | X 轴位置 | -1.0 ~ 1.0 |
| `KFTypePositionY` | Y 轴位置 | -1.0 ~ 1.0 |
| `KFTypeScaleX` | X 轴缩放 | 0.1 ~ 10.0 |
| `KFTypeScaleY` | Y 轴缩放 | 0.1 ~ 10.0 |
| `KFTypeRotation` | 旋转角度 | -360 ~ 360 |
| `KFTypeAlpha` | 透明度 | 0.0 ~ 1.0 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 更新后的草稿 URL |
| `keyframes_added` | integer | 添加的关键帧数量 |
| `affected_segments` | array | 受影响的片段 ID 列表 |

---

### 3.4 添加遮罩

```
POST /openapi/capcut-mate/v1/add_masks
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `segment_ids` | array | ✅ | `[]` | 要应用遮罩的片段 ID 数组 |
| `name` | string | ❌ | `"线性"` | 遮罩类型名称 |
| `X` | integer | ❌ | 0 | 遮罩中心 X 坐标（像素） |
| `Y` | integer | ❌ | 0 | 遮罩中心 Y 坐标（像素） |
| `width` | integer | ❌ | 512 | 遮罩宽度（像素） |
| `height` | integer | ❌ | 512 | 遮罩高度（像素） |
| `feather` | integer | ❌ | 0 | 羽化程度（0-100） |
| `rotation` | integer | ❌ | 0 | 旋转角度（度） |
| `invert` | boolean | ❌ | false | 是否反转遮罩 |
| `roundCorner` | integer | ❌ | 0 | 圆角半径（0-100） |

---

## 4. 字幕与文本接口

### 4.1 添加字幕

```
POST /openapi/capcut-mate/v1/add_captions
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `captions` | string | ✅ | - | 字幕信息列表的 JSON 字符串 |
| `text_color` | string | ❌ | `"#ffffff"` | 文本颜色（十六进制） |
| `border_color` | string | ❌ | null | 边框颜色（十六进制） |
| `alignment` | integer | ❌ | 1 | 文本对齐方式（0-5） |
| `alpha` | number | ❌ | 1.0 | 文本透明度（0.0-1.0） |
| `font` | string | ❌ | null | 字体名称 |
| `font_size` | integer | ❌ | 15 | 字体大小 |
| `letter_spacing` | number | ❌ | null | 字间距 |
| `line_spacing` | number | ❌ | null | 行间距 |
| `scale_x` | number | ❌ | 1.0 | 水平缩放比例 |
| `scale_y` | number | ❌ | 1.0 | 垂直缩放比例 |
| `transform_x` | integer | ❌ | 0 | X 轴位置偏移（像素） |
| `transform_y` | integer | ❌ | 0 | Y 轴位置偏移（像素） |
| `style_text` | boolean | ❌ | false | 是否使用样式文本 |

**`captions` 数组结构**

| 字段名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `start` | integer | ✅ | - | 字幕开始时间（微秒） |
| `end` | integer | ✅ | - | 字幕结束时间（微秒） |
| `text` | string | ✅ | - | 字幕文本内容 |
| `keyword` | string | ❌ | null | 关键词（用 `|` 分隔多个关键词） |
| `keyword_color` | string | ❌ | `"#ff7100"` | 关键词颜色 |
| `keyword_font_size` | integer | ❌ | 15 | 关键词字体大小 |
| `font_size` | integer | ❌ | 15 | 文本字体大小 |
| `in_animation` | string | ❌ | null | 入场动画 |
| `out_animation` | string | ❌ | null | 出场动画 |
| `loop_animation` | string | ❌ | null | 循环动画 |
| `in_animation_duration` | integer | ❌ | null | 入场动画时长 |
| `out_animation_duration` | integer | ❌ | null | 出场动画时长 |
| `loop_animation_duration` | integer | ❌ | null | 循环动画时长 |

---

### 4.2 添加文本样式

```
POST /openapi/capcut-mate/v1/add_text_style
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `text` | string | ✅ | - | 要处理的文本内容 |
| `keyword` | string | ✅ | - | 关键词，多个用 `|` 分隔 |
| `font_size` | number | ❌ | 12 | 普通文本的字体大小 |
| `keyword_color` | string | ❌ | `"#ff7100"` | 关键词文本颜色（十六进制） |
| `keyword_font_size` | number | ❌ | 15 | 关键词字体大小 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `text_style` | string | 文本样式 JSON 字符串，包含 `styles` 数组和 `text` 字段 |

---

## 5. 动画与特效接口

### 5.1 获取文本动画列表

```
POST /openapi/capcut-mate/v1/get_text_animations
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `mode` | integer | ❌ | 0 | 动画模式：`0` = 所有，`1` = VIP，`2` = 免费 |
| `type` | string | ✅ | - | 动画类型：`in` = 入场，`out` = 出场，`loop` = 循环 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `effects` | array | 文本动画对象数组 |

**动画对象字段说明**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `resource_id` | string | 动画资源 ID |
| `type` | string | 动画类型 |
| `category_id` | string | 分类 ID |
| `category_name` | string | 分类名称 |
| `duration` | number | 动画时长（微秒） |
| `id` | string | 动画 ID |
| `name` | string | 动画名称 |
| `icon_url` | string | 动画图标 URL |

---

### 5.2 获取图片动画列表

```
POST /openapi/capcut-mate/v1/get_image_animations
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `mode` | integer | ❌ | 0 | 动画模式：`0` = 所有，`1` = VIP，`2` = 免费 |
| `type` | string | ✅ | - | 动画类型：`in` = 入场，`out` = 出场，`loop` = 循环 |

**响应参数**（与文本动画一致）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `effects` | array | 图片动画对象数组 |

---

## 6. 视频生成接口

### 6.1 生成视频

```
POST /openapi/capcut-mate/v1/gen_video
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `message` | string | 响应消息 |

---

### 6.2 查询视频生成状态

```
POST /openapi/capcut-mate/v1/gen_video_status
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 草稿 URL，与提交任务时使用的 URL 相同 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `draft_url` | string | 草稿 URL |
| `status` | string | 任务状态：`pending` / `processing` / `completed` / `failed` |
| `progress` | number | 进度百分比 |
| `video_url` | string | 生成的视频 URL（完成时返回） |
| `error_message` | string | 错误信息（失败时返回） |
| `created_at` | string | 任务创建时间 |
| `started_at` | string | 任务开始时间 |
| `completed_at` | string | 任务完成时间 |

---

## 7. 辅助工具接口

### 7.1 获取音频时长

```
POST /openapi/capcut-mate/v1/get_audio_duration
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `mp3_url` | string | ✅ | - | 音频文件 URL，支持 mp3、wav、m4a 等常见格式 |

**响应参数**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `duration` | number | 音频时长，单位：微秒 |

---

### 7.2 简易创建素材

```
POST /openapi/capcut-mate/v1/easy_create_material
```

**请求参数**

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `draft_url` | string | ✅ | - | 目标草稿的完整 URL |
| `audio_url` | string | ✅ | - | 音频文件 URL（不能为空） |
| `text` | string | ❌ | null | 要添加的文字内容 |
| `img_url` | string | ❌ | null | 图片文件 URL |
| `video_url` | string | ❌ | null | 视频文件 URL |
| `text_color` | string | ❌ | `"#ffffff"` | 文字颜色（十六进制） |
| `font_size` | integer | ❌ | 15 | 字体大小 |
| `text_transform_y` | integer | ❌ | 0 | 文字 Y 轴位置偏移 |

---

## 接口总览

| 分类 | 接口 | 方法 | 说明 |
|------|------|------|------|
| 基础草稿 | `/create_draft` | POST | 创建新草稿 |
| 基础草稿 | `/save_draft` | POST | 保存草稿 |
| 基础草稿 | `/get_draft` | GET | 获取草稿信息 |
| 素材添加 | `/add_videos` | POST | 添加视频素材 |
| 素材添加 | `/add_images` | POST | 添加图片素材 |
| 素材添加 | `/add_audios` | POST | 添加音频素材 |
| 效果增强 | `/add_effects` | POST | 添加视频特效 |
| 效果增强 | `/add_sticker` | POST | 添加贴纸 |
| 效果增强 | `/add_keyframes` | POST | 添加关键帧动画 |
| 效果增强 | `/add_masks` | POST | 添加遮罩 |
| 字幕文本 | `/add_captions` | POST | 添加字幕 |
| 字幕文本 | `/add_text_style` | POST | 添加文本样式（高亮关键词） |
| 动画特效 | `/get_text_animations` | POST | 获取可用文本动画列表 |
| 动画特效 | `/get_image_animations` | POST | 获取可用图片动画列表 |
| 视频生成 | `/gen_video` | POST | 提交视频生成任务 |
| 视频生成 | `/gen_video_status` | POST | 查询生成进度/结果 |
| 辅助工具 | `/get_audio_duration` | POST | 获取音频时长 |
| 辅助工具 | `/easy_create_material` | POST | 一键创建素材（音频+文字+图片+视频） |

---

## 通用约定

- **时间单位**：所有时间参数统一使用**微秒**（1 秒 = 1,000,000 微秒）
- **基础路径**：所有接口以 `/openapi/capcut-mate/v1/` 为前缀
- **坐标系统**：位置偏移单位为像素，透明度范围为 0.0-1.0
- **草稿 URL**：贯穿整个工作流的核心标识，创建草稿后获得，后续所有编辑操作都依赖此 URL
- **生成状态机**：`pending` → `processing` → `completed` / `failed`

## 相关资源

- **开源仓库**：[GitHub - jcaigc/capcut-mate](https://github.com/jcaigc/capcut-mate)
- **官方网站**：[jcaigc.cn](https://jcaigc.cn)
