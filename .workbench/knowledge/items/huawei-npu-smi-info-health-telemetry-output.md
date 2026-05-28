# Huawei npu-smi: 设备信息、健康与遥测输出

适用场景：查询单设备板卡详情、常用信息、闪存/内存、监测数据、使用率、温度、功率、电压、健康状态、传感器和系统时间，并从回显字段中校验设备状态。

用于校验的关键输出字段：`NPU ID`、`Product Name`、`NPU Name`、`Chip Name`、`Chip Version`、`Firmware Version`、`Driver Version`、`Memory Usage Rate(%)`、`HBM Usage Rate(%)`、`Aicore Usage Rate(%)`、`Aivector Usage Rate(%)`、`Aicore Freq(MHZ)`、`Temperature (C)`、`NPU Real-time Power(W)`、`Voltage(V)`、`Health`、`Error Code`、`Error Information`、`Soc Max Temperature (C)`、`SFP Temperature (C)`、`System Time(local)`。

命令生成注意事项：所有带 `-i dev_id` 的命令先用 `npu-smi info -l` 取得逻辑 `NPU ID`；`watch` 的 `-d delay_seconds` 范围是 `1..100`，默认 `1`；`watch_type` 可组合，`t` 表示温度；开启 profiling 时 `Aicore Usage Rate(%)` 和 `Aivector Usage Rate(%)` 返回 `0` 不代表真实空闲。

## 覆盖 partNo

- `j00c` 查询NPU的详细信息
- `j00d` 查询设备常用信息
- `j00e` 查询设备闪存信息
- `j00f` 查询设备内存信息
- `j00g` 查询设备监测数据
- `j00h` 查询设备统计信息
- `j00i` 查询设备温度
- `j00j` 查询设备功率
- `j00k` 查询设备电压
- `j00l` 查询设备健康状态
- `j00p` 查询设备传感器信息
- `j00q` 查询设备系统时间

## 命令族与输出锚点

| 目的 | 命令模板 | 重点字段/校验线索 |
| --- | --- | --- |
| 板卡详细信息 | `npu-smi info -t board -i dev_id` | `NPU ID`、`Product Name`、`NPU Name`、`Chip Name`、`Chip Version`、固件/驱动兼容相关字段。非 root 用户可能看到 `NA` 或 `NOT SUPPORT`。 |
| 常用信息 | `npu-smi info -t common -i dev_id` | `Memory Usage Rate(%)`、`HBM Usage Rate(%)`、`Aicore Usage Rate(%)`、`Aicore Freq(MHZ)`、温度/功耗类字段。 |
| 闪存信息 | `npu-smi info -t flash -i dev_id` | `Flash Count`、`Flash ID`、`Manufacturer ID`、`Capacity(MB)`。 |
| 内存信息 | `npu-smi info -t memory -i dev_id` | `DDR Capacity(MB)`、`HBM Capacity(MB)`、`HBM Clock Speed(MHz)`、HBM 温度字段。 |
| 滚动监测 | `npu-smi info watch`；`npu-smi info watch -i dev_id`；`npu-smi info watch -i dev_id -d delay_seconds -s watch_type` | 表头含 `NpuID(Idx)`、`Pwr(W)`、`Temp(C)`、`AI Core(%)`、`AI Cpu(%)`、`Ctrl Cpu(%)`、`Memory(%)`、`Memory BW(%)`、`NPU Util(%)`、`AI Cube(%)`。 |
| 使用率统计 | `npu-smi info -t usages -i dev_id` | `DDR Usage Rate(%)`、`DDR Hugepages Usage Rate(%)`、`HBM Usage Rate(%)`、`Aicore Usage Rate(%)`、`Aivector Usage Rate(%)`、`Aicpu Usage Rate(%)`、`Ctrlcpu Usage Rate(%)`、带宽使用率。 |
| 温度 | `npu-smi info -t temp -i dev_id` | `Temperature (C)`。 |
| 功率 | `npu-smi info -t power -i dev_id` | `NPU Real-time Power(W)`。 |
| 电压 | `npu-smi info -t volt -i dev_id` | `Voltage(V)`。 |
| 健康状态 | `npu-smi info -t health -i dev_id` | `Health`、`Error Code`、`Error Information`。多告警时返回最严重健康状态；`UNKNOWN` 表示设备不存在或未启动。 |
| 传感器 | `npu-smi info -t sensors -i dev_id` | `Soc Max Temperature (C)`、`SFP Temperature (C)`、`NDIE Temperature (C)`、`HBM Temperature (C)`。铜缆光模块温度无效可能为 `NA`；无光模块可能不显示该字段。 |
| 系统时间 | `npu-smi info -t sys-time -i dev_id` | `System Time(local)`。 |

## 校验与解析建议

- `Health` 为 `OK` 才能作为基础健康通过；`WARNING`、`ALARM`、`UNKNOWN` 或非空错误信息应转入故障查询。
- 对百分比字段只校验数值范围和标签存在，不要把 profiling 场景下的 `0` 判定为真实低负载。
- `watch` 是滚动格式，适合人工或短时采样；自动化需要限定采样时长并保留首行表头。
- 对温度、功耗、电压设置阈值时应由业务策略提供；本文档只提供字段含义，不给出告警阈值。
