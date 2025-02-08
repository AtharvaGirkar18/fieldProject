const express = require("express");
const bodyParser = require("body-parser");

const authRouter = require("./routes/authRouter");
const teacherRouter = require("./routes/teacherRouter");
const headRouter = require("./routes/headRouter");
const coordinatorRouter = require("./routes/coordinatorRouter");

const app = express();
app.set("view engine", "ejs");
app.set("views", "views");

app.use(bodyParser.urlencoded({ extended: false }));

app.use("/auth", authRouter); // Add the authentication routes
app.use("/teacher", teacherRouter);
app.use("/head", headRouter);
app.use("/coordinator", coordinatorRouter);

// Default route
app.use((req, res) => {
  res.render("index", { currentPage: "index" });
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
