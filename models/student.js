const mongoose = require("mongoose");
const { Schema } = mongoose;

const studentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    teacher: { type: Schema.Types.ObjectId, ref: "Teacher", required: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const Student = mongoose.model("Student", studentSchema);

module.exports = Student;
