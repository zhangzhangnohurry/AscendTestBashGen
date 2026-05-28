# Huawei npu-smi: 固件版本查询与升级

适用场景：查询 VRD/相关固件版本、生成固件升级命令、校验升级输出，并规划升级后的 reboot、断电上电和链路恢复步骤。

用于校验的关键输出字段：`Usage: npu-smi upgrade`、`VRD Count`、`VRD Name`、`Current Version`、`Target Version`、`Remaining Upgrade Count`、`This device does not support querying version.`、`Transfer`、`Status`、`Start upgrade [100]`、`Message`。

命令生成注意事项：文档说明仅支持 VRD 固件版本查询，但示例含 `vrd` 和 `vdm`，非 `vrd` 必须按设备版本核实；VRD 固件升级不支持并发升级，升级中不要重复执行；`file_path` 只允许字母、数字、下划线、点、斜杠和中划线；升级后需要 `reboot`，等待至少 60 秒，再 DC 下电/上电并等待 NPU 链路恢复。

## 覆盖 partNo

- `j017` 升级功能（upgrade）
- `j018` 升级功能帮助
- `j019` 查询固件版本信息
- `j01a` 升级固件

## 命令族与输出锚点

| 目的 | 命令模板 | 重点约束/校验线索 |
| --- | --- | --- |
| upgrade 帮助 | `npu-smi upgrade -h` 或 `npu-smi upgrade --help` | `Usage: npu-smi upgrade <-h|-t type|-b type>`；帮助中 `-t type` 的类型示例为 `vrd`。 |
| 查询固件版本 | `npu-smi upgrade -b item -i dev_id` | VRD 示例输出含 `VRD Count`、`VRD Name`、`Current Version`、`Target Version`、`Remaining Upgrade Count`；不支持时可能返回 `This device does not support querying version.`。 |
| 升级固件 | `npu-smi upgrade -t item -i dev_id -f file_path` | 输出先警告不要断电/重启，随后可见 `Transfer : success`、`Status : start to upgrade`、`Start upgrade [100]`、`Message : Upgrade device success`。 |

## 固件文件与并发约束

- 示例包名形态：`Atlas-A5-hdk-vrd-firmware_xxx.hpm`。
- `file_path` 字符集限制为 `[A-Za-z0-9_./-]`，脚本应在命令前本地校验。
- 不要对多个设备或多个 VRD 包并发执行升级；文档明确 VRD 固件升级不支持并发。
- 升级过程中出现警告提示时，脚本应保留原始回显；不要在升级未完成时重试。

## 升级后动作

1. 执行升级命令并确认 `Message` 表示成功。
2. 执行系统 `reboot`。
3. reboot 后等待至少 60 秒。
4. 执行 DC 下电/上电。
5. 等待 NPU 链路恢复，再重新运行 `npu-smi info -l` 和版本查询。
