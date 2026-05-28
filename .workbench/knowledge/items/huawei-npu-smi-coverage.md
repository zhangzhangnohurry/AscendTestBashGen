# Huawei npu-smi 拆分覆盖报告

来源：`.workbench/knowledge/items/huawei-edoc1100569818.md` 与 `.workbench/tmp/huawei-edoc1100569818-catalogue-items.tsv`。

范围：Atlas 350 加速卡 25.7.RC1 `npu-smi` 命令参考 01。以下覆盖表按 catalogue 的 `partNo/命令标题` 列出归属文件；`j001`/`j002` 是文档前言/用户必读，没有独立命令，归入全局背景。

| partNo | 命令标题 | 归属拆分文件 |
| --- | --- | --- |
| `j001` | 前言 | `huawei-npu-smi-global-discovery.md` |
| `j002` | 用户必读 | `huawei-npu-smi-global-discovery.md` |
| `j003` | Ascend HDK接口和命令工具简介 | `huawei-npu-smi-global-discovery.md` |
| `j004` | npu-smi工具使用导读 | `huawei-npu-smi-global-discovery.md` |
| `j005` | 查询帮助 | `huawei-npu-smi-global-discovery.md` |
| `j006` | 查询npu-smi工具版本 | `huawei-npu-smi-global-discovery.md` |
| `j007` | 信息查询（info） | `huawei-npu-smi-global-discovery.md` |
| `j008` | 信息查询帮助 | `huawei-npu-smi-global-discovery.md` |
| `j009` | 查询基本信息 | `huawei-npu-smi-global-discovery.md` |
| `j00a` | 查询设备映射关系信息 | `huawei-npu-smi-global-discovery.md` |
| `j00b` | 查询所有NPU设备 | `huawei-npu-smi-global-discovery.md` |
| `j00c` | 查询NPU的详细信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00d` | 查询设备常用信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00e` | 查询设备闪存信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00f` | 查询设备内存信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00g` | 查询设备监测数据 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00h` | 查询设备统计信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00i` | 查询设备温度 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00j` | 查询设备功率 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00k` | 查询设备电压 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00l` | 查询设备健康状态 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00m` | 查询设备告警信息 | `huawei-npu-smi-ecc-fault-output.md` |
| `j00n` | 查询设备ECC错误计数 | `huawei-npu-smi-ecc-fault-output.md` |
| `j00o` | 查询设备ECC使能状态 | `huawei-npu-smi-ecc-fault-output.md` |
| `j00p` | 查询设备传感器信息 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00q` | 查询设备系统时间 | `huawei-npu-smi-info-health-telemetry-output.md` |
| `j00r` | 查询KMSAgent进程的服务状态 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00s` | 查询设备进程占用内存 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00t` | 查询指定物理ID对应的NPU ID、Slot ID和Chip ID信息 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00u` | 查询多NPU的拓扑结构 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00v` | 查询设备超节点信息 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00w` | 查询设备die间SIO状态 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00x` | 查询日志落盘持久化配置信息 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j00y` | 查询设备的PCIe误码计数 | `huawei-npu-smi-ecc-fault-output.md` |
| `j00z` | 设置功能（set） | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j010` | 设置功能帮助 | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j011` | 复位NPU | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j012` | 清除设备ECC错误计数 | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j013` | 设置KMSAgent进程的服务状态 | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j014` | 设置日志落盘持久化功能开关模式 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j015` | 设置持续收集所有设备的日志 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j016` | 设置结束日志进程并清除配置 | `huawei-npu-smi-syslog-process-topology-output.md` |
| `j017` | 升级功能（upgrade） | `huawei-npu-smi-firmware-upgrade.md` |
| `j018` | 升级功能帮助 | `huawei-npu-smi-firmware-upgrade.md` |
| `j019` | 查询固件版本信息 | `huawei-npu-smi-firmware-upgrade.md` |
| `j01a` | 升级固件 | `huawei-npu-smi-firmware-upgrade.md` |
| `j01b` | 清除功能（clear） | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j01c` | 清除功能帮助 | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j01d` | 清除设备的ECC错误计数 | `huawei-npu-smi-set-reset-clear-risk.md` |
| `j01e` | 证书管理 | `huawei-npu-smi-tls-certificate.md` |
| `j01f` | 获取CSR | `huawei-npu-smi-tls-certificate.md` |
| `j01g` | 预置/更新TLS证书 | `huawei-npu-smi-tls-certificate.md` |
| `j01h` | 查询证书信息 | `huawei-npu-smi-tls-certificate.md` |
| `j01i` | 查询证书过期阈值 | `huawei-npu-smi-tls-certificate.md` |
| `j01j` | 设置证书过期阈值 | `huawei-npu-smi-tls-certificate.md` |
| `j01k` | 恢复证书默认过期阈值 | `huawei-npu-smi-tls-certificate.md` |

## 拆分原则落实

- 只读发现/信息查询与变更类命令拆开，避免一次命中带入 reset、clear、upgrade、证书导入等高风险命令。
- 输出字段和校验线索优先于命令模板；命令模板只保留必要参数和范围。
- `sys-log-*` 因共享配置状态、持久化和容量估算，集中到 syslog/进程/拓扑文件。
- ECC 查询与 ECC 清除拆开：查询归入 `huawei-npu-smi-ecc-fault-output.md`，清除归入 `huawei-npu-smi-set-reset-clear-risk.md`。
