# Huawei npu-smi: syslog、进程、物理映射、拓扑与 SIO 输出

适用场景：查询 KMSAgent 服务状态、NPU 进程内存、物理 ID 到逻辑 ID 映射、多 NPU 拓扑、超节点能力、die 间 SIO、日志落盘配置，并生成日志落盘相关维护命令。

用于校验的关键输出字段：`service auto startup`、`service running status`、`Process id`、`Process name`、`Process memory(MB)`、`Chip Phy-ID`、`NPU ID`、`Slot ID`、`Chip ID`、`CPU Affinity`、拓扑矩阵中的 `X`/`SYS`、`This device does not support querying spod-info.`、`TX Error Count`、`RX Error Count`、`Current syslog dump config recover mode`、`Current syslog dump config gear`、`Current syslog dump config path`、`Set syslog mode success`、`Start exporting logs`、`Clear syslog config success`。

命令生成注意事项：`sys-log-dump` 的路径必须已存在、是绝对路径，且当前用户具备读/写/执行权限；`level` 是 `1..10`；启用日志落盘持久化会跨系统重启恢复；如果配置被恶意修改，先生成 `npu-smi set -t clear-syslog-cfg` 恢复默认配置并结束相关日志进程。

## 覆盖 partNo

- `j00r` 查询KMSAgent进程的服务状态
- `j00s` 查询设备进程占用内存
- `j00t` 查询指定物理ID对应的NPU ID、Slot ID和Chip ID信息
- `j00u` 查询多NPU的拓扑结构
- `j00v` 查询设备超节点信息
- `j00w` 查询设备die间SIO状态
- `j00x` 查询日志落盘持久化配置信息
- `j014` 设置日志落盘持久化功能开关模式
- `j015` 设置持续收集所有设备的日志
- `j016` 设置结束日志进程并清除配置

## 查询命令与输出锚点

| 目的 | 命令模板 | 重点字段/校验线索 |
| --- | --- | --- |
| KMSAgent 服务状态 | `npu-smi info -t key-manage` | `service auto startup`、`service running status`，常见值如 `Disable`/`Stop`。 |
| 进程内存 | `npu-smi info -t proc-mem -i dev_id` | `Process id`、`Process name`、`Process memory(MB)`；无进程时按实际空结果处理。 |
| 物理 ID 反查 | `npu-smi info -t phyid-remap -p phy_id` | `Chip Phy-ID`、`NPU ID`、`Slot ID`、`Chip ID`。 |
| 多 NPU 拓扑 | `npu-smi info -t topo` | 表头包含 `NPU0...NPU7` 和 `CPU Affinity`；矩阵值如 `X`、`SYS`。 |
| 超节点信息 | `npu-smi info -t spod-info -i dev_id` | 不支持设备可能返回 `This device does not support querying spod-info.`。 |
| die 间 SIO | `npu-smi info -t sio-info -i dev_id` | `TX Error Count`、`RX Error Count`。 |
| syslog 配置 | `npu-smi info -t sys-log-info` | `Current syslog dump config recover mode`、`Current syslog dump config gear`、`Current syslog dump config path`。 |

## syslog 变更命令

| 目的 | 命令模板 | 重点约束/校验线索 |
| --- | --- | --- |
| 设置持久化开关 | `npu-smi set -t sys-log-enable -d mode` | `mode` 为 `0` 或 `1`，默认 `0`；`1` 启用，`0` 关闭；输出可含 `Set syslog mode success, mode = 1`。 |
| 持续收集所有设备日志 | `npu-smi set -t sys-log-dump -s level -f path` | `level` 为 `1..10`；`path` 必须是已存在绝对路径；命令会提示确认并启动持续日志进程；输出可含 `Start exporting logs and files to path`。 |
| 结束日志进程并清除配置 | `npu-smi set -t clear-syslog-cfg` | 输出可含 `Clear syslog config success.`；会结束所有持续日志收集进程并清除配置。 |

## syslog 容量估算

- 当前时间戳日志：level 1 约 `100 MB/NPU`，每升一级增加约 `100 MB/NPU`。
- 历史时间戳日志：level 1 约 `200 MB/NPU`，每升一级增加约 `200 MB/NPU`，最多保留 99 个历史时间戳文件。
- 总估算：`required_space ~= device_count * level * 300 MB`。
- 驱动升级或覆盖安装期间，持续日志收集会先关闭，完成后自动重新打开。
