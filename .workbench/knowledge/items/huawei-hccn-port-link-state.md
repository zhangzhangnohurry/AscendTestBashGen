---
id: huawei-hccn-port-link-state
title: "Huawei hccn_tool 端口链路状态与建链诊断"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 端口链路状态与建链诊断

## 适用场景

用于查询单端口 link 状态、端口状态详情、速率、SerDes、FEC、历史建链流程、历史 link up/down 记录，以及 link down 触发时的链路数据。适合定位端口 DOWN、降 lane、FEC 异常、建链失败错误码和历史波动。

## 用于校验的关键输出字段

- link 状态 `j008`：`link status`，取值 `UP` 或 `DOWN`。
- 端口状态详情 `j00b`：`port_id`、`target_speed`、`speed_ability`、`lane_num`、`fec`、`sds_rate`、`port_usage`、`port_enable`、`port_link`、`link_down_err`、`link_state`、`cur_speed`、`cur_tx_lane_num`、`cur_rx_lane_num`、`dl_link`、`phy_link`、`lstm_state`、`decoded_fail_block_num`、`fec_err`、`retry_cnt`、`dl_link_fsm`。
- 速率 `j00f`：表格字段 `NPU`、`UDie`、`Port`、`Speed`、`Cap`、`Width`、`Status`；`Speed` 在 link down 时返回 `unknown`，`Status` 可为 `normal` 或 `downgraded`。
- SerDes `j00g`：`Lane`、`snr`、`fir pre*`、`fir main`、`fir post*`。
- FEC `j00h`：`rs_mode`、`auto_change_mode`、`itlv_mode`。
- 历史建链 `j00i`：`Index`、`Time_Stamp`、`Adapt status`；最多 5 条，按时间由近到远。
- 历史 link `j00j`：`link up count`、`link down count`、`Link_Status`、`Time_Stamp`；最多当前时间之前 10 条，按时间由近到远。
- link down 数据 `j00k`：按 log row 输出 `lane`、`snr_metric`、`metric_his_min`、`err_avg`、`cycles_avg`、`heh_avg`、`c3_ud_2csr`、`c5_ud_2csr`。

## 命令生成注意事项

- 所有命令都需要 `-i <dev_id> -u <udie_id> -p <port_id>`；`dev_id` 来自 `npu-smi info` 的 `NPU ID`，`udie_id` 与 `port_id` 先由 `hccn_tool -g -dev_info -i <dev_id>` 获取。
- Atlas 350 加速卡单卡无有效端口；2 卡互连端口为 `4、5、6、8`，4 卡互连端口为 `4、5、6`。
- 查询历史建链/历史 link 时，不要假设输出一定有满 5 条或 10 条；按实际记录数解析。
- `link_down_err`、`link_state`、`dl_link_fsm` 是诊断建链失败的关键字段，不能只看 `link status`。

## 覆盖命令

### 查询端口的 link 状态 (`j008`)

```bash
hccn_tool -g -link -i <dev_id> -u <udie_id> -p <port_id>
```

### 查询端口的状态信息 (`j00b`)

```bash
hccn_tool -g -port_info -i <dev_id> -u <udie_id> -p <port_id>
```

用于深度诊断，输出分为 UB PORT LINK INFO 与 UB DLPHY INFO 两组字段。

### 查询端口的速率信息 (`j00f`)

```bash
hccn_tool -g -speed -i <dev_id> -u <udie_id> -p <port_id>
```

重点校验 `Speed`、`Width`、`Status`，识别 link down 与降 lane。

### 查询端口的 SerDes 信息 (`j00g`)

```bash
hccn_tool -g -serdes -i <dev_id> -u <udie_id> -p <port_id>
```

按 lane 输出信噪比和 TX FIR 均衡参数。

### 查询端口的 FEC 信息 (`j00h`)

```bash
hccn_tool -g -fec -i <dev_id> -u <udie_id> -p <port_id>
```

`rs_mode` 表示 FEC 均衡或去加重模式，`auto_change_mode` 表示静态/动态切换模式，`itlv_mode` 表示交织模式。

### 查询端口的历史建链流程的状态信息 (`j00i`)

```bash
hccn_tool -g -adapt_status -i <dev_id> -u <udie_id> -p <port_id>
```

最多 5 条历史建链信息。

### 查询端口的历史 link up 和 down 状态信息 (`j00j`)

```bash
hccn_tool -g -link_stat -i <dev_id> -u <udie_id> -p <port_id>
```

最多当前时间之前 10 次历史 link up/down。

### 查询端口的 link down 时链路相关信息 (`j00k`)

```bash
hccn_tool -g -down_data -i <dev_id> -u <udie_id> -p <port_id>
```

link down 触发 5 次及以上时显示 5 条；少于 5 次时按实际次数显示。
