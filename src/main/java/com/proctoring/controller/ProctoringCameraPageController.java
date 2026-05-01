package com.proctoring.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class ProctoringCameraPageController {

    @GetMapping("/proctoring-camera/")
    public String index() {
        return "forward:/proctoring-camera/index.html";
    }

    @GetMapping("/exam-demo/")
    public String examDemo() {
        return "forward:/exam-demo/index.html";
    }

    @GetMapping("/proctor-dashboard/")
    public String proctorDashboard() {
        return "forward:/proctor-dashboard/index.html";
    }
}
