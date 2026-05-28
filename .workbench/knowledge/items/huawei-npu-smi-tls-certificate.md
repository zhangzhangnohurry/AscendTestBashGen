# Huawei npu-smi: TLS 证书管理

适用场景：获取 TLS CSR、预置/更新 TLS 证书、查询证书信息、查询或设置证书过期阈值、恢复默认阈值。该证书管理仅涉及模型保护相关场景。

用于校验的关键输出字段：`Enter country_name|province_name|city_name|organization_name|department_name`、`Message`、`-----BEGIN CERTIFICATE REQUEST-----`、`Status`、`Alarm status`、`Start time`、`End time`、`Common name`、`Certificate validity period`。

命令生成注意事项：证书导入的 `-f` 参数是一个带引号字符串，顺序为 `TLS证书 CA根证书 二级CA证书`；阈值 `period` 范围是 `7..180` 天，默认 `90`；不要把证书正文或私钥写入知识库或日志；所有带 `-i dev_id` 的命令先用 `npu-smi info -l` 确认逻辑 ID。

## 覆盖 partNo

- `j01e` 证书管理
- `j01f` 获取CSR
- `j01g` 预置/更新TLS证书
- `j01h` 查询证书信息
- `j01i` 查询证书过期阈值
- `j01j` 设置证书过期阈值
- `j01k` 恢复证书默认过期阈值

## 命令族与输出锚点

| 目的 | 命令模板 | 重点约束/校验线索 |
| --- | --- | --- |
| 获取 CSR | `npu-smi info -t tls-csr-get -i dev_id` | 交互提示 `Enter country_name|province_name|city_name|organization_name|department_name`；成功消息 `The tls csr file of the chip is obtained successfully.`；CSR 文件可在 `/run/csr/cert_type_PKI2.0_tls_*.csr` 查看，内容以 `-----BEGIN CERTIFICATE REQUEST-----` 开始。 |
| 导入 TLS 证书 | `npu-smi set -t tls-cert -i dev_id -f "TLS证书 CA根证书 二级CA证书"` | 输出可含 `Status : OK`、`Message : The tls-cert of the chip is set successfully.`。 |
| 查询证书信息 | `npu-smi info -t tls-cert -i dev_id` | `Alarm status`、`Start time`、`End time`、`Common name`。 |
| 查询过期阈值 | `npu-smi info -t tls-cert-period -i dev_id` | `Certificate validity period : 90 days`。 |
| 设置过期阈值 | `npu-smi set -t tls-cert-period -i dev_id -s period` | `period` 范围 `7..180`；输出可含 `Status : OK`、`Message : The tls-cert-period of the chip is set successfully.`。 |
| 恢复默认阈值 | `npu-smi clear -t tls-cert-period -i dev_id` | 输出可含 `Status : OK`、`Message : Clear tls-cert-period successfully.`。 |

## 生成与校验建议

- CSR 交互输入使用 `国家|省份|城市|组织|部门` 格式；示例中的 `*` 只是占位演示，不应默认填入生产组织字段。
- 导入证书前校验三个证书路径均存在，且按 TLS 证书、CA 根证书、二级 CA 证书顺序传入同一个引号字符串。
- 查询证书时，`Alarm status` 需要按设备语义解释；本文档只给出字段，不定义告警等级映射。
- 证书过期阈值变更和恢复默认都是状态变更，应放入显式维护/配置阶段。
