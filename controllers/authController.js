const getLoginPage = (req, res) => {
  const role = req.query.role || "guest"; // Get role from query param
  res.render("auth/login", { role, error: null }); // Always pass error (set to null)
};

const postLogin = (req, res) => {
  const { username, password, role } = req.body;

  // Dummy authentication (Replace with actual DB check)
  if (username === "admin" && password === "a") {
    // Redirect based on role
    if (role === "teacher") return res.redirect("/teacher/lecture");
    if (role === "coordinator") return res.redirect("/coordinator/coordHome");
    if (role === "head") return res.redirect("/head/headHome");
  }

  // If login fails, re-render login page with error message
  res.render("auth/login", { role, error: "Invalid credentials!" });
};

module.exports = { getLoginPage, postLogin };
