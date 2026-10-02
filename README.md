| 所属 | 进度 | 描述 |
| :-:  |:-:|  -  |
| Home | √ |  |
| Post | . | 评论区重做 |
| Twit | . | 表情 |
|      | √ | 滚动刷新 |
|      | √ | 匿名发送 |
| Play | . | 整理 |
|      | . | Bug Report |
| Prof | . | 偏好设置 |
|      | √ | 登出 |
| Cate | . | 鉴权，普通用户不给修改界面 |
| Edit | . | 重复上传文件(fileMessage) |
| Glob | √ | 捕获 Unauthorize Error 还原登录状态，buggy |
|      | √ | 移动端适配 |
|      | √ | 通知，定时消失，可点击 |
|      | √ | 按钮（进度） |
|      | √ | thumbnail |
|      | √ | 进度条 |

3.3.0 [22.02.25]
- 禁止回复带图片
- 修复了网络错误报错
- 底部导航位置上移，文案修改
- 打开页面时获取登录态，免登
- server改用config
- 图片预览
- 随机用户名

## Gemini 代理

项目根目录的 `proxy-rules.json` 随 Git 部署，配置 `generativelanguage.googleapis.com` 使用 `http://127.0.0.1:7890`。本机和服务器分别需要在自己的 7890 端口提供 HTTP 代理；`127.0.0.1` 始终指运行后端的机器，无需设置 `GEMINI_PROXY_URL`。规则由后端启动时加载，修改后需重启后端。其他目标地址仍使用原来的直连 dispatcher；豆瓣搜索使用 Axios，不受此规则影响。