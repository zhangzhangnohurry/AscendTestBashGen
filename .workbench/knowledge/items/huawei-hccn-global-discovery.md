---
id: huawei-hccn-global-discovery
title: "Huawei hccn_tool 全局使用与设备发现"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 全局使用与设备发现

## 适用场景

用于生成或校验 `hccn_tool` 的帮助查询、设备/端口/网络接口发现、设备级互连状态、vNIC、版本与 Device 侧进程查询。适合在生成端口类、网络资源类、TLS 或测试命令前补齐 `dev_id`、`udie_id`、`port_id`、UDMA 设备名和 EID。

## 用于校验的关键输出字段

- 帮助查询 `j005`：`Usage`、`mode`、`-g`、`-s`、`-t`、`example`。
- 设备信息 `j007`：端口表字段 `UDie ID`、`Port ID`、`Speed Ability(Gbps)`、`Port Type`、`Link Status`、`Media Type`；网络接口表字段 `Interface Name`、`IP Address`、`Netmask`、`Bond Mode`、`Slaves`；UDMA 表字段 `Name`、`EID Index`、`EID`。
- 互连状态 `j00m`：`link status` 可为 `UP`、`DOWN`、`PARTIAL LINK`；逐端口 `port X` 可为 `UP`、`DOWN`、`PARTIAL UP`。
- vNIC `j00n`：`vnic link status`、`vnic ipaddr`、`vnic netmask`。
- 版本 `j00o`：`Network Driver Version`、`Network Firmware Version`。
- Device 进程 `j00q`：`device hccp process`，值为 `exist` 或 `not exist`。

## 命令生成注意事项

- 工具默认通过驱动安装，并通过 `/usr/bin/hccn_tool` 软链接指向 `/usr/local/Ascend/driver/tools`；容器内使用需挂载宿主机 `/usr/bin/hccn_tool`。
- `hccn_tool` 不支持多线程并发操作；自动化脚本应串行执行。
- 不生成昇腾虚拟化实例场景命令。
- `-g` 为查询类命令，`-s` 为设置类命令，`-t` 为测试类命令。
- 单设备命令通式：`hccn_tool -mode -cmd -i <dev_id> [-options]`；`dev_id` 来自 `npu-smi info` 的 `NPU ID`。
- 端口命令通式：`hccn_tool -mode -cmd -i <dev_id> -u <udie_id> -p <port_id> [-options]`。先用 `-g -dev_info` 获取 `UDie ID` 和 `Port ID`。
- 网络设备命令通式：`hccn_tool -mode -cmd -i <dev_id> -d <udma_dev_name> [-options]`。先用 `-g -dev_info` 获取 UDMA `Name`，如 `udma1`、`udma3`。
- Atlas 350 加速卡单卡无有效端口；2 卡互连每卡端口为 `4、5、6、8`；4 卡互连每卡端口为 `4、5、6`。
- UB ping 的 `src_eid`、`dst_eid` 可从 `-g -dev_info` 返回的 `ipourma` 的 `IP Address` 或 UDMA `EID` 语义补齐，但需保持命令要求的标准 EID 格式。

## 覆盖命令

### 查询 hccn_tool 帮助提示信息 (`j005`)

```bash
hccn_tool -h [-<mode>] [-<cmd>]
```

`-<mode>` 与 `-<cmd>` 二选一；模式包括 `-g`、`-s`、`-t`。

### 查询 NPU 设备信息 (`j007`)

```bash
hccn_tool -g -dev_info -i <dev_id>
```

该命令是端口类与网络资源类命令的前置发现入口。校验时至少确认端口表、网络接口表、UDMA 表中对应字段存在。

### 查询 NPU 设备的互连或断开状态信息 (`j00m`)

```bash
hccn_tool -g -ub_connect -i <dev_id>
```

单卡或无有效端口时整体可能为 `DOWN`；部分有效端口 UP 时整体为 `PARTIAL LINK`。

### 查询 NPU 设备的 vNIC IP 及 link 状态 (`j00n`)

```bash
hccn_tool -g -vnic -i <dev_id>
```

用于校验虚拟网口连通性与 IP/掩码，不替代 UB 端口链路查询。

### 查询 NPU 设备的 DRV 驱动包和固件版本号信息 (`j00o`)

```bash
hccn_tool -g -version -i <dev_id>
```

输出中驱动版本与固件版本分别由 `Network Driver Version`、`Network Firmware Version` 标识。

### 查询 NPU 设备的 Device 侧进程信息 (`j00q`)

```bash
hccn_tool -g -process -i <dev_id>
```

校验 `device hccp process` 是否为 `exist`，用于判断 Device 侧 HCCP 进程是否存在。
