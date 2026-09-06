package com.ai_pm.core.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;
import java.time.Instant;

@Data
@TableName("tenant_db_config")
public class DbConfig {
    @TableId
    private String tenantId;
    private String host;
    private Integer port;
    private String databaseName;
    private String username;
    private String password;
    private String serviceStatus;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Instant updatedAt;
}
