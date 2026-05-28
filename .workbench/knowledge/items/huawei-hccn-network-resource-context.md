---
id: huawei-hccn-network-resource-context
title: "Huawei hccn_tool 网络设备 context 与队列资源"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool 网络设备 context 与队列资源

## 适用场景

用于查询 UDMA 网络设备的 AEQ/CEQ context、队列相关资源列表和资源属性。适合调试 UDMA 队列、事件队列、资源 ID 是否存在以及资源状态。

## 用于校验的关键输出字段

- AEQ context `j00s`：输出以 `offset  aeq<id>` 开头，后续为 offset 与十六进制值。
- CEQ context `j00t`：输出以 `offset  ceq<id>` 开头，后续为 offset 与十六进制值。
- 资源列表 `j00u`：`seg_cnt`、`jfs_cnt`、`jfr_cnt`、`jfc_cnt`、`jetty_cnt`、`jetty_group_cnt`、`rc_cnt`。
- 资源属性 `j00v`：示例 JFR 输出字段包括 `jfr_id`、`state`、`depth`、`jfc_id`；`state` 可能带方括号状态名，如 `[READY]`。

## 命令生成注意事项

- 所有网络资源命令都需要 `-i <dev_id> -d <udma_dev_name>`；`udma_dev_name` 必须先由 `hccn_tool -g -dev_info -i <dev_id>` 的 UDMA `Name` 字段获得。
- AEQ/CEQ context 的索引参数取值为 `0`：`-aeqc 0` 或 `-ceqc 0`。
- 查询资源属性前应先执行资源列表查询；若对应资源计数为 `0`，表示该资源类型不存在，不应继续生成对应 `-show_res` 查询。
- `-resource_type <type_id>` 取值范围 `5~11`，分别对应 `JFS`、`JFR`、`JETTY`、`JETTY_GROUP`、`JFC`、`RC`、`SEG`。
- `-key_id <key_id>` 为资源 ID，应来自资源列表/业务上下文，不能凭空编造。

## 覆盖命令

### 查询网络设备的 AEQ context 信息 (`j00s`)

```bash
hccn_tool -g -context -i <dev_id> -d <udma_dev_name> -aeqc <aeq_id>
```

`-aeqc <aeq_id>` 为 AEQ context 索引编号，文档取值为 `0`。

### 查询网络设备的 CEQ context 信息 (`j00t`)

```bash
hccn_tool -g -context -i <dev_id> -d <udma_dev_name> -ceqc <ceq_id>
```

`-ceqc <ceq_id>` 为 CEQ context 索引编号，文档取值为 `0`。

### 查询网络设备的队列相关资源列表信息 (`j00u`)

```bash
hccn_tool -g -show_list -i <dev_id> -d <udma_dev_name>
```

先看各类 `*_cnt` 是否非零，再决定是否查询具体资源属性。

### 查询网络设备的队列相关资源属性信息 (`j00v`)

```bash
hccn_tool -g -show_res -i <dev_id> -d <udma_dev_name> -resource_type <type_id> -key_id <key_id>
```

示例 `-resource_type 6 -key_id 4` 查询 JFR 资源属性。
