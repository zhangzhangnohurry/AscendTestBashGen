# Huawei npu-smi: 全局规则与发现命令

适用场景：在生成任何 Atlas 350 / Ascend 950 代 npu-smi 脚本前，先确认工具可用性、版本、帮助入口、设备枚举、逻辑 ID/物理 ID/Slot/Chip 映射，以及容器/用户场景支持边界。

用于校验的关键输出字段：`npu-smi version`、`Usage: npu-smi`、`Usage: npu-smi info`、`NPU ID`、`Name`、`Health`、`Power(W)`、`Temp(C)`、`Bus-Id`、`NPU Util(%)`、`Memory-Usage(MB)`、`HBM-Usage(MB)`、`Total Count`、`Product Name`、`Serial Number`、`Slot ID`、`Chip ID`、`Chip Phy-ID`、`Chip Name`。

命令生成注意事项：不要并发运行多个 `npu-smi`；Ascend 950 代使用 `-i dev_id`，不要生成旧式 `-i id -c chip_id`；`dev_id` 是软件逻辑 ID，对应 `/dev/davinciX`，应优先从 `npu-smi info -l` 的 `NPU ID` 获取；部署场景支持表中的 `N`/`NA` 是硬约束；示例回显只用于字段锚定，解析时按标签容错。

## 覆盖 partNo

- `j003` Ascend HDK接口和命令工具简介
- `j004` npu-smi工具使用导读
- `j005` 查询帮助
- `j006` 查询npu-smi工具版本
- `j007` 信息查询（info）
- `j008` 信息查询帮助
- `j009` 查询基本信息
- `j00a` 查询设备映射关系信息
- `j00b` 查询所有NPU设备

## 全局约束

- `npu-smi` 是 NPU 管理命令入口，脚本可用于查询、设置、清除、升级和证书管理，但必须按命令族隔离风险。
- 文档明确不支持多线程并发使用 `npu-smi`。自动化脚本应串行化 npu-smi 调用，必要时加进程级锁。
- 普通容器场景下的进程可见性受限；主机/特权容器可见主机、普通容器和特权容器进程，普通容器仅可见本容器进程。
- 输出格式可能随驱动/固件版本变化；知识项中的字段用于校验和提取，不应写死列宽或空格数量。

## 发现与帮助命令

| 目的 | 命令模板 | 校验线索 |
| --- | --- | --- |
| 顶层帮助 | `npu-smi -h` 或 `npu-smi --help` | `Usage: npu-smi <Command|-h|-v>`；命令列表含 `info`、`set`、`clear`、`upgrade`。 |
| 工具版本 | `npu-smi -v` | `npu-smi version: x.x.x`。 |
| info 帮助 | `npu-smi info -h` 或 `npu-smi info --help` | `Usage: npu-smi info <watch|proc|-h|-m|-l|-t type>`；类型列表可用于补全候选。 |
| 基本信息 | `npu-smi info` | 表格头包含 `NPU ID`、`Name`、`Health`、`Power(W)`、`Temp(C)`、`Bus-Id`、`NPU Util(%)`、`Memory-Usage(MB)`、`HBM-Usage(MB)`。无进程时可能出现 `No running processes found in NPU dev_id`。 |
| 设备映射 | `npu-smi info -m` | 输出列含 `NPU ID`、`Slot ID`、`Chip ID`、`Chip Phy-ID`、`Chip Name`。 |
| 设备枚举 | `npu-smi info -l` | `Total Count`、每个设备的 `NPU ID`、`Product Name`、`Serial Number`；后续 `-i dev_id` 使用这里的 `NPU ID`。 |

## 生成脚本时的缺口补齐

- 如果用户只说“查某张卡”，先生成 `npu-smi info -l`，再把目标设备映射到 `dev_id`。
- 如果用户给的是物理 ID，不要直接当作 `dev_id`；用 `npu-smi info -t phyid-remap -p phy_id` 反查，详见 `huawei-npu-smi-syslog-process-topology-output.md`。
- 如果用户要求“全部设备概览”，优先用 `npu-smi info`；如果后续命令需要逐设备执行，再用 `npu-smi info -l` 枚举。
- 如果输出中 `Health` 非 `OK` 或出现 `Error Code`/告警，跳转到 ECC/故障知识项继续解析。
