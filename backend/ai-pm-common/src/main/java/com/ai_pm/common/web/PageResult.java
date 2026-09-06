package com.ai_pm.common.web;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.function.Function;

/**
 * Generic paginated result wrapper.
 * <p>
 * Used by all list endpoints that return paginated data.
 * Maps from MyBatis-Plus IPage to a flat JSON structure
 * so the frontend sees {@code items}, {@code total}, {@code page}, {@code size}.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PageResult<T>(List<T> items, long total, long page, long size) {

    /**
     * Build a PageResult from a MyBatis-Plus IPage.
     */
    public static <T> PageResult<T> of(IPage<T> mpPage) {
        return new PageResult<>(
            mpPage.getRecords(),
            mpPage.getTotal(),
            mpPage.getCurrent(),
            mpPage.getSize()
        );
    }

    /**
     * Build a PageResult from plain lists (for services that still manually paginate).
     */
    public static <T> PageResult<T> of(List<T> items, long total, long page, long size) {
        return new PageResult<>(items, total, page, size);
    }

    /**
     * Map each item using the given mapper function.
     * Useful for converting entities to view objects (VOs) before returning.
     */
    public <R> PageResult<R> map(Function<T, R> mapper) {
        return new PageResult<>(
            items.stream().map(mapper).toList(),
            total, page, size
        );
    }
}
