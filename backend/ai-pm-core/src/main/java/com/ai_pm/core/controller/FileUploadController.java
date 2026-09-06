package com.ai_pm.core.controller;

import com.ai_pm.common.web.ApiResponse;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;
import java.util.UUID;

import org.springframework.validation.annotation.Validated;

@Validated
@RestController
@RequestMapping("/api/v1")
public class FileUploadController {

    private final Path uploadDir = Paths.get(System.getProperty("user.dir"), "data", "uploads");

    @PostMapping("/files/upload")
    public ApiResponse<Map<String, String>> upload(@RequestParam("file") MultipartFile file) {
        try {
            if (file.getSize() > 10 * 1024 * 1024) {
                return ApiResponse.error(40000, "File too large. Maximum 10MB.");
            }

            Path dir = uploadDir;
            if (!Files.exists(dir)) Files.createDirectories(dir);

            // Generate unique filename
            String originalName = file.getOriginalFilename();
            String ext = "";
            if (originalName != null && originalName.contains(".")) {
                ext = originalName.substring(originalName.lastIndexOf("."));
            }
            String storedName = UUID.randomUUID().toString().substring(0, 8) + ext;
            Path target = dir.resolve(storedName);

            file.transferTo(target.toFile());

            String url = "/api/v1/files/view/" + storedName;
            return ApiResponse.success("File uploaded", Map.of(
                "url", url,
                "originalName", originalName != null ? originalName : storedName,
                "size", String.valueOf(file.getSize())
            ));
        } catch (IOException e) {
            return ApiResponse.error(50000, "Upload failed: " + e.getMessage());
        }
    }

    @GetMapping("/files/view/{filename}")
    public byte[] view(@PathVariable("filename") String filename) throws IOException {
        Path file = uploadDir.resolve(filename);
        if (!Files.exists(file)) throw new RuntimeException("File not found");
        return Files.readAllBytes(file);
    }
}
