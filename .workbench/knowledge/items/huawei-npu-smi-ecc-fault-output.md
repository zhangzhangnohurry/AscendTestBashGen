# Huawei npu-smi: ECC、故障事件与链路误码输出

适用场景：设备健康异常、需要解释 ECC 计数、当前故障事件、ECC 使能状态、PCIe 误码，或需要判断是否进入维护/复位/清除流程。

用于校验的关键输出字段：`Fault Event Count`、`Fault Event Information`、`NPU ID`、`HBM Single Bit Error Count`、`HBM Double Bit Error Count`、`HBM Single Bit Aggregate Total Err Cnt`、`HBM Double Bit Aggregate Total Err Cnt`、`HBM Pending Retire Page Count`、`HBM Isolated Page Count`、`HBM ECC-Enable Status`、`TX Error Count`、`RX Error Count`、`Lcrc Error Count`、`Ecrc Error Count`。

命令生成注意事项：ECC/故障查询是只读动作，但不要自动生成清除命令；清除 ECC 计数会影响冷隔离，必须转到变更风险知识项；故障事件码需要结合 Ascend 950 黑匣子错误码或健康管理故障文档进一步解释。

## 覆盖 partNo

- `j00m` 查询设备告警信息
- `j00n` 查询设备ECC错误计数
- `j00o` 查询设备ECC使能状态
- `j00y` 查询设备的PCIe误码计数

## 命令族与输出锚点

| 目的 | 命令模板 | 重点字段/校验线索 |
| --- | --- | --- |
| 当前故障事件 | `npu-smi info -t current-fault-event -i dev_id` | `Fault Event Count`、`Fault Event Information`；信息中可能包含 `event id`、`severity`、`node type`、`node id`、`sub node type`、`sub node id`。 |
| ECC 错误计数 | `npu-smi info -t ecc -i dev_id` | 单 bit/双 bit 计数、累计计数、待隔离页数、已隔离页数。 |
| ECC 使能状态 | `npu-smi info -t ecc-enable -i dev_id` | `HBM ECC-Enable Status`，默认应为 `True`。 |
| PCIe 误码计数 | `npu-smi info -t pcie-err -i dev_id` | `TX Error Count`、`RX Error Count`、`Lcrc Error Count`、`Ecrc Error Count`。 |

## ECC 解释约束

- `HBM Pending Retire Page Count` 会在复位 NPU、重启系统、iBMC 上下电或 AC 上下电后刷新为 `HBM Isolated Page Count`。
- ECC 计数非零并不自动等同于需要清除；清除操作会清掉待隔离的多 bit ECC 故障地址，使冷隔离失效。
- `HBM ECC-Enable Status` 为非 `True` 时，应视为硬件/固件策略异常或不支持场景，不能擅自生成开启命令，因为本文档没有提供开启 ECC 的命令。
- PCIe 误码字段用于趋势和异常定位；文档没有给出阈值，脚本只能报告字段值和变化，不应硬编码告警级别。

## 输出处理建议

- 如果 `Fault Event Count` 为 `0`，仍应保留原始输出以证明查询完成。
- 如果 `Fault Event Information` 存在 `event id=...`，提取原始十六进制事件 ID，不要翻译或归并。
- 如果 `Health` 查询已发现异常，优先串行执行当前故障事件、ECC、PCIe 误码三类查询，形成同一时间窗口的诊断证据。
