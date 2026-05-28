---
id: huawei-hccn-coverage
title: "Huawei hccn_tool 拆分覆盖报告"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 拆分覆盖报告

本报告覆盖原始知识项 `.workbench/knowledge/items/huawei-edoc1100569784.md` 中的 hccn_tool 命令章节，并记录每个 partNo/命令标题归属到哪个拆分文件。`8001` 为根包节点，`j001`~`j004`、`j006`、`j00w`、`j016` 为前言/目录/章节节点，不是独立命令；其全局规则已并入相关知识项。

| partNo | 命令标题 | 归属拆分文件 |
| --- | --- | --- |
| `j005` | 查询hccn_tool帮助提示信息 | `huawei-hccn-global-discovery.md` |
| `j007` | 查询NPU设备信息 | `huawei-hccn-global-discovery.md` |
| `j008` | 查询端口的link状态 | `huawei-hccn-port-link-state.md` |
| `j009` | 查询端口的实时带宽信息 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00a` | 查询端口的相关统计信息 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00b` | 查询端口的状态信息 | `huawei-hccn-port-link-state.md` |
| `j00c` | 查询端口的峰值带宽信息 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00d` | 查询端口的误码数信息 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00e` | 查询端口的芯片可用信用证数量 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00f` | 查询端口的速率信息 | `huawei-hccn-port-link-state.md` |
| `j00g` | 查询端口的SerDes信息 | `huawei-hccn-port-link-state.md` |
| `j00h` | 查询端口的FEC信息 | `huawei-hccn-port-link-state.md` |
| `j00i` | 查询端口的历史建链流程的状态信息 | `huawei-hccn-port-link-state.md` |
| `j00j` | 查询端口的历史link up和down状态信息 | `huawei-hccn-port-link-state.md` |
| `j00k` | 查询端口的link down时链路相关信息 | `huawei-hccn-port-link-state.md` |
| `j00l` | 查询端口的SU误码模式和误码统计结果 | `huawei-hccn-bandwidth-statistics-errors.md` |
| `j00m` | 查询NPU设备的互连或断开状态信息 | `huawei-hccn-global-discovery.md` |
| `j00n` | 查询NPU设备的vNIC IP及link状态 | `huawei-hccn-global-discovery.md` |
| `j00o` | 查询NPU设备的DRV驱动包和固件版本号信息 | `huawei-hccn-global-discovery.md` |
| `j00p` | 查询NPU设备的TLS证书信息 | `huawei-hccn-tls-config-recovery.md` |
| `j00q` | 查询NPU设备的Device侧进程信息 | `huawei-hccn-global-discovery.md` |
| `j00r` | 查询NPU设备的配置恢复状态信息 | `huawei-hccn-tls-config-recovery.md` |
| `j00s` | 查询网络设备的AEQ context信息 | `huawei-hccn-network-resource-context.md` |
| `j00t` | 查询网络设备的CEQ context信息 | `huawei-hccn-network-resource-context.md` |
| `j00u` | 查询网络设备的队列相关资源列表信息 | `huawei-hccn-network-resource-context.md` |
| `j00v` | 查询网络设备的队列相关资源属性信息 | `huawei-hccn-network-resource-context.md` |
| `j00x` | 清除端口的相关统计信息 | `huawei-hccn-destructive-test-ops.md` |
| `j00y` | 设置端口升lane | `huawei-hccn-destructive-test-ops.md` |
| `j00z` | 清除端口的SU误码统计 | `huawei-hccn-destructive-test-ops.md` |
| `j010` | 替换NPU设备的TLS证书 | `huawei-hccn-tls-config-recovery.md` |
| `j011` | 设置NPU设备的TLS开关状态 | `huawei-hccn-tls-config-recovery.md` |
| `j012` | 设置NPU设备的TLS过期告警阈值 | `huawei-hccn-tls-config-recovery.md` |
| `j013` | 清除NPU设备的TLS证书信息 | `huawei-hccn-tls-config-recovery.md` |
| `j014` | 恢复NPU设备的配置 | `huawei-hccn-tls-config-recovery.md` |
| `j015` | 恢复所有NPU设备的配置 | `huawei-hccn-tls-config-recovery.md` |
| `j017` | 导出端口的寄存器信息 | `huawei-hccn-destructive-test-ops.md` |
| `j018` | 设置端口的SU误码模式 | `huawei-hccn-destructive-test-ops.md` |
| `j019` | 查询指定NPU设备到目的地址的UB ping结果 | `huawei-hccn-destructive-test-ops.md` |

## 非命令节点处理

| partNo | 标题 | 处理 |
| --- | --- | --- |
| `8001` | 根包节点 | 非正文命令节点，未拆成独立知识项 |
| `j001` | 前言 | 文档元信息并入各拆分文件 front matter |
| `j002` | 用户必读 | 工具使用约束并入 `huawei-hccn-global-discovery.md` 与相关命令族 |
| `j003` | Ascend HDK接口和命令工具简介 | 工具定位并入全局发现知识项 |
| `j004` | hccn_tool工具使用导读 | 安装路径、容器挂载、串行执行等规则并入全局发现知识项 |
| `j006` | 查询类命令 | 章节节点，命令已逐项归属 |
| `j00w` | 设置类命令 | 章节节点，命令已逐项归属 |
| `j016` | 测试类命令 | 章节节点，命令已逐项归属 |
