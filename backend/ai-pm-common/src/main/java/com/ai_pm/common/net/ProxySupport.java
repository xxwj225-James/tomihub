package com.ai_pm.common.net;

import lombok.extern.slf4j.Slf4j;

import java.util.Properties;

/**
 * Common proxy detection — shared by SMTP mail, web search, and any
 * outbound HTTP client that needs to respect the host's proxy settings.
 *
 * Detection order:
 *   1. Environment variables: HTTPS_PROXY / HTTP_PROXY / ALL_PROXY (Docker standard)
 *   2. JVM system properties: https.proxyHost / http.proxyHost (system proxy)
 *   3. SOCKS: SOCKS_PROXY env or socksProxyHost system property
 *
 * Usage:
 *   ProxySupport.applySmtp(props)              — JavaMail properties
 *   ProxySupport.proxyHost()/proxyPort()      — build your own client
 *
 * No proxy configured → no-op, direct connection (default behavior).
 */
@Slf4j
public final class ProxySupport {

    private ProxySupport() {}

    public enum ProxyType { HTTP, SOCKS }

    public record ProxyInfo(ProxyType type, String host, int port, String user, String password) {}

    // ─── Public API ───

    /** Apply proxy to JavaMail SMTP properties. No-op when no proxy detected. */
    public static void applySmtp(Properties props) {
        ProxyInfo proxy = detect();
        if (proxy == null) return;

        if (proxy.type == ProxyType.SOCKS) {
            props.put("mail.smtp.socks.host", proxy.host);
            props.put("mail.smtp.socks.port", String.valueOf(proxy.port));
            log.info("SMTP proxy (SOCKS) applied: {}:{}", proxy.host, proxy.port);
        } else {
            props.put("mail.smtp.proxy.host", proxy.host);
            props.put("mail.smtp.proxy.port", String.valueOf(proxy.port));
            if (proxy.user != null && !proxy.user.isBlank()) {
                props.put("mail.smtp.proxy.user", proxy.user);
                props.put("mail.smtp.proxy.password", proxy.password == null ? "" : proxy.password);
            }
            log.info("SMTP proxy (HTTP CONNECT) applied: {}:{}", proxy.host, proxy.port);
        }
    }

    /** Get the detected proxy for custom HTTP clients (web search, etc.). Null = no proxy. */
    public static ProxyInfo getProxy() {
        return detect();
    }

    /** Convenience: proxy host or null. */
    public static String proxyHost() {
        ProxyInfo p = detect();
        return p == null ? null : p.host;
    }

    /** Convenience: proxy port or -1. */
    public static int proxyPort() {
        ProxyInfo p = detect();
        return p == null ? -1 : p.port;
    }

    // ─── Detection ───

    public static ProxyInfo detect() {
        // 1. SOCKS proxy (env first, then system property)
        String socks = env("SOCKS_PROXY");
        if (socks == null || socks.isBlank()) socks = env("ALL_PROXY");
        if (socks != null && socks.toLowerCase().startsWith("socks")) {
            ProxyInfo p = parse(socks);
            if (p != null) return new ProxyInfo(ProxyType.SOCKS, p.host, p.port, p.user, p.password);
        }
        String socksHost = sysProp("socksProxyHost");
        String socksPort = sysProp("socksProxyPort");
        if (socksHost != null && !socksHost.isBlank()) {
            return new ProxyInfo(ProxyType.SOCKS, socksHost, parseInt(socksPort, 1080), null, null);
        }

        // 2. HTTPS proxy (preferred for TLS traffic)
        String httpsProxy = env("HTTPS_PROXY");
        if (httpsProxy == null || httpsProxy.isBlank()) httpsProxy = env("https_proxy");
        if (httpsProxy != null && !httpsProxy.isBlank()) {
            ProxyInfo p = parse(httpsProxy);
            if (p != null) return p;
        }

        // 3. HTTP proxy
        String httpProxy = env("HTTP_PROXY");
        if (httpProxy == null || httpProxy.isBlank()) httpProxy = env("http_proxy");
        if (httpProxy == null || httpProxy.isBlank()) httpProxy = env("ALL_PROXY");
        if (httpProxy != null && !httpProxy.isBlank()) {
            ProxyInfo p = parse(httpProxy);
            if (p != null) return p;
        }

        // 4. JVM system properties (system proxy)
        String host = sysProp("https.proxyHost");
        if (host == null || host.isBlank()) host = sysProp("http.proxyHost");
        if (host != null && !host.isBlank()) {
            String port = sysProp("https.proxyPort");
            if (port == null || port.isBlank()) port = sysProp("http.proxyPort");
            String user = sysProp("https.proxyUser");
            if (user == null) user = sysProp("http.proxyUser");
            String pass = sysProp("https.proxyPassword");
            if (pass == null) pass = sysProp("http.proxyPassword");
            return new ProxyInfo(ProxyType.HTTP, host, parseInt(port, 8080), user, pass);
        }

        return null;
    }

    /** Parse "http://host:port" or "http://user:pass@host:port" */
    private static ProxyInfo parse(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try {
            String s = raw.trim();
            int schemeEnd = s.indexOf("://");
            if (schemeEnd >= 0) s = s.substring(schemeEnd + 3);
            if (s.endsWith("/")) s = s.substring(0, s.length() - 1);

            String user = null, pass = null, hostPort;
            int at = s.lastIndexOf('@');
            if (at >= 0) {
                String creds = s.substring(0, at);
                hostPort = s.substring(at + 1);
                int colon = creds.indexOf(':');
                if (colon >= 0) {
                    user = creds.substring(0, colon);
                    pass = creds.substring(colon + 1);
                } else {
                    user = creds;
                }
            } else {
                hostPort = s;
            }

            String host; int port = 8080;
            int colon = hostPort.lastIndexOf(':');
            if (colon >= 0 && hostPort.indexOf(']') < colon) {
                host = hostPort.substring(0, colon);
                port = parseInt(hostPort.substring(colon + 1), 8080);
            } else {
                host = hostPort;
            }
            if (host.isBlank()) return null;
            return new ProxyInfo(ProxyType.HTTP, host, port, user, pass);
        } catch (Exception e) {
            log.warn("Failed to parse proxy URL: {}", raw);
            return null;
        }
    }

    private static String env(String name) {
        try { return System.getenv(name); } catch (Exception e) { return null; }
    }

    private static String sysProp(String name) {
        try { return System.getProperty(name); } catch (Exception e) { return null; }
    }

    private static int parseInt(String s, int def) {
        if (s == null || s.isBlank()) return def;
        try { return Integer.parseInt(s.trim()); } catch (NumberFormatException e) { return def; }
    }
}
