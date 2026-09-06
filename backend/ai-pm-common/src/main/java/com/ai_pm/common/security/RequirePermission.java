package com.ai_pm.common.security;

import java.lang.annotation.*;

/**
 * Declares required permission(s) for a controller method.
 *
 * Usage:
 *   @RequirePermission("PROJECT:BROWSE")                    // single
 *   @RequirePermission(anyOf = {"EDIT_ISSUES", "EDIT_OWN"}) // any one
 *   @RequirePermission(allOf = {"BROWSE", "COMMENT"})       // all
 *   @RequirePermission(value = "BROWSE", checkSecurityLevel = true)  // + Issue Security
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequirePermission {

    /** Single required permission code */
    String value() default "";

    /** Any one of these permissions is sufficient */
    String[] anyOf() default {};

    /** All of these permissions are required */
    String[] allOf() default {};

    /** If true, also check Issue Security Level (3rd tier) */
    boolean checkSecurityLevel() default false;
}
