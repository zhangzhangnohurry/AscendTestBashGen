# Huawei npu-smi: set/reset/clear 风险变更命令

适用场景：生成复位 NPU、清除 ECC 计数、设置 KMSAgent 服务状态、查看 set/clear 帮助等会改变设备或服务状态的命令，并在执行前补齐维护窗口和风险校验。

用于校验的关键输出字段：`Usage: npu-smi set`、`Usage: npu-smi clear`、`Status`、`Message`、`resetting ...`、`Set chip clear-ecc-info successfully`、`Clear ecc-info successfully`、KMSAgent 相关 `Status`/`Message` 或服务状态回显。

命令生成注意事项：复位前必须停掉 NPU 上所有业务；ECC 清除是高风险动作，会清除待隔离的片上内存多 bit ECC 故障地址并导致冷隔离失效；清除命令只能清历史累计统计和隔离页统计，设备重启也会自动清 ECC 计数；KMSAgent 开启依赖证书准备，OpenSSL 要求 `>= 3.0.0` 且应使用无已知漏洞版本。

## 覆盖 partNo

- `j00z` 设置功能（set）
- `j010` 设置功能帮助
- `j011` 复位NPU
- `j012` 清除设备ECC错误计数
- `j013` 设置KMSAgent进程的服务状态
- `j01b` 清除功能（clear）
- `j01c` 清除功能帮助
- `j01d` 清除设备的ECC错误计数

## 命令族与输出锚点

| 目的 | 命令模板 | 风险/校验线索 |
| --- | --- | --- |
| set 帮助 | `npu-smi set -h` 或 `npu-smi set --help` | `Usage: npu-smi set <-h|-t type>`；类型含 `reset`、`clear-ecc-info`、`key-manage`、`sys-log-enable`、`sys-log-dump`、`clear-syslog-cfg`。 |
| 复位 NPU | `npu-smi set -t reset -i dev_id [-m 1]` | 不带 `-m 1` 表示带外热复位；带 `-m 1` 表示带内热复位；交互确认后输出可含 `Message : resetting ...` 和 `Status : OK`。 |
| set 清 ECC | `npu-smi set -t clear-ecc-info -i dev_id` | 清除指定芯片历史累计统计及隔离页统计；输出可含 `Status : OK`、`Message : Set chip clear-ecc-info successfully`。 |
| KMSAgent 服务状态设置 | `npu-smi set -t key-manage -s value` | `stop` 表示关闭服务并禁止自启动，且为默认；开启前需完成证书相关准备。 |
| clear 帮助 | `npu-smi clear -h` 或 `npu-smi clear --help` | `Usage: npu-smi clear <-h|-t type>`；类型含 `ecc-info`、`tls-cert-period`。 |
| clear 清 ECC | `npu-smi clear -t ecc-info -i dev_id` | 清除设备所有芯片历史累计统计及隔离页统计；输出可含 `Status : OK`、`Message : Clear ecc-info successfully.`。 |

## 复位风险线索

- 文档要求执行复位前停掉 NPU 上所有业务。
- 复位期间网口状态从 `UP` 到 `DOWN` 再到 `UP`，iBMC 上报网口闪断相关告警后恢复，属于预期现象。
- 自动化脚本应把复位放入显式维护阶段，不能在只读诊断阶段生成。

## KMSAgent 证书前置

- 文档示例在 `/var/kmsagentd` 下生成根 CA 私钥、CSR 和根证书；如果驱动安装在非默认路径，后续命令中的 `/usr/local/Ascend` 要替换为实际安装路径。
- 不要把证书生成命令和 `npu-smi set -t key-manage` 混为一个无条件脚本；先校验 OpenSSL 版本和证书文件存在性。
- 证书内容、私钥和敏感路径不应写入知识库条目或日志。
