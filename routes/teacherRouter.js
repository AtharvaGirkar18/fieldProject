const express = require("express");

const teacherRouter = express.Router();
const Teacher = require("../models/teacher.js");
const TeacherReport = require("../models/teacherReport.js");

const { LectureStorage } = require("../cloudConfig.js");
const multer = require('multer');
const upload = multer({ storage: LectureStorage, limits: { files: 5 } });

const { getSubmitLec } = require("../controllers/teacherController");

// Add authentication middleware
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated() && req.user.constructor.modelName === 'Teacher') {
        return next();
    }
    res.redirect("/auth/login/teacher");
};

// Apply middleware to all coordinator routes
teacherRouter.use(isAuthenticated);

teacherRouter.get("/lecture", (req, res) => {
    const { username, picture } = req.user;
    const path = picture.path;
    res.render("teacher/lecture", { username, path, currentPage: "lecture" });
});

teacherRouter.post("/lecture", upload.fields([{ name: "entryImage", maxCount: 1 }, { name: "exitImages", maxCount: 4 }]), async (req, res) => {
    try {
        // Validate file uploads
        if (!req.files || !req.files.entryImage) {
            return res.status(400).send("Entry image is required");
        }

        const { date, time, address, attendance, activity } = req.body;
        const { username } = req.user;

        // Find and update teacher
        const teacher = await Teacher.findOne({ username });
        if (!teacher) {
            return res.status(404).send("Teacher not found");
        }

        // Create report object matching schema structure
        const report = {
            date: new Date(date),
            time: new Date(`${date}T${time}`),
            address,
            attendance,
            activity,
            entry_image: {
                fieldname: req.files.entryImage[0].fieldname,
                path: req.files.entryImage[0].path
            },
            exit_images: req.files.exitImages ? req.files.exitImages.map(file => ({
                fieldname: file.fieldname,
                path: file.path
            })) : [],
            teacher: teacher._id
        };

        const newReport = new TeacherReport(report);
        const savedReport = await newReport.save();

        if (savedReport) {
            res.redirect("/");
        } else {
            res.redirect("/teacher/lecture");
        }

    } catch (error) {
        console.error("Error submitting lecture report:", error);
        res.status(500).send("Error submitting report");
    }
});

module.exports = teacherRouter;
