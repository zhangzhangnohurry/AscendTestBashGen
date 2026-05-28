---
id: huawei-hccn-tls-config-recovery
title: "Huawei hccn_tool TLS 证书与配置恢复"
source_type: huawei-support-edoc
doc_id: EDOC1100569784
version: "01"
published: "2026-05-09"
product: "Atlas 350 加速卡"
tool: "hccn_tool"
---

# Huawei hccn_tool TLS 证书与配置恢复

## 适用场景

用于查询 TLS 证书信息、替换 Host/Device 侧 TLS 证书、设置 TLS 开关、设置过期告警阈值、清除 TLS 证书信息，以及查询/触发配置恢复。该知识项涉及持久化和业务影响操作，生成命令时应标记副作用。

## 用于校验的关键输出字段

- TLS 查询 `j00p`：`tls switch`、`tls preconfigured`、`tls alarm time threshold`、证书块 `[pub cert]`/`[caN cert]`/`[crl]`、`subject`、`issuer`、`start_time`、`end_time`、`tls expiration status`。
- TLS 状态值：`tls switch` 中 `0` 为关闭、`1` 为开启；`tls preconfigured` 中 `0` 为非预置证书、`1` 为预置证书；`tls expiration status` 中 `0` 正常、`1` 即将过期、`2` 已过期。
- TLS 替换 `j010`：交互提示 `Please enter pass phrase for pri key:`；成功后有 `Cmd executed successfully!`；配置完成后回显安全提示 `[WARNING] Please delete the private key file after updating for security considerations.`。
- TLS 开关/告警/清除 `j011`、`j012`、`j013`：成功回显 `Cmd executed successfully!`。
- 配置恢复查询 `j00r`：`config status`，取值 `NONE`、`START`、`FAIL`、`SUCCESS`。
- 恢复所有设备 `j015`：逐设备 `device <id> recovery success`，末尾 `Cmd executed successfully!`。

## 命令生成注意事项

- 查询 TLS：无 `-host` 时默认查询 Device 侧；带 `-host` 查询 Host 侧。
- 替换 TLS 证书：无 `-host` 时默认替换 Device 侧；带 `-host` 替换 Host 侧。Host 侧配置有效性与设备 ID 无关。
- 证书链最少二级、最多十五级，参数为 `-ca1` 到 `-ca14`；需保证低级别证书由高级别证书签发，设备证书和吊销列表由最低级别根证书签发。
- 文件名最长 255 Byte；证书 Device 侧最大 3072 Byte、Host 侧最大 2048 Byte；私钥最大 4096 Byte；吊销列表最大 20480 Byte。
- 仅支持 X.509v3、pem 证书/私钥、crl 吊销列表；仅支持 RSA 私钥，长度 `[2048,4096]`，私钥必须为密文且加密算法仅支持 AES-256。
- 私钥与设备证书需配套替换；单独更新吊销列表只支持 Device 侧。
- 私钥口令通过交互式命令行输入且不回显；长度 `8~15`，至少包含大写字母、小写字母、数字、特殊符号中的 2 类，不能在弱口令字典中。
- Host 侧 TLS 证书配置需保证 `hccn_tool` 文件权限为 `555`，工具安装路径 `/usr/local/Ascend/driver/tools` 权限为 `755`。
- TLS 开关设置支持持久化；依赖 TLS 通信的业务需要通信双方开关状态一致。
- TLS 过期告警阈值 `-alarm <alarm day>` 范围 `7~180` 天，默认 `60` 天。
- 清除 TLS 证书可能影响依赖 TLS 通信的业务；`-crl` 只用于清除 Device 侧吊销列表，且与 `-host` 互斥；不支持单独清除 Host 侧吊销列表。
- 配置恢复命令为设置类操作，涉及持久化配置，应隔离执行并查询 `config status` 校验结果。

## 覆盖命令

### 查询 NPU 设备的 TLS 证书信息 (`j00p`)

```bash
hccn_tool -g -tls -i <dev_id> [-host]
```

### 查询 NPU 设备的配置恢复状态信息 (`j00r`)

```bash
hccn_tool -g -cfg_recovery -i <dev_id>
```

### 替换 NPU 设备的 TLS 证书 (`j010`)

```bash
hccn_tool -s -tls -i <dev_id> -path <file path> -pri <filename> -pub <filename> -ca1 <filename> [-ca2 <filename>] ...[-ca14 <filename>] [-crl <filename>] [-host]
```

只更新 Device 侧吊销列表时可使用 `-crl <filename>`，但需保证与现有证书配套。

### 设置 NPU 设备的 TLS 开关状态 (`j011`)

```bash
hccn_tool -s -tls -i <dev_id> -enable <0/1> [-host]
```

`0` 为关闭，`1` 为开启；Device 侧未配置时默认为 `1`。

### 设置 NPU 设备的 TLS 过期告警阈值 (`j012`)

```bash
hccn_tool -s -tls -i <dev_id> -alarm <alarm day> [-host]
```

### 清除 NPU 设备的 TLS 证书信息 (`j013`)

```bash
hccn_tool -s -tls -i <dev_id> -clear [-crl] [-host]
```

### 恢复 NPU 设备的配置 (`j014`)

```bash
hccn_tool -s -cfg_recovery -i <dev_id>
```

### 恢复所有 NPU 设备的配置 (`j015`)

```bash
hccn_tool -s -cfg_recovery -all
```
