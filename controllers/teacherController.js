const getSubmitLec = (req, res, next) => {
  res.render("teacher/lecture", { currentPage: "lecture" });
};

exports.getSubmitLec = getSubmitLec;
