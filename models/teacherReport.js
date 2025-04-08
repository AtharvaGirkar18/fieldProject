const mongoose = require("mongoose");
const {Schema} = mongoose;
const Teacher = require("./teacher.js");

const teacherReportSchema = new mongoose.Schema({
    date: {
        type: Date
    },
    time: {
        type: Date
    },
    address: {
        type: String
    },
    attendance: {
        type: String,
        min: 0
    },
    activity: {
        type: String
    },
    entry_image: {
        fieldname: {
            type: String,
        },
        path: {
            type: String,
            set: (link) => link === "" ? "https://www.shutterstock.com/image-vector/sign-entry-exit-premises-pointer-260nw-1067407328.jpg" : link,
        } 
    },
    exit_image: {
        fieldname: {
            type: String,
        },
        path: {
            type: String,
            set: (link) => link === "" ? "https://www.shutterstock.com/image-vector/sign-entry-exit-premises-pointer-260nw-1067407328.jpg" : link,
        }
    },
    teacher: {
        type: Schema.Types.ObjectId,
        ref: Teacher
    }
});

const TeacherReport = mongoose.model("TeacherReport", teacherReportSchema);

module.exports = TeacherReport;