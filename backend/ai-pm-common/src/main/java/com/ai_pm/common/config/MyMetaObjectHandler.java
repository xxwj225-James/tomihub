package com.ai_pm.common.config;

import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import org.apache.ibatis.reflection.MetaObject;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * Auto-fills createdAt and updatedAt for MyBatis-Plus entities.
 * Required by @TableField(fill = FieldFill.INSERT / INSERT_UPDATE).
 */
@Component
public class MyMetaObjectHandler implements MetaObjectHandler {

    @Override
    public void insertFill(MetaObject metaObject) {
        Instant now = Instant.now();
        this.setFieldValByName("createdAt", now, metaObject);
        this.setFieldValByName("updatedAt", now, metaObject);
    }

    @Override
    public void updateFill(MetaObject metaObject) {
        this.setFieldValByName("updatedAt", Instant.now(), metaObject);
    }
}
