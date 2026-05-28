---
id: huawei-hccn-bandwidth-statistics-errors
title: "Huawei hccn_tool 端口带宽、统计、信用证与误码"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 端口带宽、统计、信用证与误码

## 适用场景

用于查询端口实时带宽、峰值带宽、报文统计、FEC 误码、可用信用证、SU 误码模式与统计结果。适合性能/丢包/误码/拥塞方向的校验与脚本生成。

## 用于校验的关键输出字段

- 实时带宽 `j009`：`Bandwidth TX`、`Bandwidth RX`，单位 `MB/sec`。
- 峰值带宽 `j00c`：`Peak Bandwidth TX`、`Peak Bandwidth RX`，单位 `MB/sec`。
- 端口统计 `j00a`：`packet statistics`、`port_id`、`is_uboe_port`、RX/TX 报文计数、`route_err_cnt_rx`、`out_err_cnt_rx`、`length_err_cnt_rx`、`out_err_cnt_tx`、`length_err_cnt_tx`、`retry_req_sum`、`retry_ack_sum`、`crc_error_sum`。
- FEC 误码 `j00d`：`st_fec_decoding_fail_num` 为 FEC 纠后误帧数；`st_fec_err_bit_num` 为 FEC 纠前误码数。
- 信用证 `j00e`：`link_alloc_port_share_credit`、`link_cur_used_port_share_credit`、`link_alloc_vl_pri_credit(<n>)`、`link_cur_used_pri_credit(<n>)`。
- SU 误码 `j00l`：模式查询输出 `su_itlv_mode`、`status`；结果查询输出 `Lane`、`Done`、`Bit_err_cnt`、`Err_symb_t4`、`Frm_cnt`、`Frm_bit`、`Su_ber_rate`、`Su_err_frame_rate`。

## 命令生成注意事项

- 所有端口查询都需要先由 `hccn_tool -g -dev_info -i <dev_id>` 补齐 `UDie ID` 与 `Port ID`。
- 实时带宽 `-time <time_val>` 单位毫秒，范围 `[100, 10000]`，默认 `1000`。
- 峰值带宽 `-time <time_val>` 单位毫秒，范围 `[1, 226]`，默认 `200`。
- `is_uboe_port` 中 `0` 表示 UB 端口，`1` 表示 UBoE 端口。
- SU 误码查询的 `-mode_status` 与 `-result` 二选一；`Done=0x0` 表示无数据或未完成，`Done=0x1` 表示已完成，其他值表示异常。
- 清除统计或设置 SU 误码模式属于有副作用操作，放在 `huawei-hccn-destructive-test-ops.md`。

## 覆盖命令

### 查询端口的实时带宽信息 (`j009`)

```bash
hccn_tool -g -bandwidth -i <dev_id> -u <udie_id> -p <port_id> [-time <time_val>]
```

### 查询端口的相关统计信息 (`j00a`)

```bash
hccn_tool -g -stat -i <dev_id> -u <udie_id> -p <port_id>
```

统计输出包括报文分类、路由/长度/CRC 错误、重传与字节计数。解析时保留字段原名。

### 查询端口的峰值带宽信息 (`j00c`)

```bash
hccn_tool -g -peak_bw -i <dev_id> -u <udie_id> -p <port_id> [-time <time_val>]
```

### 查询端口的误码数信息 (`j00d`)

```bash
hccn_tool -g -bit_err -i <dev_id> -u <udie_id> -p <port_id>
```

### 查询端口的芯片可用信用证数量 (`j00e`)

```bash
hccn_tool -g -credit -i <dev_id> -u <udie_id> -p <port_id>
```

### 查询端口的 SU 误码模式和误码统计结果 (`j00l`)

```bash
hccn_tool -g -su_ber -i <dev_id> -u <udie_id> -p <port_id> [-mode_status | -result]
```

`-mode_status` 查询模式状态；`-result` 查询统计结果。
