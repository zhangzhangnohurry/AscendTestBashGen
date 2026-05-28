# 样例：登录物理机使用 SSH

## 适用场景

原文表达需要登录物理机器、登录宿主机、登录 host 侧，或者明确写到“root 用户登录物理机器”等远程主机登录动作。

## 要求

这类步骤可以生成显式 SSH 登录命令。真实主机地址来自生成上下文中的 `execution.remote.host`；如果原文明确了用户，例如 root 用户，则优先使用原文用户；否则使用 `execution.remote.username`。

## 推荐写法

当原文为“root用户登陆物理机器”且 `execution.remote.host` 已配置时：

```bash
ssh root@$remote_host
```

其中 `$remote_host` 应替换为 `execution.remote.host` 的值，例如：

```bash
ssh root@192.168.1.10
```

当原文没有明确用户但远程配置中存在 username 时：

```bash
ssh $remote_user@$remote_host
```

## 注意

不要把密码写入生成命令。密码认证由运行环境或 SSH 工具链处理。
