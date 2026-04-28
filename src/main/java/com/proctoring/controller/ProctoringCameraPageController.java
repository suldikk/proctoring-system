package com.proctoring.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ProctoringCameraPageController {

    @GetMapping("/proctoring-camera/")
    public String index() {
        return "forward:/proctoring-camera/index.html";
    }
}
