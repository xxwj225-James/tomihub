package com.ai_pm.common.config;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Record serialization fallback for hardened (ProGuard-obfuscated) builds.
 *
 * ProGuard 7.4.2 drops the RecordComponents class attribute even with
 * -keepattributes RecordComponents. Jackson serializes Java records through
 * that attribute and falls back to JavaBean getters (getXxx) — which records
 * don't have (accessors are named code(), not getCode()). Result: every
 * record response serialized as "{}".
 *
 * Making fields visible lets Jackson serialize via fields (names preserved
 * by the entity/dto keep rules), which works identically before and after
 * obfuscation. @JsonIgnore and explicit @JsonProperty are unaffected.
 */
@Configuration
public class JacksonRecordCompatConfig {

    @Bean
    public Jackson2ObjectMapperBuilderCustomizer recordFieldVisibilityCustomizer() {
        return builder -> builder.visibility(PropertyAccessor.FIELD,
                JsonAutoDetect.Visibility.ANY);
    }
}
