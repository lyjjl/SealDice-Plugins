## 🚀 QzoneAPI

这是一个 QQ 空间 API 客户端。它主要负责处理与 QQ 空间服务器的交互，包括 HTTP 请求、Cookie 管理、`g_tk` 生成以及响应数据的解析。

### 核心功能

<details><summary>警告:该部分由AI整理生成</summary>
<p>

* **Cookie 和 G\_TK 管理**:
    * `QzoneAPI` 类在初始化时接收一个包含登录信息的 `cookies_dict`。
    * `generate_gtk(skey)` 辅助函数用于根据 `p_skey` 计算 QQ 空间请求所需的 `g_tk`（或在代码中称为 `gtk2`）。
* **网络请求**:
    * `do` 方法,发送带有预设 Cookie 的 POST/GET 请求到 QQ 空间的不同 CGI 接口。
* **说说发布**:
    * `upload_image` 方法：负责将图片的二进制数据转换为 Base64 格式，并上传到 QQ 空间图片服务器，返回上传结果。
    * `get_picbo_and_richval` 辅助函数：从图片上传结果中提取发表说说所需的 `picbo` 和 `richval` 参数。
    * `publish_emotion` 方法：发表说说的核心方法，支持文本内容和图片列表。它会先上传所有图片，然后将生成的 `picbo` 和 `richval` 与文本内容一起提交。
* **互动操作**:
    * `like` 方法：用于对指定的说说动态进行点赞。
    * `comment` 方法：用于对指定的说说进行评论。
    * `reply` 方法：用于回复评论。它通过在评论内容中 `@目标昵称` 来实现回复，而不是使用子评论 API。
* **说说列表获取与解析**:
    * `get_list` 方法：获取**好友**的说说动态列表（最新说说）。它会过滤掉当前 QQ 账号已评论过的说说（除非是自己的说说），并尝试获取图片描述。
    * `monitor_get_list` 方法：获取**自己的**好友动态列表。它通过解析 HTML 响应来提取说说内容、图片、视频和评论，并能区分自己的说说。
    * `get_send_history` 方法：获取自己最近发送的说说历史记录，并格式化成易于阅读的字符串。
* **数据解析**:
    * `extract_code_json` 和 `extract_code_html` 辅助函数：用于从 JSON 或 HTML 响应中提取 QQ 空间 API 返回的 `code`（状态码）以判断操作是否成功。

</p>
</details> 

-----

## 💻 QzoneAPI TODO List

### ⚙️ 辅助函数

* [ ] **TODO**: 实现 `generateGtk(skey)` 函数。
* [ ] **TODO**: 实现 `getPicboAndRichval(uploadResult)` 函数。
* [ ] **TODO**: 实现 `extractCodeHtml(htmlContent)` 函数，使用 `cheerio` 替代 `bs4` 来解析 HTML 中的脚本标签。
* [ ] **TODO**: 实现 `extractCodeJson(jsonResponse)` 函数。
* [ ] **TODO**: 实现 `imageToBase64(imageBuffer)` 函数。

### 🚀 QzoneAPI Class

* [ ] **TODO**: 实现异步方法 `do(method, url, params, data, headers, cookies, timeout)`。
* [ ] **TODO**: 实现异步方法 `getImageBase64ByUrl(url)`。
* [ ] **TODO**: 实现异步方法 `uploadImage(imageBuffer)`。
* [ ] **TODO**: 实现异步方法 `publishEmotion(content, images)`。
* [ ] **TODO**: 实现异步方法 `like(fid, targetQq)`。
* [ ] **TODO**: 实现异步方法 `comment(fid, targetQq, content)`。
* [ ] **TODO**: 实现异步方法 `reply(fid, targetQq, targetNickname, content, commentTid)`。
* [ ] **TODO**: 实现异步方法 `getList(targetQq, num)` (获取好友说说)。
* [ ] **TODO**: 实现异步方法 `monitorGetList(selfReadnum)` (获取自己的好友动态)。
* [ ] **TODO**: 实现异步方法 `getSendHistory(num)`。


