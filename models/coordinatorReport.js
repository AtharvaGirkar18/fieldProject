const mongoose = require("mongoose");
const {Schema} = mongoose;
const Coordinator = require("./coordinator.js");
const TeacherReport = require("./teacherReport.js");

const coordReportSchema = new mongoose.Schema({
  coordinator: {
    type: Schema.Types.ObjectId,
    ref: Coordinator
  }, 
  date: {
    type: Date,
  },
  teacherReports: [{
    type: Schema.Types.ObjectId,
    ref: TeacherReport
  }]
});

const CoordReport = mongoose.model("CoordReport", coordReportSchema);

module.exports = CoordReport;