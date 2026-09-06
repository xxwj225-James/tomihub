package com.ai_pm.core.service;

/**
 * Extracts projectId and issueId from controller method arguments.
 * Looks for params named "projectId"/"issueId" or String params in path.
 */
final class ProjectContextResolver {

    private ProjectContextResolver() {}

    static String resolveFromArgs(Object[] args) {
        // Simple heuristic: look for first String argument (usually projectId or issueId)
        // In production, use parameter annotations instead
        for (Object arg : args) {
            if (arg instanceof String s && s.length() == 36) { // UUID length
                return s;
            }
        }
        return null;
    }

    static String resolveIssueId(Object[] args) {
        return resolveFromArgs(args);
    }
}
