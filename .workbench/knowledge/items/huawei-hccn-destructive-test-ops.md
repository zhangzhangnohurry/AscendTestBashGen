---
id: huawei-hccn-destructive-test-ops
title: "Huawei hccn_tool 清除、升 lane 与测试类操作"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 清除、升 lane 与测试类操作

## 适用场景

用于生成和校验会改变设备状态、清除统计、触发测试或导出日志的 `hccn_tool` 命令，包括清除端口统计、设置端口升 lane、清除 SU 误码统计、导出寄存器、设置 SU 误码模式、UB ping。默认视为有副作用或测试操作，应在维护窗口/隔离场景执行。

## 用于校验的关键输出字段

- 清除统计 `j00x`、清除 SU 误码 `j00z`、导出寄存器 `j017`、设置 SU 误码模式 `j018`：成功回显 `Cmd executed successfully!`。
- 升 lane `j00y`：先回显 `Running this command just try to upgrade lane, but does not guarantee the result.`，再出现确认提示 `Are you sure you want to continue?(y/n)`，输入 `y` 后成功回显 `Cmd executed successfully!`。
- UB ping `j019`：`recv seq`、`time`、`packets transmitted`、`received`、`packet loss`、`max time`、`min time`、`average time`、`TP95 time`、`Cmd executed successfully!`。

## 命令生成注意事项

- 端口类设置/测试命令均需先由 `hccn_tool -g -dev_info -i <dev_id>` 补齐 `UDie ID` 与 `Port ID`。
- `hccn_tool` 不支持多线程并发；测试脚本应串行执行，尤其避免并发 UB ping 超过设备限制。
- 清除端口统计和清除 SU 误码统计会删除现场计数，生成计划时应先建议采集查询类输出。
- 升 lane 只是触发尝试，不保证成功；执行后应回到端口链路状态知识项，用 `-g -speed`、`-g -port_info` 校验 `Width`、`Status`、`cur_*_lane_num`。
- 导出寄存器前可开启 Device 侧 debug 日志；执行后可用 `msnpureport -f` 收集 NPU 侧日志，在生成日志目录的 `/slog/device-os-X/debug/device-os` 或 `/slog/device-os-X/debug/device-X` 查看目标寄存器信息。
- 设置 SU 误码模式需按时序：先配置一个设备端口为 `tx_enable`，再配置互连的另一设备端口为 `rx_enable`；统计结果在接收端口通过 `hccn_tool -g -su_ber ... -result` 查询。
- SU 误码模式 `-mode <mode_type>` 取值：`tx_enable`、`rx_enable`、`stop`；未配置时默认 `stop`。
- UB ping 的 Device 侧并发 ping 操作不大于 8 个；`-pkt` 范围 `[0,4046]` Byte，默认 `4046`；`-cnt` 范围 `[1,1000]`，默认 `3`；`-interval` 范围 `[0,10000]` ms，默认 `1000`。
- UB ping 的 `src_eid`、`dst_eid` 需要标准 EID 格式，可由设备发现输出补齐。

## 覆盖命令

### 清除端口的相关统计信息 (`j00x`)

```bash
hccn_tool -s -stat -i <dev_id> -u <udie_id> -p <port_id> -clear
```

### 设置端口升 lane (`j00y`)

```bash
hccn_tool -s -upgrade_lane -i <dev_id> -u <udie_id> -p <port_id>
```

需要交互确认，且只表示尝试升 lane。

### 清除端口的 SU 误码统计 (`j00z`)

```bash
hccn_tool -s -su_ber -i <dev_id> -u <udie_id> -p <port_id> -clear
```

### 导出端口的寄存器信息 (`j017`)

```bash
hccn_tool -t -dump -i <dev_id> -u <udie_id> -p <port_id>
```

### 设置端口的 SU 误码模式 (`j018`)

```bash
hccn_tool -t -su_ber -i <dev_id> -u <udie_id> -p <port_id> -mode <mode_type>
```

### 查询指定 NPU 设备到目的地址的 UB ping 结果 (`j019`)

```bash
hccn_tool -t -ub_ping -i <dev_id> -src_eid <src_eid> -dst_eid <dst_eid> [-pkt <size>] [-cnt <size>] [-interval <size>]
```
